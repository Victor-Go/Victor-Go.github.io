import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadResponseError, NetworkError, NotFoundError, PROVIDERS, lookupAddress, lookupAddressPage, lookupBlock, lookupTx, resetProviderState } from '../api';

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

beforeEach(() => resetProviderState());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

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

describe('pay-to-pubkey lookups', () => {
  // The scripthash of the genesis coinbase output; the same value mempool.space answers for.
  const GENESIS_PK =
    '04678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5f';
  const SCRIPT = '41' + GENESIS_PK + 'ac';
  const SCRIPTHASH = '3318537dfb3135df9f3d950dbdf8a7ae68dd7c7dfef61ed17963ff80f3850474';
  const stats = {
    chain_stats: { funded_txo_sum: 5_000, spent_txo_sum: 0, tx_count: 1 },
    mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 },
  };

  it('asks about the SHA-256 of the script, never the key, and matches outputs by script', async () => {
    const f = stub((url) =>
      url.endsWith('/txs')
        ? json([tx({ vin: [{ prevout: { scriptpubkey: 'ab', value: 1 } }], vout: [{ scriptpubkey: SCRIPT, value: 5_000 }] })])
        : json(stats),
    );
    const r = await lookupAddress(GENESIS_PK, sig(), SCRIPT);
    // Requests take turns between providers, so compare the paths only.
    expect(f.mock.calls.map(([u]) => u.replace(/^https:\/\/[^/]+\/api/, ''))).toEqual([
      `/scripthash/${SCRIPTHASH}`,
      `/scripthash/${SCRIPTHASH}/txs`,
    ]);
    expect(f.mock.calls.every(([u]) => !u.includes(GENESIS_PK))).toBe(true);
    expect(r.balance).toBe(5_000);
    expect(r.txs[0].net).toBe(5_000);
  });
});

describe('transaction details', () => {
  it('reads version, locktime, SegWit and RBF signalling, plus script and outpoint', async () => {
    stub((url) =>
      url.endsWith('/blocks/tip/height')
        ? json('100')
        : json(
            tx({
              version: 2,
              locktime: 850_000,
              size: 300,
              weight: 800,
              vin: [{ txid: '1'.repeat(64), vout: 3, sequence: 0xfffffffd, prevout: { scriptpubkey: '0014' + '22'.repeat(20), value: 5 } }],
              vout: [{ scriptpubkey: '6a00', value: 0 }],
            }),
          ),
    );
    const { tx: t } = await lookupTx(TXID, sig());
    expect(t).toMatchObject({ version: 2, locktime: 850_000, segwit: true, rbf: true });
    expect(t.vin[0].prev).toEqual({ txid: '1'.repeat(64), vout: 3 });
    expect(t.vin[0].script).toBe('0014' + '22'.repeat(20));
    expect(t.vout[0]).toMatchObject({ address: undefined, script: '6a00' });
  });
});

