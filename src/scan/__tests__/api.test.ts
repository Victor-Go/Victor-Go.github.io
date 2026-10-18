import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadResponseError, NetworkError, NotFoundError, PROVIDERS, lookupAddress, lookupTx } from '../api';

const A = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const TXID = 'f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16';

const tx = (over: Record<string, unknown> = {}) => ({
  txid: TXID,
  size: 200,
  weight: 800,
  fee: 400,
  status: { confirmed: true, block_height: 100, block_time: 1_600_000_000 },
  vin: [{ prevout: { scriptpubkey_address: A, value: 10_000 }, is_coinbase: false }],
  vout: [{ scriptpubkey_address: 'x', value: 9_000 }, { scriptpubkey_address: A, value: 600 }],
  ...over,
});

const json = (body: unknown, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

function stub(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const f = vi.fn((url: string, init: RequestInit) => Promise.resolve(handler(url, init)));
  vi.stubGlobal('fetch', f);
  return f;
}

afterEach(() => vi.unstubAllGlobals());

const sig = () => new AbortController().signal;

describe('network hygiene', () => {
  it('sends no cookies, no referrer and bypasses the cache; only known hosts are contacted', async () => {
    const f = stub((url) => (url.endsWith('/blocks/tip/height') ? json('105') : json(tx())));
    const r = await lookupTx(TXID, sig());
    expect(r.confirmations).toBe(6);
    for (const [url, init] of f.mock.calls) {
      expect(PROVIDERS.some((p) => url.startsWith(p + '/'))).toBe(true);
      expect(init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', redirect: 'error', method: 'GET' });
    }
  });
});

describe('provider fallback', () => {
  it('falls back on server errors but not on 404', async () => {
    const f = stub((url) => (url.startsWith(PROVIDERS[0]) ? json('', 502) : json(tx({ status: { confirmed: false } }))));
    const r = await lookupTx(TXID, sig());
    expect(r.tx.confirmed).toBe(false);
    expect(f).toHaveBeenCalledTimes(2);

    const g = stub(() => json('Transaction not found', 404));
    await expect(lookupTx(TXID, sig())).rejects.toBeInstanceOf(NotFoundError);
    expect(g).toHaveBeenCalledTimes(1);
  });

  it('reports a network error when every provider fails', async () => {
    stub(() => {
      throw new TypeError('network');
    });
    await expect(lookupTx(TXID, sig())).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('response validation', () => {
  it('rejects malformed data instead of rendering it', async () => {
    stub(() => json(tx({ size: 'big' })));
    await expect(lookupTx(TXID, sig())).rejects.toBeInstanceOf(BadResponseError);
    stub(() => json('<html>'));
    await expect(lookupTx(TXID, sig())).rejects.toBeInstanceOf(BadResponseError);
  });

  it('rejects a transaction response for a different requested hash', async () => {
    const f = stub(() => json(tx({ txid: '0'.repeat(64) })));
    await expect(lookupTx(TXID, sig())).rejects.toBeInstanceOf(BadResponseError);
    expect(f).toHaveBeenCalledTimes(1); // Do not fetch a tip for the wrong transaction.
  });
});

describe('lookupAddress', () => {
  it('computes balance and the per-transaction net change', async () => {
    stub((url) =>
      url.endsWith('/txs')
        ? json([tx()])
        : json({
            chain_stats: { funded_txo_sum: 5_000, spent_txo_sum: 1_000, tx_count: 2 },
            mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 },
          }),
    );
    const r = await lookupAddress(A, sig());
    expect(r).toMatchObject({ balance: 4_000, txCount: 2, received: 5_000 });
    expect(r.txs[0].net).toBe(600 - 10_000);
  });

  it('skips the transaction list for an unused address', async () => {
    const f = stub(() =>
      json({
        chain_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 },
        mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 },
      }),
    );
    const r = await lookupAddress(A, sig());
    expect(r.txs).toEqual([]);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
