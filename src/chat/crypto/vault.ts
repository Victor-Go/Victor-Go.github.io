import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { concat, importAesKey, open, seal, utf8, utf8Decode } from "../../cipher/crypto/aead";
import { CipherError } from "../../cipher/crypto/encoding";
import { randomBytes } from "../../cipher/crypto/secrets";
import { fromB64, toB64 } from "./b64";

const NONCE_LEN = 12;
const AAD_MK = utf8("chat/mk/v1");
const INFO_REC = "vault/rec/v1";

/** The vault master key: random, wrapped by a key derived from the password. A password change only re-wraps it. */
export const newMasterKey = (): Uint8Array => randomBytes(32);

export async function wrapMasterKey(mk: Uint8Array, kek: Uint8Array): Promise<string> {
  const nonce = randomBytes(NONCE_LEN);
  return toB64(concat(nonce, await seal(await importAesKey(kek), nonce, AAD_MK, mk)));
}

/** Throws CipherError("decrypt") when the password (hence the key) is wrong. */
export async function unwrapMasterKey(wrapped: string, kek: Uint8Array): Promise<Uint8Array> {
  const data = fromB64(wrapped);
  if (data.length < NONCE_LEN + 16) throw new CipherError("decrypt");
  return open(await importAesKey(kek), data.subarray(0, NONCE_LEN), AAD_MK, data.subarray(NONCE_LEN));
}

async function recordKey(mk: Uint8Array, recordId: string): Promise<CryptoKey> {
  const raw = hkdf(sha256, mk, undefined, utf8(`${INFO_REC}|${recordId}`), 32);
  try {
    return await importAesKey(raw);
  } finally {
    raw.fill(0);
  }
}

const aad = (userId: string, recordId: string, version: number): Uint8Array => utf8(`${userId}|${recordId}|${version}`);

/** One vault record, encrypted under its own subkey and bound to the user, the record id and its version. */
export async function sealRecord(mk: Uint8Array, userId: string, recordId: string, version: number, value: unknown): Promise<string> {
  const nonce = randomBytes(NONCE_LEN);
  const body = await seal(await recordKey(mk, recordId), nonce, aad(userId, recordId, version), utf8(JSON.stringify(value)));
  return toB64(concat(nonce, body));
}

export async function openRecord<T>(mk: Uint8Array, userId: string, recordId: string, version: number, ciphertext: string): Promise<T> {
  const data = fromB64(ciphertext);
  if (data.length < NONCE_LEN + 16) throw new CipherError("decrypt");
  const pt = await open(await recordKey(mk, recordId), data.subarray(0, NONCE_LEN), aad(userId, recordId, version), data.subarray(NONCE_LEN));
  return JSON.parse(utf8Decode(pt)) as T;
}
