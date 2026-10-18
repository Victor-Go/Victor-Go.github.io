import { describe, it, expect } from 'vitest';
import { estimateBits, isWeak, WEAK_BITS } from '../crypto/strength';
import { generateMnemonicPassword } from '../crypto/mnemonic';

/** Deterministic pseudo-random picks, so the "random" samples below are stable between runs. */
function pick(count: number, alphabet: string[], seed = 12345): string {
  let x = seed;
  let out = '';
  for (let i = 0; i < count; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    out += alphabet[Math.floor(x / 65536) % alphabet.length];
  }
  return out;
}
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => String.fromCodePoint(from + i));
const DIGITS = range(48, 57);
const LOWER = range(97, 122);
const ASCII = range(33, 126);
const HAN = range(0x4e00, 0x4e00 + 3000);

describe('password strength estimate', () => {
  it('is 0 for empty and flags short passwords as weak', () => {
    expect(estimateBits('')).toBe(0);
    expect(isWeak('hunter2')).toBe(true);
    expect(isWeak('password123')).toBe(true);
  });

  it('counts length, not distinct characters: long digit and letter strings are strong', () => {
    expect(estimateBits(pick(50, DIGITS))).toBeGreaterThanOrEqual(WEAK_BITS);
    expect(isWeak(pick(50, DIGITS))).toBe(false);
    expect(isWeak(pick(32, LOWER))).toBe(false);
    expect(isWeak(pick(24, ASCII))).toBe(false);
    expect(isWeak(pick(12, ASCII))).toBe(true);
  });

  it('does not credit repeated characters or repeated units', () => {
    expect(estimateBits('aaaaaaaaaaaaaaaaaaaaaaaa')).toBeLessThan(20);
    expect(estimateBits('a'.repeat(100_000))).toBeLessThan(30);
    expect(estimateBits('abcabcabcabcabcabc')).toBeLessThan(30);
    expect(estimateBits('Xk9#-'.repeat(20))).toBeLessThan(60);
  });

  it('gives little credit to sequences, keyboard walks, years and common passwords', () => {
    expect(estimateBits('abcdefghijklmnopqrstuvwxyz')).toBeLessThan(25);
    expect(estimateBits('9876543210')).toBeLessThan(25);
    expect(estimateBits('qwertyuiopasdfghjkl')).toBeLessThan(30);
    expect(estimateBits('19901234')).toBeLessThan(30);
    expect(estimateBits('Password123!')).toBeLessThan(40);
    expect(estimateBits('iloveyou')).toBeLessThan(15);
  });

  it('gives each character its own price instead of inflating the whole password', () => {
    // One non-ASCII character adds its own cost; it does not re-price the ASCII ones.
    expect(estimateBits('hunter2你')).toBe(estimateBits('hunter2') + 8);
    expect(estimateBits('hunter2é')).toBe(estimateBits('hunter2') + 6);
    expect(isWeak('password你')).toBe(true);
  });

  it('prices Chinese text conservatively per character', () => {
    expect(estimateBits('我爱你中国')).toBe(40);
    expect(estimateBits('春江花月夜暮色苍茫山高水远')).toBe(104);
    expect(isWeak('春江花月夜暮色苍茫山高水远')).toBe(true);
    expect(isWeak(pick(20, HAN))).toBe(false);
    expect(estimateBits('我爱你我爱你我爱你')).toBeLessThan(30);
  });

  it('gives common English words a word price, not a per-letter price', () => {
    expect(estimateBits('horsebatterystaple')).toBeLessThan(estimateBits(pick(18, LOWER)));
  });

  it('prices only real BIP-39 mnemonics by their entropy', () => {
    const pw = generateMnemonicPassword();
    expect(estimateBits(pw)).toBe(256);
    expect(isWeak(pw)).toBe(false);
    expect(estimateBits(Array(11).fill('abandon').concat('about').join(' '))).toBe(128);
    // 24 copies of one word is not a valid mnemonic and must not be credited 11 bits per word.
    expect(isWeak(Array(24).fill('abandon').join('-'))).toBe(true);
  });

  it('treats a long mixed random-looking password as strong', () => {
    expect(estimateBits('Tq9#vL2$xW8!mZ4&kR7^pB3@')).toBeGreaterThanOrEqual(WEAK_BITS);
  });
});
