import { sha256 } from "@noble/hashes/sha2.js";
import { utf8 } from "../../cipher/crypto/aead";
import { normalizePassword, canonicalHandle } from "../validation";

/**
 * DEV PASSWORD AUTH, a stand-in for OPAQUE (protocol §6, pending the Go <-> browser interop spike).
 * Argon2id turns password + handle into 64 bytes: the first 32 are sent to the server as `authKey`,
 * the last 32 stay here as the key-encryption key for the vault master key. Unlike OPAQUE the server
 * could mount an offline guess against `authKey`, so this must be replaced before real use.
 * Keep this the only module that knows how passwords become keys, so swapping it is local.
 */
export interface Argon2Params {
  m: number;
  t: number;
  p: number;
  dkLen: number;
}
export type Kdf = (password: Uint8Array, salt: Uint8Array, params: Argon2Params) => Promise<Uint8Array>;

export const DEV_AUTH_PARAMS = { m: 19456, t: 2, p: 1, dkLen: 64 } as const;

export interface DerivedAuth {
  authKey: Uint8Array;
  kek: Uint8Array;
}

export async function deriveAuth(password: string, handle: string, kdf: Kdf, params: Argon2Params = DEV_AUTH_PARAMS): Promise<DerivedAuth> {
  const salt = sha256(utf8(`chat/dev-auth/v1|${canonicalHandle(handle)}`)).slice(0, 16);
  const pw = utf8(normalizePassword(password));
  const out = await kdf(pw, salt, params);
  const authKey = out.slice(0, 32);
  const kek = out.slice(32, 64);
  out.fill(0);
  return { authKey, kek };
}
