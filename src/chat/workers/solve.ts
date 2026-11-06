import { argon2id } from "@noble/hashes/argon2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { fromB64 } from "../crypto/b64";

/** Contract: chat-server docs/protocol.md section 5. */
export interface Challenge {
  id: string;
  salt: string;
  parts: number;
  bits: number;
  memKiB: number;
  iterations: number;
  multiplier: number;
  expiresAt: number;
}

const enc = new TextEncoder();

export function leadingZeroBits(bytes: Uint8Array): number {
  let n = 0;
  for (const b of bytes) {
    if (b === 0) {
      n += 8;
      continue;
    }
    n += Math.clz32(b) - 24;
    break;
  }
  return n;
}

function hashOf(c: Challenge, salt: Uint8Array, part: number, nonce: number, partSalt: Uint8Array): Uint8Array {
  const input = new Uint8Array(salt.length + 1 + 8);
  input.set(salt, 0);
  input[salt.length] = part;
  new DataView(input.buffer).setBigUint64(salt.length + 1, BigInt(nonce), true);
  return argon2id(input, partSalt, { m: c.memKiB, t: c.iterations, p: 1, dkLen: 32, maxmem: 2 ** 32 - 1 });
}

const partSaltOf = (id: string, part: number): Uint8Array => {
  const idBytes = enc.encode(id);
  const buf = new Uint8Array(idBytes.length + 1);
  buf.set(idBytes, 0);
  buf[idBytes.length] = part;
  return sha256(buf).slice(0, 16);
};

/** Finds the nonce for one part: Argon2id(salt | part | nonce) must start with `bits` zero bits. */
export function solvePart(c: Challenge, part: number, shouldStop: () => boolean = () => false): number | null {
  const salt = fromB64(c.salt);
  const partSalt = partSaltOf(c.id, part);
  for (let nonce = 0; ; nonce++) {
    if (shouldStop()) return null;
    if (leadingZeroBits(hashOf(c, salt, part, nonce, partSalt)) >= c.bits) return nonce;
  }
}
