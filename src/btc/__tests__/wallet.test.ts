import { describe, it, expect } from 'vitest';
import { deriveAddresses, generateEntropy, generateMnemonic24, isValidMnemonic24 } from '../crypto/wallet';

// Official BIP-84 test vector (mnemonic "abandon … about", no passphrase).
const BIP84 = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('wallet', () => {
  it('matches the BIP-84 test vector', () => {
    const [a0, a1] = deriveAddresses(BIP84, 2);
    expect(a0.address).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
    expect(a0.path).toBe("m/84'/0'/0'/0/0");
    expect(a1.address).toBe('bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g');
  });

  it('generates valid, distinct 24-word mnemonics', () => {
    const a = generateMnemonic24();
    const b = generateMnemonic24();
    expect(a.split(' ')).toHaveLength(24);
    expect(isValidMnemonic24(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it('rejects bad checksums, wrong length and unknown words', () => {
    expect(isValidMnemonic24(BIP84)).toBe(false); // 12 words
    const good = generateMnemonic24().split(' ');
    good[23] = good[23] === 'zoo' ? 'abandon' : 'zoo';
    expect(isValidMnemonic24(good.join(' '))).toBe(false);
    expect(isValidMnemonic24(('foo ' as string).repeat(24))).toBe(false);
  });

  it('accepts messy whitespace and case when restoring', () => {
    const m = generateMnemonic24();
    expect(isValidMnemonic24(`  ${m.toUpperCase().split(' ').join('\n ')}  `)).toBe(true);
  });

  it('mixes extra input into the entropy and never returns the raw random bytes', () => {
    const fixed = (n: number) => Uint8Array.from({ length: n }, (_, i) => i + 1);
    const plain = generateEntropy('', fixed);
    expect(generateEntropy('dice 3 5 1', fixed)).not.toEqual(plain);
    expect(plain).not.toEqual(fixed(32));
    expect(plain).toHaveLength(32);
  });

  it('refuses a dead random source (all zero / constant / wrong length)', () => {
    expect(() => generateEntropy('', (n) => new Uint8Array(n))).toThrow();
    expect(() => generateEntropy('', (n) => new Uint8Array(n).fill(7))).toThrow();
    expect(() => generateEntropy('', () => new Uint8Array(16).map((_, i) => i))).toThrow();
  });
});
