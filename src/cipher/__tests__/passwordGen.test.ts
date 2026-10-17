import { describe, it, expect, vi, afterEach } from 'vitest';
import { generatePassword, ALPHABET, entropyBits, MIN_BITS } from '../crypto/passwordGen';

afterEach(() => vi.restoreAllMocks());

describe('random password generator', () => {
  it('has at least 256 bits of entropy', () => {
    expect(ALPHABET.length).toBe(94);
    const pw = generatePassword();
    expect(pw.length).toBe(40);
    expect(entropyBits(pw.length)).toBeGreaterThanOrEqual(256);
    expect(MIN_BITS).toBe(256);
  });

  it('uses only the alphabet and differs every time', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const pw = generatePassword();
      expect([...pw].every((c) => ALPHABET.includes(c))).toBe(true);
      seen.add(pw);
    }
    expect(seen.size).toBe(200);
  });

  it('draws from crypto.getRandomValues, never Math.random', () => {
    const rnd = vi.spyOn(Math, 'random');
    const grv = vi.spyOn(crypto, 'getRandomValues');
    generatePassword();
    expect(grv).toHaveBeenCalled();
    expect(rnd).not.toHaveBeenCalled();
  });

  it('rejects out-of-range bytes instead of using modulo (no bias)', () => {
    // 94 * 2 = 188: bytes 188..255 must be discarded.
    let call = 0;
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(((buf: Uint8Array) => {
      buf.fill(call++ === 0 ? 255 : 0);
      return buf;
    }) as typeof crypto.getRandomValues);
    const pw = generatePassword();
    expect(pw).toBe(ALPHABET[0].repeat(40));
  });

  it('has roughly uniform character frequencies', () => {
    const counts = new Map<string, number>();
    const n = 2000;
    for (let i = 0; i < n; i++) for (const c of generatePassword()) counts.set(c, (counts.get(c) ?? 0) + 1);
    const expected = (n * 40) / ALPHABET.length; // ~851
    for (const c of ALPHABET) {
      const got = counts.get(c) ?? 0;
      expect(Math.abs(got - expected)).toBeLessThan(expected * 0.2);
    }
  });
});
