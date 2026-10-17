import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

/** 24 words = 256 bits of entropy + 8 checksum bits (BIP-39). */
export const WORD_COUNT = 24;
export const ENTROPY_BITS = 256;
export const SEPARATOR = "-";

/**
 * BIP-39 mnemonic (English 2048-word list, 256-bit entropy from crypto.getRandomValues),
 * joined with "-" and no trailing separator.
 */
export function generateMnemonicPassword(): string {
  return generateMnemonic(wordlist, ENTROPY_BITS).split(" ").join(SEPARATOR);
}

export function isValidMnemonicPassword(text: string): boolean {
  return text.split(SEPARATOR).length === WORD_COUNT && text.split(SEPARATOR).every((w) => wordlist.includes(w));
}

export { wordlist };
