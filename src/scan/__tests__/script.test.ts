import { describe, expect, it } from 'vitest';
import { RawTx } from '@scure/btc-signer';
import { RawOldTx } from '@scure/btc-signer/script.js';
import { decodeRawTx } from '../rawtx';
import { describeScript, p2pkScript } from '../script';
import { GENESIS_RAW } from './fixtures';

const G = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const GX = G.slice(2);
const hex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16));

describe('describeScript', () => {
  it('names every output shape Bitcoin has used', () => {
    expect(describeScript('a914' + '11'.repeat(20) + '87')).toMatchObject({ kind: 'p2sh', address: expect.stringMatching(/^3/) });
    expect(describeScript('76a914' + '11'.repeat(20) + '88ac')).toMatchObject({ kind: 'p2pkh', address: expect.stringMatching(/^1/) });
    expect(describeScript('0014' + '11'.repeat(20))).toMatchObject({ kind: 'p2wpkh', address: expect.stringMatching(/^bc1q/) });
    expect(describeScript('0020' + '11'.repeat(32))).toMatchObject({ kind: 'p2wsh', address: expect.stringMatching(/^bc1q/) });
    expect(describeScript('5120' + GX)).toMatchObject({ kind: 'p2tr', address: expect.stringMatching(/^bc1p/) });
  });

  it('recognises early scripts that have no address', () => {
    expect(describeScript(p2pkScript(hex(G)))).toEqual({ kind: 'p2pk', pubkeys: [G] });
    expect(describeScript('5121' + G + '51ae')).toEqual({ kind: 'multisig', m: 1, pubkeys: [G] });
    expect(describeScript('6a0568656c6c6f')).toEqual({ kind: 'opreturn', data: '0568656c6c6f' });
  });

  it('never throws on garbage', () => {
    expect(describeScript('zz').kind).toBe('nonstandard');
    expect(describeScript('').kind).toBe('nonstandard');
    expect(describeScript('ff').kind).toBe('nonstandard');
  });
});

describe('decodeRawTx', () => {
  it('decodes the genesis coinbase: P2PK output, coinbase input, no addresses', () => {
    const tx = decodeRawTx(hex(GENESIS_RAW));
    expect(tx.txid).toBe('4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b');
    expect(tx).toMatchObject({ size: 204, weight: 816, version: 1, locktime: 0, segwit: false, rbf: false });
    expect(tx.vin[0]).toMatchObject({ coinbase: true, value: undefined });
    expect(tx.vout).toHaveLength(1);
    expect(tx.vout[0].value).toBe(5_000_000_000);
    expect(tx.vout[0].address).toBeUndefined();
    expect(describeScript(tx.vout[0].script!).kind).toBe('p2pk');
  });

  it('handles SegWit: txid ignores the witness and weight discounts it', () => {
    const inputs = [{ txid: hex('11'.repeat(32)), index: 1, finalScriptSig: new Uint8Array(), sequence: 0xfffffffd }];
    const outputs = [{ amount: 1000n, script: hex('0014' + '22'.repeat(20)) }];
    const legacy = { version: 2, inputs, outputs, lockTime: 0 };
    const withWitness = RawTx.encode({ ...legacy, segwitFlag: true, witnesses: [[hex('aa'.repeat(72)), hex(G)]] });
    const tx = decodeRawTx(withWitness);
    const base = RawOldTx.encode(legacy).length;
    expect(tx.segwit).toBe(true);
    expect(tx.rbf).toBe(true);
    expect(tx.weight).toBe(base * 3 + withWitness.length);
    expect(tx.vout[0].address).toMatch(/^bc1q/);
    // The same transaction without witness data has the same id.
    expect(decodeRawTx(RawOldTx.encode(legacy)).txid).toBe(tx.txid);
  });

  it('rejects truncated and padded input', () => {
    expect(() => decodeRawTx(hex(GENESIS_RAW).slice(0, -1))).toThrow();
    expect(() => decodeRawTx(hex(GENESIS_RAW + '00'))).toThrow();
  });
});
