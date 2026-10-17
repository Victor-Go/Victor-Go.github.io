import { randomBytes, release, track } from "./secrets";

/** All 94 printable ASCII characters except space. */
export const ALPHABET = Array.from({ length: 94 }, (_, i) => String.fromCharCode(0x21 + i)).join("");

export const MIN_BITS = 256;

export function entropyBits(length: number): number {
  return length * Math.log2(ALPHABET.length);
}

/**
 * Random password with at least 256 bits of entropy (40 characters from 94 symbols = ~262 bits).
 * Bytes outside the largest multiple of the alphabet size are rejected, so there is no modulo bias.
 */
export function generatePassword(minBits: number = MIN_BITS): string {
  const length = Math.ceil(minBits / Math.log2(ALPHABET.length));
  const limit = 256 - (256 % ALPHABET.length);
  let out = "";
  while (out.length < length) {
    const buf = track(randomBytes(length * 2));
    try {
      for (const b of buf) {
        if (b < limit && out.length < length) out += ALPHABET[b % ALPHABET.length];
      }
    } finally {
      release(buf);
    }
  }
  return out;
}
