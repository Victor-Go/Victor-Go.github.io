import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "./mnemonic";

/** Below this the password is flagged in red. It is only a warning; weak passwords are still accepted. */
export const WEAK_BITS = 128;

/** Bits per Han / Hangul character. Human-chosen CJK text is far from uniform over thousands of characters. */
const HAN_BITS = 8;
/** Bits per other non-ASCII character (accented letters, Cyrillic, kana, emoji...). */
const OTHER_BITS = 6;

const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890"].flatMap((r) => [r, [...r].reverse().join("")]);

/** A deliberately small list of the passwords attackers try first. */
const COMMON = [
  "password", "passw0rd", "p@ssw0rd", "123456", "12345678", "123456789", "qwerty", "abc123", "iloveyou",
  "admin", "welcome", "letmein", "monkey", "dragon", "master", "login", "princess", "sunshine", "football",
  "baseball", "shadow", "superman", "trustno1", "whatever", "freedom", "hello", "secret", "bitcoin",
  "satoshi", "wallet", "love", "test", "user", "root", "5201314", "woaini", "aini", "a1b2c3",
];

/** Only this many characters are analysed; anything past it is far beyond the warning threshold anyway. */
const MAX_ANALYSED = 512;
const MAX_UNIT = 32;
const WORDS = new Set(wordlist);
const WORD_BITS = Math.log2(wordlist.length);

const isHan = (c: string) => /[\p{Script=Han}\p{Script=Hangul}]/u.test(c);

/** Size of the ASCII alphabet an attacker must cover: the union of the classes the password uses. */
function asciiPool(chars: string[]): number {
  let pool = 0;
  if (chars.some((c) => /[a-z]/.test(c))) pool += 26;
  if (chars.some((c) => /[A-Z]/.test(c))) pool += 26;
  if (chars.some((c) => /[0-9]/.test(c))) pool += 10;
  if (chars.some((c) => /[ -/:-@[-`{-~]/.test(c))) pool += 33;
  return pool;
}

/** A phrase of BIP-39 words with a valid checksum has 11 bits per word minus one checksum bit per 3 words. */
function mnemonicBits(password: string): number | undefined {
  const tokens = password.split(/[-\s]+/).filter(Boolean);
  if (tokens.length < 12 || tokens.length % 3 !== 0 || !tokens.every((t) => wordlist.includes(t))) return undefined;
  return validateMnemonic(tokens.join(" "), wordlist) ? Math.round((tokens.length * 32) / 3) : undefined;
}

/**
 * Rough upper-bound entropy estimate in bits. Not a guarantee: it assumes the parts that are not a
 * recognised pattern are chosen uniformly, so human-chosen passwords are weaker than shown.
 *
 * The cost of a password is the cheapest way to describe it as a sequence of pieces: a single
 * character (priced by its alphabet), a repeated unit, a run like "abc" / "321", a keyboard walk,
 * a common password, or a year. Length counts, but repeating or patterned characters add little.
 * A phrase that is a valid BIP-39 mnemonic (what the generator produces) is priced by its entropy.
 */
export function estimateBits(password: string): number {
  const text = password.normalize("NFKC");
  const chars = Array.from(text).slice(0, MAX_ANALYSED);
  const n = chars.length;
  if (n === 0) return 0;

  const mnemonic = mnemonicBits(text);
  if (mnemonic !== undefined) return mnemonic;

  const pool = Math.max(2, asciiPool(chars));
  const charBits = (c: string) => (c.charCodeAt(0) < 128 ? Math.log2(pool) : isHan(c) ? HAN_BITS : OTHER_BITS);
  const lower = chars.map((c) => c.toLowerCase());

  const cost = new Array<number>(n + 1).fill(Infinity);
  cost[0] = 0;
  const relax = (to: number, bits: number) => {
    if (bits < cost[to]) cost[to] = bits;
  };

  for (let i = 0; i < n; i++) {
    const base = cost[i];
    relax(i + 1, base + charBits(chars[i]));

    // A unit repeated: "aaaa", "abab", "123123", "abandon-abandon-".
    for (let u = 1; u <= MAX_UNIT && i + 2 * u <= n; u++) {
      let end = i + u;
      while (end + u <= n && same(chars, i, end, u)) end += u;
      const r = (end - i) / u;
      if (r < 2) continue;
      const unit = chars.slice(i, i + u).reduce((sum, c) => sum + charBits(c), 0);
      relax(end, base + unit + Math.log2(r) + 1);
    }

    // Consecutive letters or digits: "abcd", "9876".
    const code = chars[i].charCodeAt(0);
    const cls = (c: string) => (/[a-z]/.test(c) ? 0 : /[A-Z]/.test(c) ? 1 : /[0-9]/.test(c) ? 2 : -1);
    if (cls(chars[i]) >= 0) {
      for (const step of [1, -1]) {
        let len = 1;
        while (i + len < n && cls(chars[i + len]) === cls(chars[i]) && chars[i + len].charCodeAt(0) === code + step * len) len++;
        for (let l = 3; l <= len; l++) relax(i + l, base + charBits(chars[i]) + Math.log2(l) + 1);
      }
    }

    // Keyboard rows, either direction: "qwerty", "poiuy".
    for (const row of KEYBOARD_ROWS) {
      let len = 0;
      const start = row.indexOf(lower[i]);
      if (start < 0) continue;
      while (i + len < n && start + len < row.length && lower[i + len] === row[start + len]) len++;
      for (let l = 3; l <= len; l++) relax(i + l, base + Math.log2(KEYBOARD_ROWS.length * 5) + Math.log2(l) + 1);
    }

    // Common passwords, ignoring case (one extra bit if any capital is used).
    for (const w of COMMON) {
      if (i + w.length > n || lower.slice(i, i + w.length).join("") !== w) continue;
      const caps = chars.slice(i, i + w.length).some((c, j) => c !== lower[i + j]);
      relax(i + w.length, base + Math.log2(COMMON.length) + (caps ? 1 : 0));
    }

    // English words from the BIP-39 list (3-8 letters), ignoring case.
    for (let len = 3; len <= 8 && i + len <= n; len++) {
      const piece = lower.slice(i, i + len).join("");
      if (!WORDS.has(piece)) continue;
      const caps = chars.slice(i, i + len).some((c, j) => c !== lower[i + j]);
      relax(i + len, base + WORD_BITS + (caps ? 1 : 0));
    }

    // Years 1900-2099.
    if (i + 4 <= n && /^(19|20)\d\d$/.test(chars.slice(i, i + 4).join(""))) relax(i + 4, base + Math.log2(200));
  }

  return Math.round(cost[n]);
}

function same(chars: string[], a: number, b: number, len: number): boolean {
  for (let k = 0; k < len; k++) if (chars[a + k] !== chars[b + k]) return false;
  return true;
}

export const isWeak = (password: string): boolean => estimateBits(password) < WEAK_BITS;
