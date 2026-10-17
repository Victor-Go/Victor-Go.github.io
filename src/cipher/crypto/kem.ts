import { ml_kem768_x25519 } from "@noble/post-quantum/hybrid.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { CipherError, decode, encode } from "./encoding";
import { concat, importAesKey, open, seal, utf8, utf8Decode } from "./aead";
import { randomBytes, release, track } from "./secrets";

/** noble ships X-Wing (draft-connolly-cfrg-xwing-kem) under this export name. */
export const xwing = ml_kem768_x25519;

export const VERSION = 1;
export const SUITE_XWING = 1;
export const HEADER = Uint8Array.of(VERSION, SUITE_XWING);
export const KEM_CT_LEN = 1120;
export const PUBLIC_KEY_LEN = 1216;
export const SEED_LEN = 32;
const INFO_LABEL = utf8("cipher/v1");

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

/** HKDF-SHA256(shared, info = "cipher/v1" || kem_ct) -> 32-byte AES key || 12-byte nonce. */
async function deriveKeyAndNonce(shared: Uint8Array, kemCt: Uint8Array) {
  const okm = track(hkdf(sha256, shared, undefined, concat(INFO_LABEL, kemCt), 44));
  try {
    const key = await importAesKey(okm.subarray(0, 32));
    return { key, nonce: okm.slice(32, 44) };
  } finally {
    release(okm);
  }
}

export async function encryptForPublicKey(publicKey: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
  if (publicKey.length !== PUBLIC_KEY_LEN) throw new CipherError("format");
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
    const { key, nonce } = await deriveKeyAndNonce(shared, kemCt);
    const aad = concat(HEADER, kemCt);
    const body = await seal(key, nonce, aad, plaintext);
    return concat(HEADER, kemCt, body);
  } finally {
    release(shared);
  }
}

export async function decryptWithPrivateKey(seed: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  if (seed.length !== SEED_LEN) throw new CipherError("format");
  // header + kem_ct + at least the 16-byte GCM tag
  if (data.length < HEADER.length + KEM_CT_LEN + 16) throw new CipherError("decrypt");
  if (data[0] !== VERSION || data[1] !== SUITE_XWING) throw new CipherError("decrypt");
  const kemCt = data.subarray(HEADER.length, HEADER.length + KEM_CT_LEN);
  const body = data.subarray(HEADER.length + KEM_CT_LEN);
  const sk = track(seed.slice());
  let shared: Uint8Array | undefined;
  try {
    shared = track(xwing.decapsulate(kemCt, sk));
    const { key, nonce } = await deriveKeyAndNonce(shared, kemCt);
    return await open(key, nonce, concat(HEADER, kemCt), body);
  } catch {
    throw new CipherError("decrypt");
  } finally {
    release(sk);
    if (shared) release(shared);
  }
}

export async function encryptTextForPublicKey(publicText: string, plaintext: string): Promise<string> {
  const pk = decode("public", publicText);
  return encode("kx", await encryptForPublicKey(pk, utf8(plaintext)));
}

export async function decryptTextWithPrivateKey(privateText: string, ciphertextText: string): Promise<string> {
  const seed = track(decode("private", privateText));
  try {
    const data = decode("kx", ciphertextText);
    const pt = track(await decryptWithPrivateKey(seed, data));
    try {
      return utf8Decode(pt);
    } finally {
      release(pt);
    }
  } finally {
    release(seed);
  }
}