describe('lookupBlock', () => {
  const H = '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f';
  const info = {
    id: H,
    height: 0,
    version: 1,
    timestamp: 1_231_006_505,
    tx_count: 1,
    size: 285,
    weight: 1140,
    merkle_root: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
    previousblockhash: null,
    nonce: 2_083_236_893,
    bits: 486_604_799,
    difficulty: 1,
  };
  const routes = (url: string) =>
    url.endsWith('/block-height/0') ? json(H) : url.endsWith('/txids') ? json([info.merkle_root]) : json(info);

  it('resolves a height to its block, and a hash directly', async () => {
    stub(routes);
    const byHeight = await lookupBlock({ height: 0 }, sig());
    expect(byHeight).toMatchObject({ hash: H, height: 0, txCount: 1, nonce: 2_083_236_893, prevHash: undefined });
    expect(byHeight.txids).toEqual([info.merkle_root]);
    const f = stub(routes);
    await lookupBlock({ hash: H }, sig());
    expect(f.mock.calls.some(([u]) => u.includes('/block-height/'))).toBe(false);
  });

  it('rejects a block that is not the one asked for', async () => {
    stub((url) => (url.endsWith('/block-height/0') ? json(H) : url.endsWith('/txids') ? json([]) : json({ ...info, id: '1'.repeat(64) })));
    await expect(lookupBlock({ height: 0 }, sig())).rejects.toBeInstanceOf(BadResponseError);
    stub((url) => (url.endsWith('/block-height/0') ? json(H) : url.endsWith('/txids') ? json([]) : json({ ...info, height: 7 })));
    await expect(lookupBlock({ height: 0 }, sig())).rejects.toBeInstanceOf(BadResponseError);
  });

  it('reports a missing height as not found', async () => {
    stub(() => json('Block height out of range', 404));
    await expect(lookupBlock({ height: 99_999_999 }, sig())).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('lookupAddressPage', () => {
  const LAST = 'a'.repeat(64);

  it('follows the cursor on the chain history and keeps the script keying', async () => {
    const f = stub(() => json([tx()]));
    const page = await lookupAddressPage(A, LAST, sig());
    expect(f.mock.calls[0][0]).toBe(`${PROVIDERS[0]}/address/${A}/txs/chain/${LAST}`);
    expect(page[0].net).toBe(600 - 10_000);

    const g = stub(() => json([]));
    await lookupAddressPage('ignored', LAST, sig(), '21' + '02'.repeat(33) + 'ac');
    expect(g.mock.calls[0][0]).toMatch(/\/scripthash\/[0-9a-f]{64}\/txs\/chain\//);
  });

  it('refuses a cursor that is not a transaction id', async () => {
    const f = stub(() => json([]));
    await expect(lookupAddressPage(A, '../x', sig())).rejects.toBeInstanceOf(BadResponseError);
    expect(f).not.toHaveBeenCalled();
  });
});

/** Answers after `ms`, honouring cancellation like a real fetch. */
const after = (ms: number, make: () => Response, init: RequestInit) =>
  new Promise<Response>((resolve, reject) => {
    const t = setTimeout(() => resolve(make()), ms);
    init.signal?.addEventListener('abort', () => { clearTimeout(t); reject(init.signal!.reason); }, { once: true });
  });

/** A request that never answers, but still honours cancellation like a real fetch. */
const hang = (_url: string, init: RequestInit) =>
  new Promise<Response>((_, reject) => {
    const signal = init.signal!;
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });

describe('request reliability', () => {
  const host = (u: string) => PROVIDERS.find((p) => u.startsWith(p))!;
  const stats = {
    chain_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 },
    mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 },
  };

  it('takes turns between providers so a burst is not all sent to one', async () => {
    const f = stub(() => json(stats));
    for (let i = 0; i < 4; i++) await lookupAddress(A, sig(), undefined, false);
    expect(f.mock.calls.map(([u]) => host(u))).toEqual([PROVIDERS[0], PROVIDERS[1], PROVIDERS[0], PROVIDERS[1]]);
  });

  it('remembers a provider that failed and stops trying it first', async () => {
    const f = stub((u) => (host(u) === PROVIDERS[0] ? json('', 429) : json(stats)));
    await lookupAddress(A, sig(), undefined, false); // PROVIDERS[0] fails, PROVIDERS[1] answers
    f.mockClear();
    await lookupAddress(A, sig(), undefined, false);
    await lookupAddress(A, sig(), undefined, false);
    expect(f.mock.calls.map(([u]) => host(u))).toEqual([PROVIDERS[1], PROVIDERS[1]]);
  });

  it('asks the second provider when the first is slow, and takes whichever answers first', async () => {
    vi.useFakeTimers();
    const f = stub((u, init) => {
      if (host(u) === PROVIDERS[0]) return hang(u, init);
      return json(stats);
    });
    const p = lookupAddress(A, sig(), undefined, false);
    await vi.advanceTimersByTimeAsync(1_900);
    expect(f).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    await expect(p).resolves.toMatchObject({ address: A });
    expect(f.mock.calls.map(([u]) => host(u))).toEqual([PROVIDERS[0], PROVIDERS[1]]);
  });

  it('gives up on a hung attempt after 8 seconds', async () => {
    vi.useFakeTimers();
    // Fake timers do not drive AbortSignal.timeout, so route it through them.
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const c = new AbortController();
      setTimeout(() => c.abort(new DOMException('Timeout', 'TimeoutError')), ms);
      return c.signal;
    });
    stub(hang);
    expect(timeout).not.toHaveBeenCalled();
    const p = lookupAddress(A, sig(), undefined, false);
    const assertion = expect(p).rejects.toBeInstanceOf(NetworkError);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    expect(timeout).toHaveBeenCalledWith(8_000);
  });

  it('asks each provider once and never goes round again, even when both refuse', async () => {
    const f = stub(() => json('', 429));
    await expect(lookupAddress(A, sig(), undefined, false)).rejects.toBeInstanceOf(NetworkError);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('fails fast for a few seconds after every provider refused, then tries again', async () => {
    vi.useFakeTimers();
    const f = stub(() => json('', 429));
    await expect(lookupAddress(A, sig(), undefined, false)).rejects.toBeInstanceOf(NetworkError);
    f.mockClear();
    await expect(lookupAddress(A, sig(), undefined, false)).rejects.toBeInstanceOf(NetworkError);
    expect(f).not.toHaveBeenCalled(); // no request was sent while cooling down

    await vi.advanceTimersByTimeAsync(5_100);
    stub(() => json(stats));
    await expect(lookupAddress(A, sig(), undefined, false)).resolves.toMatchObject({ address: A });
  });

  it('does not count time spent queueing for a free slot as the provider being slow', async () => {
    vi.useFakeTimers();
    // Answers take 1.5s, under the 2s hedge delay. With 3 slots per provider the second wave of
    // lookups waits 1.5s for a slot; that wait must not trigger duplicate requests.
    const f = stub((_u, init) => after(1_500, () => json(stats), init));
    const ps = Array.from({ length: 12 }, () => lookupAddress(A, sig(), undefined, false));
    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.all(ps);
    expect(f).toHaveBeenCalledTimes(12);
  });

  it('reuses the chain tip for a short while, but refetches if it is older than the block needed', async () => {
    vi.useFakeTimers();
    const confirmed = (height: number) => tx({ status: { confirmed: true, block_height: height, block_time: 1_600_000_000 } });
    let body: unknown = confirmed(100);
    const f = stub((u) => (u.endsWith('/blocks/tip/height') ? json('105') : json(body)));
    const tips = () => f.mock.calls.filter(([u]) => u.endsWith('/blocks/tip/height')).length;

    await lookupTx(TXID, sig());
    await lookupTx(TXID, sig());
    expect(tips()).toBe(1);

    body = confirmed(110); // newer than the cached tip of 105: that reading cannot be used
    await lookupTx(TXID, sig());
    expect(tips()).toBe(2);

    await vi.advanceTimersByTimeAsync(31_000);
    body = confirmed(100);
    await lookupTx(TXID, sig());
    expect(tips()).toBe(3);
  });

  it('keeps at most 3 requests in flight per provider', async () => {
    let live = 0;
    let peak = 0;
    stub(async (u) => {
      if (host(u) === PROVIDERS[0]) {
        live++;
        peak = Math.max(peak, live);
        await new Promise((r) => setTimeout(r, 20));
        live--;
      }
      return json(stats);
    });
    // Every lookup starts at PROVIDERS[0] when rotation is pinned by a fresh state each time is not guaranteed,
    // so keep the other provider failing to force them all through the first.
    resetProviderState();
    await Promise.all(Array.from({ length: 12 }, () => lookupAddress(A, sig(), undefined, false)));
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('does not penalise a provider for being cancelled by the caller', async () => {
    const c = new AbortController();
    stub(hang);
    const p = lookupAddress(A, c.signal, undefined, false);
    c.abort();
    await expect(p).rejects.toBeTruthy();
    const f = stub(() => json(stats));
    await lookupAddress(A, sig(), undefined, false);
    expect(host(f.mock.calls[0][0])).toBe(PROVIDERS[1]); // rotation moved on, but no one was marked as failing
  });
});
