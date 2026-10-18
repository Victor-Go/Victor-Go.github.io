import { argon2idAsync } from "@noble/hashes/argon2.js";
import { CipherError, decode, encode } from "./encoding";
import { concat, importAesKey, open, seal, utf8, utf8Decode } from "./aead";
import { randomBytes, release, track } from "./secrets";

export interface KdfParams {
  /** Memory in KiB. */
  m: number;
  /** Passes. */
  t: number;
  /** Parallelism. */
  p: number;
}

/** Argon2id, 64 MiB, 3 passes, 1 lane. Stored in the ciphertext header. */
export const DEFAULT_PARAMS: KdfParams = { m: 65536, t: 3, p: 1 };

/** Upper bounds applied to untrusted headers so a crafted ciphertext can't exhaust memory/CPU. */
const MAX_M = 262144;
const MAX_T = 10;
const MAX_P = 4;

export type Kdf = (password: Uint8Array, salt: Uint8Array, params: KdfParams) => Promise<Uint8Array>;

export interface PasswordOptions {
  kdf?: Kdf;
  params?: KdfParams;
}

/** Runs Argon2id on the calling thread. The UI uses the worker-backed Kdf instead. */
export const inlineKdf: Kdf = (password, salt, { m, t, p }) =>
  argon2idAsync(password, salt, { m, t, p, dkLen: 32, maxmem: 2 ** 32 - 1 });

const VERSION = 1;
const KDF_ARGON2ID = 1;
const SALT_LEN = 16;
const NONCE_LEN = 12;
// version(1) kdf(1) m(4) t(1) p(1) salt(16) nonce(12)
const HEADER_LEN = 2 + 4 + 1 + 1 + SALT_LEN + NONCE_LEN;

function validParams({ m, t, p }: KdfParams): boolean {
  return (
    Number.isInteger(m) && Number.isInteger(t) && Number.isInteger(p) &&
    p >= 1 && p <= MAX_P && t >= 1 && t <= MAX_T && m >= 8 * p && m <= MAX_M
  );
}

function passwordBytes(password: string): Uint8Array {
  return utf8(password.normalize("NFKC"));
}

async function deriveAesKey(kdf: Kdf, password: string, salt: Uint8Array, params: KdfParams) {
  const pw = track(passwordBytes(password));
  let raw: Uint8Array | undefined;
  try {
    raw = track(await kdf(pw, salt, params));
    return await importAesKey(raw);
  } finally {
    release(pw);
    if (raw) release(raw);
  }
}

export async function encryptWithPassword(
  plaintext: Uint8Array,
  password: string,
  { kdf = inlineKdf, params = DEFAULT_PARAMS }: PasswordOptions = {},
): Promise<Uint8Array> {
  if (password.length === 0) throw new CipherError("empty-password");
  if (!validParams(params)) throw new CipherError("format");
  const salt = randomBytes(SALT_LEN);
  const nonce = randomBytes(NONCE_LEN);
  const head = new Uint8Array(HEADER_LEN);
  const view = new DataView(head.buffer);
  head[0] = VERSION;
  head[1] = KDF_ARGON2ID;
  view.setUint32(2, params.m);
  head[6] = params.t;
  head[7] = params.p;
  head.set(salt, 8);
  head.set(nonce, 8 + SALT_LEN);
  const key = await deriveAesKey(kdf, password, salt, params);
  return concat(head, await seal(key, nonce, head, plaintext));
}

export async function decryptWithPassword(
  data: Uint8Array,
  password: string,
  { kdf = inlineKdf }: PasswordOptions = {},
): Promise<Uint8Array> {
  // header + at least the 16-byte GCM tag
  if (data.length < HEADER_LEN + 16 || data[0] !== VERSION || data[1] !== KDF_ARGON2ID) {
    throw new CipherError("decrypt");
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const params: KdfParams = { m: view.getUint32(2), t: data[6], p: data[7] };
  if (!validParams(params)) throw new CipherError("decrypt");
  const head = data.subarray(0, HEADER_LEN);
  const salt = data.subarray(8, 8 + SALT_LEN);
  const nonce = data.subarray(8 + SALT_LEN, HEADER_LEN);
  try {
    const key = await deriveAesKey(kdf, password, salt, params);
    return await open(key, nonce, head, data.subarray(HEADER_LEN));
  } catch (e) {
    // A key-derivation failure says nothing about the password, so it keeps its own message.
    throw e instanceof CipherError && e.code === "kdf" ? e : new CipherError("decrypt");
  }
}

export async function encryptTextWithPassword(
  plaintext: string,
  password: string,
  options?: PasswordOptions,
): Promise<string> {
  return encode("pw", await encryptWithPassword(utf8(plaintext), password, options));
}

export async function decryptTextWithPassword(
  ciphertextText: string,
  password: string,
  options?: PasswordOptions,
): Promise<string> {
  const pt = track(await decryptWithPassword(decode("pw", ciphertextText), password, options));
  try {
    return utf8Decode(pt);
  } finally {
    release(pt);
  }
}
