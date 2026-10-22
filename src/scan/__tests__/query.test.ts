import { describe, it, expect } from 'vitest';
import { classify, formatBtc } from '../query';
import { GENESIS_RAW } from './fixtures';

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
    expect(q.addresses.map((a) => a.type)).toEqual(['p2pkh', 'p2pk']);
    expect(q.addresses[0].address).toBe('1EHNa6Q4Jz2uvNExL497mE43ikXhwF6kZm');
  });

  it('adds the 2009-era pay-to-pubkey script, keyed by script rather than address', () => {
    const q = classify(G);
    if (q.kind !== 'pubkey') throw new Error('expected pubkey');
    const p2pk = q.addresses.find((a) => a.type === 'p2pk');
    expect(p2pk).toEqual({ type: 'p2pk', address: G, script: '21' + G + 'ac' });
  });

  it('turns a WIF private key into the same addresses as its public key, compressed or not', () => {
    const c = classify('KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn');
    if (c.kind !== 'pubkey') throw new Error('expected pubkey');
    expect(c.fromPrivateKey).toBe(true);
    expect(c.addresses.find((a) => a.type === 'p2wpkh')?.address).toBe('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
    const u = classify('5HpHagT65TZzG1PH3CSu63k8DbpvD8s5ip4nEB3kEsreAnchuDf');
    if (u.kind !== 'pubkey') throw new Error('expected pubkey');
    expect(u.addresses[0].address).toBe('1EHNa6Q4Jz2uvNExL497mE43ikXhwF6kZm');
    expect(classify('KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWm')).toEqual({ kind: 'invalid', reason: 'wif' });
  });

  it('tells a block hash from a transaction hash, and reads heights', () => {
    const genesis = '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f';
    expect(classify(genesis)).toEqual({ kind: 'block', ref: { hash: genesis } });
    expect(classify('840,000')).toEqual({ kind: 'block', ref: { height: 840000 } });
    expect(classify('0')).toEqual({ kind: 'block', ref: { height: 0 } });
    expect(classify(TXID).kind).toBe('tx');
  });

  it('derives addresses from extended keys locally (BIP84 test vector)', () => {
    const zpub =
      'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
    const q = classify(zpub);
    if (q.kind !== 'extkey') throw new Error('expected extkey');
    expect(q).toMatchObject({ flavor: 'zpub', isPrivate: false });
    expect(q.addresses.map((a) => a.address).slice(0, 2)).toEqual([
      'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
      'bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g',
    ]);
    expect(classify(zpub.slice(0, -1) + 'T')).toEqual({ kind: 'invalid', reason: 'extkey' });
  });

  it('unwraps a BIP21 link and ignores its query', () => {
    expect(classify('bitcoin:BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4?amount=0.1&label=x')).toEqual({
      kind: 'address',
      address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    });
  });

  it('explains why an address was refused', () => {
    expect(classify('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kvmsx7e')).toEqual({ kind: 'invalid', reason: 'testnet' });
    expect(classify('mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn')).toEqual({ kind: 'invalid', reason: 'testnet' });
    expect(classify('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5')).toEqual({ kind: 'invalid', reason: 'bech32' });
    expect(classify('1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMa')).toEqual({ kind: 'invalid', reason: 'base58' });
  });

  it('decodes a pasted raw transaction offline and rejects a broken one', () => {
    const q = classify(GENESIS_RAW);
    if (q.kind !== 'rawtx') throw new Error('expected rawtx');
    expect(q.tx.txid).toBe('4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b');
    expect(classify(GENESIS_RAW.slice(0, -2))).toEqual({ kind: 'invalid', reason: 'rawtx' });
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
