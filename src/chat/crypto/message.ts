import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { concat, importAesKey, open, seal, utf8, utf8Decode } from "../../cipher/crypto/aead";
import { CipherError } from "../../cipher/crypto/encoding";
import type { Epochs } from "../../cipher/crypto/epochs";
import { randomBytes } from "../../cipher/crypto/secrets";
import { fromB64, toB64 } from "./b64";

const VERSION = 1;
const INFO = utf8("chat/msg/v1");
const SALT_LEN = 16;
const NONCE_LEN = 12;
const HEAD_LEN = 1 + 2 + SALT_LEN + NONCE_LEN;

export const MESSAGE_MAX_CHARS = 1024;

export type Payload =
  | { k: "text"; text: string; sentAt: number }
  | { k: "voice"; voice: { id: string; ms: number }; sentAt: number };

/** What is bound to a message besides its key: moving it to another chat, sender or generation breaks decryption. */
export interface Binding {
  conv: string;
  senderId: string;
  clientMsgId: string;
  /** Group key generation; 0 for 1:1 chats. */
  gen: number;
}

const aadOf = (epoch: number, b: Binding): Uint8Array =>
  concat(Uint8Array.of(VERSION, epoch >> 8, epoch & 0xff), utf8(`${b.conv}|${b.senderId}|${b.clientMsgId}|${b.gen}`));

async function subkey(chatKey: Uint8Array, epochConstant: string, salt: Uint8Array): Promise<CryptoKey> {
  const raw = hkdf(sha256, chatKey, concat(utf8(epochConstant), salt), INFO, 32);
  try {
    return await importAesKey(raw);
  } finally {
    raw.fill(0);
  }
}

/** `ct` of protocol §9: ver(1) | epoch(2) | salt(16) | nonce(12) | AES-256-GCM. A fresh subkey per message makes random nonces safe. */
export async function encryptMessage(chatKey: Uint8Array, epochs: Epochs, payload: Payload, b: Binding): Promise<{ epoch: number; ct: string }> {
  const epoch = epochs.current;
  const constant = epochs.labels.get(epoch);
  if (constant === undefined) throw new CipherError("format");
  const salt = randomBytes(SALT_LEN);
  const nonce = randomBytes(NONCE_LEN);
  const body = await seal(await subkey(chatKey, constant, salt), nonce, aadOf(epoch, b), utf8(JSON.stringify(payload)));
  return { epoch, ct: toB64(concat(Uint8Array.of(VERSION, epoch >> 8, epoch & 0xff), salt, nonce, body)) };
}

/** The epoch id in a ciphertext's header (not authenticated until it opens), or null when it is too short or of an unknown version. */
export function epochOfCiphertext(ct: string): number | null {
  try {
    const data = fromB64(ct);
    return data.length >= HEAD_LEN + 16 && data[0] === VERSION ? (data[1] << 8) | data[2] : null;
  } catch {
    return null;
  }
}

/** Throws CipherError("decrypt") for a retired epoch, wrong key, wrong binding or tampering. */
export async function decryptMessage(chatKey: Uint8Array, epochs: Epochs, ct: string, b: Binding): Promise<Payload> {
  try {
    const data = fromB64(ct);
    if (data.length < HEAD_LEN + 16 || data[0] !== VERSION) throw new CipherError("decrypt");
    const epoch = (data[1] << 8) | data[2];
    const constant = epochs.labels.get(epoch);
    if (constant === undefined) throw new CipherError("decrypt");
    const salt = data.subarray(3, 3 + SALT_LEN);
    const nonce = data.subarray(3 + SALT_LEN, HEAD_LEN);
    const pt = await open(await subkey(chatKey, constant, salt), nonce, aadOf(epoch, b), data.subarray(HEAD_LEN));
    const payload = JSON.parse(utf8Decode(pt)) as Payload;
    if (payload.k === "text" && typeof payload.text === "string") return payload;
    if (payload.k === "voice" && typeof payload.voice?.id === "string") return payload;
    throw new CipherError("decrypt");
  } catch {
    throw new CipherError("decrypt");
  }
}
