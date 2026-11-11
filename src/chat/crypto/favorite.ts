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

/** The aad of a favourite's file: bound to the user, the favourite and the epoch like its text, and never interchangeable with that text. */
const fileAad = (userId: string, id: string, gen: number): Uint8Array => utf8(`${userId}|${id}|${gen}|file`);

/**
 * A voice message or picture saved with a favourite, sealed under the vault key and the archive constant: nonce(12) | AES-256-GCM. These are the raw
 * bytes the storage takes (protocol 10a); the chat's own ciphertext is never copied, because its key and epoch are destroyed with the chat.
 */
export async function sealFavoriteBytes(mk: Uint8Array, archive: Archive, userId: string, id: string, bytes: Uint8Array): Promise<Uint8Array> {
  const nonce = randomBytes(NONCE_LEN);
  return concat(nonce, await seal(await key(mk, archive), nonce, fileAad(userId, id, archive.gen), bytes));
}

/** Throws CipherError("decrypt") when the archive has changed (a wipe), or for the wrong user, id or key. */
export async function openFavoriteBytes(mk: Uint8Array, archive: Archive, userId: string, id: string, gen: number, sealed: Uint8Array): Promise<Uint8Array> {
  if (gen !== archive.gen || sealed.length < NONCE_LEN + 16) throw new CipherError("decrypt");
  return open(await key(mk, archive), sealed.subarray(0, NONCE_LEN), fileAad(userId, id, gen), sealed.subarray(NONCE_LEN));
}
