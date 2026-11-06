import { PUBLIC_KEY_LEN, SEED_LEN, xwing } from "../../cipher/crypto/kem";
import type { Epochs } from "../../cipher/crypto/epochs";
import { randomBytes } from "../../cipher/crypto/secrets";
import { toB64 } from "./b64";

export interface Identity {
  /** 32-byte X-Wing seed; lives only in the vault and in memory. */
  seed: Uint8Array;
  publicKey: string;
}

export function generateIdentity(): Identity {
  const seed = randomBytes(SEED_LEN);
  const { publicKey } = xwing.keygen(seed);
  if (publicKey.length !== PUBLIC_KEY_LEN) throw new Error("unexpected key size");
  return { seed, publicKey: toB64(publicKey) };
}

export function publicKeyOf(seed: Uint8Array): string {
  return toB64(xwing.keygen(seed).publicKey);
}

/** The server's daily epochs, as the table the shared X-Wing code expects. */
export function toEpochs(list: readonly { id: number; constant: string }[], current: number): Epochs {
  return { current, labels: new Map(list.map((e) => [e.id, e.constant])) };
}
