import { decryptWithPrivateKey, encryptForPublicKey } from "../../cipher/crypto/kem";
import type { Epochs } from "../../cipher/crypto/epochs";
import { fromB64, toB64 } from "./b64";

/**
 * Key exchange does not depend on the message epochs: the wrapped key must stay openable however long the other person stays away, and a
 * message epoch is destroyed on schedule. So it uses one fixed, public label (a domain separator, not a secret). What time retires is the
 * messages, which are sealed under both the key and an epoch constant that only the server holds.
 */
export const KX_EPOCHS: Epochs = { current: 1, labels: new Map([[1, "chat-kx-v1"]]) };

/** Wraps a chat or group key to a user's X-Wing public key (X-Wing + HKDF + AES-GCM, bound to the current epoch). */
export async function wrapKey(publicKey: string, key: Uint8Array, epochs: Epochs): Promise<string> {
  return toB64(await encryptForPublicKey(fromB64(publicKey), key, epochs));
}

/** Throws a CipherError("decrypt") for a wrong key, tampering or an epoch the server no longer lists. */
export async function unwrapKey(seed: Uint8Array, wrapped: string, epochs: Epochs): Promise<Uint8Array> {
  return decryptWithPrivateKey(seed, fromB64(wrapped), epochs);
}
