import { describe, expect, it } from 'vitest';
import { classify } from '../query';
import { deriveWallet, detectMnemonic } from '../mnemonic';

// The BIP39 reference phrase used by the BIP44/49/84/86 test vectors.
const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
// Electrum's own test vectors (standard and SegWit seeds).
const ELECTRUM_STANDARD = 'cycle rocket west magnet parrot shuffle foot correct salt library feed song';
const ELECTRUM_SEGWIT = 'bitter grass shiver impose acquire brush forget axis eager alone wine silver';

const firstOf = (rows: ReturnType<typeof deriveWallet>, type: string) => rows.find((r) => r.type === type)?.address;

describe('detectMnemonic', () => {
  it('accepts a valid BIP39 phrase, ignoring case and extra whitespace', () => {
    expect(detectMnemonic(`  ${ABANDON.toUpperCase().replace(/ /g, '\n ')} `)).toEqual({ scheme: 'bip39', phrase: ABANDON });
  });

  it('tells Electrum seeds apart by their version prefix', () => {
    expect(detectMnemonic(ELECTRUM_STANDARD)).toEqual({ scheme: 'electrum-standard', phrase: ELECTRUM_STANDARD });
    expect(detectMnemonic(ELECTRUM_SEGWIT)).toEqual({ scheme: 'electrum-segwit', phrase: ELECTRUM_SEGWIT });
  });

  it('rejects a phrase that is neither, and ignores things that are not phrases', () => {
    expect(detectMnemonic(ABANDON.replace('about', 'abandon'))).toBe('invalid'); // bad checksum
    expect(detectMnemonic('abandon abandon notaword '.repeat(4))).toBe('invalid');
    expect(detectMnemonic('hello world')).toBeUndefined();
    expect(detectMnemonic('1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH')).toBeUndefined();
  });
});

describe('deriveWallet', () => {
  it('matches the BIP44/49/84/86 test vectors for the first receive address', () => {
    const rows = deriveWallet('bip39', ABANDON, '');
    expect(rows).toHaveLength(20);
    expect(firstOf(rows, 'p2pkh')).toBe('1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA');
    expect(firstOf(rows, 'p2sh-p2wpkh')).toBe('37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf');
    expect(firstOf(rows, 'p2wpkh')).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
    expect(firstOf(rows, 'p2tr')).toBe('bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr');
    expect(rows[0].path).toBe("m/44'/0'/0'/0/0");
  });

  it('changes every address with a passphrase', () => {
    const plain = deriveWallet('bip39', ABANDON, '', 1);
    const salted = deriveWallet('bip39', ABANDON, 'TREZOR', 1);
    expect(salted.map((r) => r.address)).not.toEqual(plain.map((r) => r.address));
    expect(salted).toHaveLength(4);
  });

  it('derives Electrum seeds on Electrum paths with a single script type', () => {
    const std = deriveWallet('electrum-standard', ELECTRUM_STANDARD, '');
    expect(std.map((r) => r.type)).toEqual(Array(5).fill('p2pkh'));
    expect(std[0]).toMatchObject({ path: 'm/0/0', address: '1NNkttn1YvVGdqBW4PR6zvc3Zx3H5owKRf' });
    const seg = deriveWallet('electrum-segwit', ELECTRUM_SEGWIT, '');
    expect(seg[0]).toMatchObject({ path: "m/0'/0/0", address: 'bc1q3g5tmkmlvxryhh843v4dz026avatc0zzr6h3af' });
  });
});

describe('classify with a seed phrase', () => {
  it('returns the scheme without deriving anything', () => {
    expect(classify(ABANDON)).toEqual({ kind: 'mnemonic', scheme: 'bip39', phrase: ABANDON });
    expect(classify(ELECTRUM_SEGWIT)).toMatchObject({ kind: 'mnemonic', scheme: 'electrum-segwit' });
  });

  it('reports an invalid phrase with its own reason', () => {
    expect(classify(ABANDON.replace('about', 'abandon'))).toEqual({ kind: 'invalid', reason: 'mnemonic' });
  });
});

describe('agreement with the /btc generator', () => {
  it('derives the same BIP84 addresses, with and without a passphrase', async () => {
    const { deriveAddresses } = await import('../../btc/crypto/wallet');
    for (const pass of ['', 'TREZOR', ' 密码 ']) {
      const scan = deriveWallet('bip39', ABANDON, pass).filter((r) => r.type === 'p2wpkh').map((r) => r.address);
      expect(deriveAddresses(ABANDON, 5, pass).map((a) => a.address)).toEqual(scan);
    }
  });
});
