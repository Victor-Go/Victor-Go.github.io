import { describe, expect, it } from 'vitest';
import { MAINSTREAM, lookupList, possibleProtocols, type Format } from '../protocols';
import { classify } from '../query';

const formats: Format[] = [
  { kind: 'pubkey', compressed: true },
  { kind: 'pubkey', compressed: false },
  { kind: 'mnemonic', scheme: 'bip39' },
  { kind: 'mnemonic', scheme: 'electrum-standard' },
  { kind: 'mnemonic', scheme: 'electrum-segwit' },
  { kind: 'extkey', flavor: 'xpub' },
  { kind: 'extkey', flavor: 'ypub' },
  { kind: 'extkey', flavor: 'zpub' },
];

const G = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const XPUB = 'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8';

describe('possibleProtocols', () => {
  it('lets a compressed key be anything, but an uncompressed key only the pre-SegWit protocols', () => {
    expect(possibleProtocols({ kind: 'pubkey', compressed: true })).toEqual(['p2pkh', 'p2sh-p2wpkh', 'p2wpkh', 'p2tr', 'p2pk']);
    expect(possibleProtocols({ kind: 'pubkey', compressed: false })).toEqual(['p2pkh', 'p2pk']);
  });

  it('maps each seed and extended-key format to the protocols it serves', () => {
    expect(possibleProtocols({ kind: 'mnemonic', scheme: 'bip39' })).toEqual(MAINSTREAM);
    expect(possibleProtocols({ kind: 'mnemonic', scheme: 'electrum-standard' })).toEqual(['p2pkh']);
    expect(possibleProtocols({ kind: 'mnemonic', scheme: 'electrum-segwit' })).toEqual(['p2wpkh']);
    expect(possibleProtocols({ kind: 'extkey', flavor: 'xpub' })).toEqual(MAINSTREAM);
    expect(possibleProtocols({ kind: 'extkey', flavor: 'ypub' })).toEqual(['p2sh-p2wpkh']);
    expect(possibleProtocols({ kind: 'extkey', flavor: 'zpub' })).toEqual(['p2wpkh']);
  });

  it('never offers P2PK to a hierarchical wallet', () => {
    for (const f of formats.filter((x) => x.kind !== 'pubkey')) expect(possibleProtocols(f)).not.toContain('p2pk');
  });
});

describe('lookupList', () => {
  it('is the mainstream protocols the format can produce plus every other protocol it could use', () => {
    for (const f of formats) {
      const possible = possibleProtocols(f);
      const list = lookupList(f);
      for (const t of MAINSTREAM.filter((m) => possible.includes(m))) expect(list).toContain(t);
      for (const t of possible.filter((p) => !MAINSTREAM.includes(p))) expect(list).toContain(t);
      expect([...list].sort()).toEqual([...possible].sort()); // and nothing the format cannot produce
    }
  });

  it('skips mainstream types the format cannot produce', () => {
    expect(lookupList({ kind: 'pubkey', compressed: false })).not.toContain('p2wpkh');
    expect(lookupList({ kind: 'pubkey', compressed: false })).not.toContain('p2tr');
    expect(lookupList({ kind: 'mnemonic', scheme: 'electrum-standard' })).toEqual(['p2pkh']);
  });
});

describe('classify follows the inferred protocols', () => {
  it('derives exactly the lookup list for a public key and an extended key', () => {
    const key = classify(G);
    if (key.kind !== 'pubkey') throw new Error('expected pubkey');
    expect(key.addresses.map((a) => a.type)).toEqual(lookupList({ kind: 'pubkey', compressed: true }));

    const x = classify(XPUB);
    if (x.kind !== 'extkey') throw new Error('expected extkey');
    expect([...new Set(x.addresses.map((a) => a.type))]).toEqual(MAINSTREAM);
    expect(x.addresses).toHaveLength(20);
  });
});
