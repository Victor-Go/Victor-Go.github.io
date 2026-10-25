import { argon2idAsync } from "@noble/hashes/argon2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { CipherError, decode, encode } from "./encoding";
import { concat, importAesKey, open, seal, utf8, utf8Decode } from "./aead";
import { randomBytes, release, track } from "./secrets";
import { LEGACY_EPOCH, type Epochs } from "./epochs";
import { getEpochs } from "./epochsEnv";

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
  epochs?: Epochs;
}

/** Runs Argon2id on the calling thread. The UI uses the worker-backed Kdf instead. */
export const inlineKdf: Kdf = (password, salt, { m, t, p }) =>
  argon2idAsync(password, salt, { m, t, p, dkLen: 32, maxmem: 2 ** 32 - 1 });

const VERSION_LEGACY = 1;
const VERSION = 2;
const KDF_ARGON2ID = 1;
const SALT_LEN = 16;
const NONCE_LEN = 12;
const TAG_LEN = 16;
const INFO = utf8("cipher/pw/v2");
// v1: version(1) kdf(1) m(4) t(1) p(1) salt(16) nonce(12)
const LEGACY_HEADER_LEN = 2 + 4 + 1 + 1 + SALT_LEN + NONCE_LEN;
// v2: version(1) kdf(1) epoch(2) m(4) t(1) p(1) salt(16) nonce(12)
const HEADER_LEN = LEGACY_HEADER_LEN + 2;

export function validParams({ m, t, p }: KdfParams): boolean {
  return (
    Number.isInteger(m) && Number.isInteger(t) && Number.isInteger(p) &&
    p >= 1 && p <= MAX_P && t >= 1 && t <= MAX_T && m >= 8 * p && m <= MAX_M
  );
}

function passwordBytes(password: string): Uint8Array {
  return utf8(password.normalize("NFKC"));
}

/** Argon2id output; v2 additionally binds the epoch constant through HKDF. `label` is undefined for v1. */
async function deriveAesKey(kdf: Kdf, password: string, salt: Uint8Array, params: KdfParams, label?: string) {
  return deriveKey(kdf, password, salt, params, label, INFO);
}

/** Shared by text and file encryption; `info` separates the two key domains. */
export async function deriveKey(
  kdf: Kdf,
  password: string,
  salt: Uint8Array,
  params: KdfParams,
  label: string | undefined,
  info: Uint8Array,
) {
  const pw = track(passwordBytes(password));
  let raw: Uint8Array | undefined;
  let okm: Uint8Array | undefined;
  try {
    raw = track(await kdf(pw, salt, params));
    if (label === undefined) return await importAesKey(raw);
    okm = track(hkdf(sha256, raw, utf8(label), info, 32));
    return await importAesKey(okm);
  } finally {
    release(pw);
    if (raw) release(raw);
    if (okm) release(okm);
  }
}

export async function encryptWithPassword(
  plaintext: Uint8Array,
  password: string,
  { kdf = inlineKdf, params = DEFAULT_PARAMS, epochs = getEpochs() }: PasswordOptions = {},
): Promise<Uint8Array> {
  if (password.length === 0) throw new CipherError("empty-password");
  if (!validParams(params)) throw new CipherError("format");
  const label = epochs.labels.get(epochs.current);
  if (label === undefined) throw new CipherError("format");
  const salt = randomBytes(SALT_LEN);
  const nonce = randomBytes(NONCE_LEN);
  const head = new Uint8Array(HEADER_LEN);
  const view = new DataView(head.buffer);
  head[0] = VERSION;
  head[1] = KDF_ARGON2ID;
  view.setUint16(2, epochs.current);
  view.setUint32(4, params.m);
  head[8] = params.t;
  head[9] = params.p;
  head.set(salt, 10);
  head.set(nonce, 10 + SALT_LEN);
  const key = await deriveAesKey(kdf, password, salt, params, label);
  return concat(head, await seal(key, nonce, head, plaintext));
}

interface Header {
  epoch: number;
  params: KdfParams;
  salt: Uint8Array;
  nonce: Uint8Array;
  len: number;
}

/** Returns null for anything that is not a well-formed v1 or v2 header. */
function parseHeader(data: Uint8Array): Header | null {
  const legacy = data[0] === VERSION_LEGACY;
  if (!legacy && data[0] !== VERSION) return null;
  const len = legacy ? LEGACY_HEADER_LEN : HEADER_LEN;
  if (data.length < len + TAG_LEN || data[1] !== KDF_ARGON2ID) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const epoch = legacy ? LEGACY_EPOCH : view.getUint16(2);
  if (!legacy && epoch === LEGACY_EPOCH) return null;
  const o = legacy ? 2 : 4;
  const params: KdfParams = { m: view.getUint32(o), t: data[o + 4], p: data[o + 5] };
  if (!validParams(params)) return null;
  return {
    epoch,
    params,
    salt: data.subarray(o + 6, o + 6 + SALT_LEN),
    nonce: data.subarray(o + 6 + SALT_LEN, len),
    len,
  };
}

export async function decryptWithPassword(
  data: Uint8Array,
  password: string,
  { kdf = inlineKdf, epochs = getEpochs() }: PasswordOptions = {},
): Promise<Uint8Array> {
  const h = parseHeader(data);
  if (!h) throw new CipherError("decrypt");
  const known = epochs.labels.has(h.epoch);
  // A retired epoch still pays for the full Argon2id run so it can't be told apart by timing.
  const label = h.epoch === LEGACY_EPOCH ? undefined : (epochs.labels.get(h.epoch) ?? "");
  try {
    const key = await deriveAesKey(kdf, password, h.salt, h.params, label);
    if (!known) throw new CipherError("decrypt");
    return await open(key, h.nonce, data.subarray(0, h.len), data.subarray(h.len));
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
