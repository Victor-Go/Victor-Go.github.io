import { describe, it, expect, vi, afterEach } from 'vitest';
import { validateMnemonic } from '@scure/bip39';
import { generateMnemonicPassword, isValidMnemonicPassword, wordlist, WORD_COUNT, SEPARATOR } from '../crypto/mnemonic';

afterEach(() => vi.restoreAllMocks());

describe('BIP-39 mnemonic password', () => {
  it('uses the standard 2048-word English list', () => {
    expect(wordlist).toHaveLength(2048);
    expect(wordlist[0]).toBe('abandon');
    expect(wordlist[2047]).toBe('zoo');
  });

  it('has 24 words joined by "-", no leading or trailing separator', () => {
    const pw = generateMnemonicPassword();
    expect(pw.startsWith(SEPARATOR)).toBe(false);
    expect(pw.endsWith(SEPARATOR)).toBe(false);
    expect(pw).not.toContain(' ');
    expect(pw.split(SEPARATOR)).toHaveLength(WORD_COUNT);
    expect(isValidMnemonicPassword(pw)).toBe(true);
  });

  it('passes the BIP-39 checksum and differs every time', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const pw = generateMnemonicPassword();
      expect(validateMnemonic(pw.split(SEPARATOR).join(' '), wordlist)).toBe(true);
      seen.add(pw);
    }
    expect(seen.size).toBe(100);
  });

  it('draws from crypto.getRandomValues, never Math.random', () => {
    const rnd = vi.spyOn(Math, 'random');
    const grv = vi.spyOn(crypto, 'getRandomValues');
    generateMnemonicPassword();
    expect(grv).toHaveBeenCalled();
    expect(rnd).not.toHaveBeenCalled();
  });

  it('rejects malformed values', () => {
    expect(isValidMnemonicPassword('abandon-abandon')).toBe(false);
    expect(isValidMnemonicPassword(Array(24).fill('notaword').join('-'))).toBe(false);
  });
});
