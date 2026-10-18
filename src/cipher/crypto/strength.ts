import { wordlist } from "./mnemonic";

/** Below this the password is flagged in red. It is only a warning; weak passwords are still accepted. */
export const WEAK_BITS = 128;

const words = new Set(wordlist);
const BITS_PER_WORD = Math.log2(wordlist.length);

/** Charset size by class: lowercase, uppercase, digits, ASCII symbols, everything else (e.g. CJK). */
function poolSize(chars: string[]): number {
  let pool = 0;
  if (chars.some((c) => /[a-z]/.test(c))) pool += 26;
  if (chars.some((c) => /[A-Z]/.test(c))) pool += 26;
  if (chars.some((c) => /[0-9]/.test(c))) pool += 10;
  if (chars.some((c) => /[ -/:-@[-`{-~]/.test(c))) pool += 33;
  if (chars.some((c) => c.codePointAt(0)! > 127)) pool += 2000;
  return pool;
}

/**
 * Rough upper-bound entropy estimate in bits. Not a guarantee: it assumes characters are chosen
 * uniformly, so human-chosen passwords are weaker than shown. Repeated characters add nothing,
 * and a phrase made only of BIP-39 words counts 11 bits per word (the generator's format).
 */
export function estimateBits(password: string): number {
  const chars = Array.from(password.normalize("NFKC"));
  if (chars.length === 0) return 0;
  const tokens = password.split(/[-\s]+/).filter(Boolean);
  if (tokens.length > 0 && tokens.every((t) => words.has(t))) {
    return Math.round(tokens.length * BITS_PER_WORD);
  }
  const unique = new Set(chars).size;
  return Math.round(unique * Math.log2(poolSize(chars)));
}

export const isWeak = (password: string): boolean => estimateBits(password) < WEAK_BITS;
