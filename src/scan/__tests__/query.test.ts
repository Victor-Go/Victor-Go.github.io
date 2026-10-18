import { describe, it, expect } from 'vitest';
import { classify, formatBtc } from '../query';

// secp256k1 generator point (private key 1) and its well-known BIP-173 address.
const G = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const TXID = 'f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16';

describe('classify', () => {
  it('detects a transaction hash, case-insensitively and ignoring whitespace', () => {
    expect(classify(`  ${TXID.toUpperCase()}\n`)).toEqual({ kind: 'tx', txid: TXID });
  });

  it('derives every standard address from a compressed public key', () => {
    const q = classify(G);
    if (q.kind !== 'pubkey') throw new Error('expected pubkey');
    const by = Object.fromEntries(q.addresses.map((a) => [a.type, a.address]));
    expect(by.p2wpkh).toBe('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
    expect(by.p2pkh).toBe('1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH');
    expect(by['p2sh-p2wpkh']).toMatch(/^3/);
    expect(by.p2tr).toMatch(/^bc1p/);
  });

  it('gives an uncompressed key only a legacy address', () => {
    const uncompressed =
      '0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8';
    const q = classify(uncompressed);
    if (q.kind !== 'pubkey') throw new Error('expected pubkey');
    expect(q.addresses.map((a) => a.type)).toEqual(['p2pkh']);
    expect(q.addresses[0].address).toBe('1EHNa6Q4Jz2uvNExL497mE43ikXhwF6kZm');
  });

  it('rejects a key that is not on the curve', () => {
    expect(classify('02' + '00'.repeat(32))).toEqual({ kind: 'invalid', reason: 'pubkey' });
  });

  it('accepts mainnet addresses and normalises upper-case bech32', () => {
    expect(classify('1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH')).toEqual({ kind: 'address', address: '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH' });
    expect(classify('BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4')).toEqual({
      kind: 'address',
      address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    });
  });

  it('rejects bad checksums, testnet addresses, wrong lengths and empty input', () => {
    expect(classify('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5').kind).toBe('invalid');
    expect(classify('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kvmsx7e').kind).toBe('invalid');
    expect(classify('abcdef')).toEqual({ kind: 'invalid', reason: 'format' });
    expect(classify('   ')).toEqual({ kind: 'invalid', reason: 'empty' });
  });
});

describe('formatBtc', () => {
  it('is exact to the satoshi', () => {
    expect(formatBtc(0)).toBe('0.00000000');
    expect(formatBtc(1)).toBe('0.00000001');
    expect(formatBtc(2_100_000_000_000_000)).toBe('21000000.00000000');
    expect(formatBtc(-150_000_000)).toBe('-1.50000000');
  });
});
