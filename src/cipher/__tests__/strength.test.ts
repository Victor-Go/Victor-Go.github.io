import { describe, it, expect } from 'vitest';
import { estimateBits, isWeak, WEAK_BITS } from '../crypto/strength';
import { generateMnemonicPassword } from '../crypto/mnemonic';

describe('password strength estimate', () => {
  it('is 0 for empty and flags short passwords as weak', () => {
    expect(estimateBits('')).toBe(0);
    expect(isWeak('hunter2')).toBe(true);
    expect(isWeak('password123')).toBe(true);
  });

  it('does not credit repeated characters', () => {
    expect(estimateBits('aaaaaaaaaaaaaaaaaaaaaaaa')).toBe(estimateBits('a'));
    expect(isWeak('aaaaaaaaaaaaaaaaaaaaaaaa')).toBe(true);
  });

  it('counts a generated 24-word mnemonic as 264 bits and not weak', () => {
    const pw = generateMnemonicPassword();
    expect(estimateBits(pw)).toBe(264);
    expect(isWeak(pw)).toBe(false);
  });

  it('treats a long mixed random-looking password as strong', () => {
    expect(estimateBits('Tq9#vL2$xW8!mZ4&kR7^pB3@')).toBeGreaterThanOrEqual(WEAK_BITS);
  });
});
