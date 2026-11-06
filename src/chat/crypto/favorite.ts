import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { concat, importAesKey, open, seal, utf8, utf8Decode } from "../../cipher/crypto/aead";
import { CipherError } from "../../cipher/crypto/encoding";
import { randomBytes } from "../../cipher/crypto/secrets";
import { fromB64, toB64 } from "./b64";

/**
 * A favourite epoch: `gen` is its id, `constant` is held by the server. Favourite epochs are not tied to time, only an administrator makes and
 * destroys them, so a favourite outlives the message retention period but not its epoch: once the server drops the constant, the text cannot be opened.
 */
export interface Archive {
  gen: number;
  constant: string;
}

const NONCE_LEN = 12;

async function key(mk: Uint8Array, archive: Archive): Promise<CryptoKey> {
  const raw = hkdf(sha256, mk, utf8(archive.constant), utf8(`chat/fav/v1|${archive.gen}`), 32);
  try {
    return await importAesKey(raw);
  } finally {
    raw.fill(0);
  }
}

const aad = (userId: string, id: string, gen: number): Uint8Array => utf8(`${userId}|${id}|${gen}`);

/** The favourite's text, sealed under the vault key and the archive constant (on top of the vault's own encryption). */
export async function sealFavoriteText(mk: Uint8Array, archive: Archive, userId: string, id: string, text: string): Promise<string> {
  const nonce = randomBytes(NONCE_LEN);
  return toB64(concat(nonce, await seal(await key(mk, archive), nonce, aad(userId, id, archive.gen), utf8(text))));
}

/** Throws CipherError("decrypt") when the archive has changed (a wipe), or for the wrong user, id or key. */
export async function openFavoriteText(mk: Uint8Array, archive: Archive, userId: string, id: string, gen: number, sealed: string): Promise<string> {
  if (gen !== archive.gen) throw new CipherError("decrypt");
  const data = fromB64(sealed);
  if (data.length < NONCE_LEN + 16) throw new CipherError("decrypt");
  return utf8Decode(await open(await key(mk, archive), data.subarray(0, NONCE_LEN), aad(userId, id, gen), data.subarray(NONCE_LEN)));
}
