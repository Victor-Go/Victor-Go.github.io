import { ml_kem768_x25519 } from "@noble/post-quantum/hybrid.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { CipherError, decode, encode } from "./encoding";
import { concat, importAesKey, open, seal, utf8, utf8Decode } from "./aead";
import { randomBytes, release, track } from "./secrets";
import { LEGACY_EPOCH, type Epochs } from "./epochs";
import { getEpochs } from "./epochsEnv";

/** noble ships X-Wing (draft-connolly-cfrg-xwing-kem) under this export name. */
export const xwing = ml_kem768_x25519;

export const VERSION_LEGACY = 1;
export const VERSION = 2;
export const SUITE_XWING = 1;
export const KEM_CT_LEN = 1120;
export const PUBLIC_KEY_LEN = 1216;
export const SEED_LEN = 32;
const TAG_LEN = 16;
const INFO_LEGACY = utf8("cipher/v1");
const INFO = utf8("cipher/kx/v2");

export interface KeyPair {
  publicText: string;
  privateText: string;
}

export async function generateKeyPair(): Promise<KeyPair> {
  const seed = track(randomBytes(SEED_LEN));
  try {
    const { publicKey } = xwing.keygen(seed);
    return { publicText: encode("public", publicKey), privateText: encode("private", seed) };
  } finally {
    release(seed);
  }
}

/**
 * v2: HKDF-SHA256(shared, salt = epoch constant, info = "cipher/kx/v2" || kem_ct).
 * v1 (label undefined): no salt, info = "cipher/v1" || kem_ct. Output is AES key (32) || nonce (12).
 */
async function deriveKeyAndNonce(shared: Uint8Array, kemCt: Uint8Array, label?: string) {
  const okm = track(
    label === undefined
      ? hkdf(sha256, shared, undefined, concat(INFO_LEGACY, kemCt), 44)
      : hkdf(sha256, shared, utf8(label), concat(INFO, kemCt), 44),
  );
  try {
    const key = await importAesKey(okm.subarray(0, 32));
    return { key, nonce: okm.slice(32, 44) };
  } finally {
    release(okm);
  }
}

export async function encryptForPublicKey(
  publicKey: Uint8Array,
  plaintext: Uint8Array,
  epochs: Epochs = getEpochs(),
): Promise<Uint8Array> {
  if (publicKey.length !== PUBLIC_KEY_LEN) throw new CipherError("format");
  const label = epochs.labels.get(epochs.current);
  if (label === undefined) throw new CipherError("format");
  let shared: Uint8Array;
  let kemCt: Uint8Array;
  try {
    const r = xwing.encapsulate(publicKey);
    shared = track(r.sharedSecret);
    kemCt = r.cipherText;
  } catch {
    throw new CipherError("format");
  }
  try {
    const { key, nonce } = await deriveKeyAndNonce(shared, kemCt, label);
    const head = Uint8Array.of(VERSION, SUITE_XWING, epochs.current >> 8, epochs.current & 0xff);
    const body = await seal(key, nonce, concat(head, kemCt), plaintext);
    return concat(head, kemCt, body);
  } finally {
    release(shared);
  }
}

export async function decryptWithPrivateKey(
  seed: Uint8Array,
  data: Uint8Array,
  epochs: Epochs = getEpochs(),
): Promise<Uint8Array> {
  if (seed.length !== SEED_LEN) throw new CipherError("format");
  const legacy = data[0] === VERSION_LEGACY;
  if ((!legacy && data[0] !== VERSION) || data[1] !== SUITE_XWING) throw new CipherError("decrypt");
  const hlen = legacy ? 2 : 4;
  // header + kem_ct + at least the 16-byte GCM tag
  if (data.length < hlen + KEM_CT_LEN + TAG_LEN) throw new CipherError("decrypt");
  const epoch = legacy ? LEGACY_EPOCH : (data[2] << 8) | data[3];
  if (!legacy && epoch === LEGACY_EPOCH) throw new CipherError("decrypt");
  const head = data.subarray(0, hlen);
  const kemCt = data.subarray(hlen, hlen + KEM_CT_LEN);
  const body = data.subarray(hlen + KEM_CT_LEN);
  const sk = track(seed.slice());
  let shared: Uint8Array | undefined;
  try {
    shared = track(xwing.decapsulate(kemCt, sk));
    // Decapsulate first so a retired epoch costs the same as any other failure.
    const known = epochs.labels.has(epoch);
    const { key, nonce } = await deriveKeyAndNonce(shared, kemCt, legacy ? undefined : (epochs.labels.get(epoch) ?? ""));
    if (!known) throw new CipherError("decrypt");
    return await open(key, nonce, concat(head, kemCt), body);
  } catch {
    throw new CipherError("decrypt");
  } finally {
    release(sk);
    if (shared) release(shared);
  }
}

export async function encryptTextForPublicKey(
  publicText: string,
  plaintext: string,
  epochs?: Epochs,
): Promise<string> {
  const pk = decode("public", publicText);
  return encode("kx", await encryptForPublicKey(pk, utf8(plaintext), epochs));
}

export async function decryptTextWithPrivateKey(
  privateText: string,
  ciphertextText: string,
  epochs?: Epochs,
): Promise<string> {
  const seed = track(decode("private", privateText));
  try {
    const data = decode("kx", ciphertextText);
    const pt = track(await decryptWithPrivateKey(seed, data, epochs));
    try {
      return utf8Decode(pt);
    } finally {
      release(pt);
    }
  } finally {
    release(seed);
  }
}
