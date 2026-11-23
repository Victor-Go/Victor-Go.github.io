// Synthetic data only: made-up addresses and amounts, never anything from the real chain.
import { vi } from 'vitest';

export const A = 'bc1qsyntheticaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
export const B = 'bc1qsyntheticbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
export const X = 'bc1qsyntheticxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
export const Y = 'bc1qsyntheticyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy';

let counter = 0;
export const txid = (): string => (++counter).toString(16).padStart(64, '0');

export interface Pay {
  from: [string, number][];
  to: [string, number][];
  time: number;
  height: number;
}

/** An Esplora-shaped confirmed transaction. */
export function esploraTx(p: Pay, id = txid()) {
  return {
    txid: id,
    size: 200,
    weight: 800,
    fee: 100,
    status: { confirmed: true, block_height: p.height, block_time: p.time },
    vin: p.from.map(([a, v]) => ({ txid: txid(), vout: 0, prevout: { scriptpubkey_address: a, value: v }, is_coinbase: false })),
    vout: p.to.map(([a, v]) => ({ scriptpubkey_address: a, value: v })),
  };
}

export type EsploraTx = ReturnType<typeof esploraTx>;

export const MEMPOOL_API = 'https://mempool.space/api';
export const BLOCKSTREAM_API = 'https://blockstream.info/api';

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Net change of an address in a transaction. */
export const netOf = (t: EsploraTx, a: string): number =>
  t.vout.filter((o) => o.scriptpubkey_address === a).reduce((x, o) => x + o.value, 0) - t.vin.filter((i) => i.prevout.scriptpubkey_address === a).reduce((x, i) => x + i.prevout.value, 0);

/**
 * A fake Esplora server for one address whose history is `history` (newest first).
 * `summary: false` imitates blockstream, which has no /txs/summary.
 */
export function serve(address: string, history: EsploraTx[], opts: { summary?: boolean } = {}) {
  const summary = opts.summary ?? true;
  const calls: string[] = [];
  const f = vi.fn((url: string) => {
    const path = url.replace(MEMPOOL_API, '').replace(BLOCKSTREAM_API, '');
    const onMempool = url.startsWith(MEMPOOL_API);
    calls.push(path);
    const after = (cursor: string | undefined, size: number) => {
      const i = cursor === undefined ? 0 : history.findIndex((t) => t.txid === cursor) + 1;
      if (cursor !== undefined && i === 0) return undefined;
      return history.slice(i, i + size);
    };
    if (path === `/address/${address}`) {
      const funded = history.reduce((a, t) => a + t.vout.filter((o) => o.scriptpubkey_address === address).reduce((x, o) => x + o.value, 0), 0);
      const spent = history.reduce((a, t) => a + t.vin.filter((i) => i.prevout.scriptpubkey_address === address).reduce((x, i) => x + i.prevout.value, 0), 0);
      return Promise.resolve(json({ chain_stats: { funded_txo_sum: funded, spent_txo_sum: spent, tx_count: history.length }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 } }));
    }
    const m = path.match(/^\/address\/([^/]+)\/txs(?:\/(summary|chain|mempool))?(?:\/([0-9a-f]{64}))?$/);
    if (!m || m[1] !== address) return Promise.resolve(json('not found', 404));
    const [, , kind, cursor] = m;
    if (kind === 'summary') {
      if (!summary || !onMempool) return Promise.resolve(json('not found', 404));
      const page = after(cursor, 5000);
      if (!page) return Promise.resolve(new Response('after_txid not found', { status: 422 }));
      return Promise.resolve(
        json(page.map((t) => ({ txid: t.txid, height: t.status.block_height, value: netOf(t, address), time: t.status.block_time, tx_position: 1 }))),
      );
    }
    if (kind === 'mempool') return Promise.resolve(json([]));
    const page = after(kind === 'chain' ? cursor : undefined, 25);
    return Promise.resolve(page ? json(page) : new Response('x', { status: 422 }));
  });
  vi.stubGlobal('fetch', f);
  return { f, calls };
}

/** A fake Esplora for a whole little chain: any address's history is the transactions that mention it (newest first). */
export function serveChain(chain: EsploraTx[], opts: { summary?: boolean } = {}) {
  const summary = opts.summary ?? true;
  const calls: string[] = [];
  const newest = [...chain].sort((a, b) => b.status.block_height - a.status.block_height);
  const mentions = (t: EsploraTx, a: string) =>
    t.vout.some((o) => o.scriptpubkey_address === a) || t.vin.some((i) => i.prevout.scriptpubkey_address === a);
  const f = vi.fn((url: string) => {
    const path = url.replace(MEMPOOL_API, '').replace(BLOCKSTREAM_API, '');
    calls.push(path);
    const tx = path.match(/^\/tx\/([0-9a-f]{64})$/);
    if (tx) {
      const t = chain.find((c) => c.txid === tx[1]);
      return Promise.resolve(t ? json(t) : json('not found', 404));
    }
    const m = path.match(/^\/address\/([^/]+)(?:\/txs(?:\/(summary|chain|mempool))?(?:\/([0-9a-f]{64}))?)?$/);
    if (!m) return Promise.resolve(json('not found', 404));
    const [, address, kind, cursor] = m;
    const history = newest.filter((t) => mentions(t, address));
    if (!path.includes('/txs')) {
      const funded = history.reduce((a, t) => a + t.vout.filter((o) => o.scriptpubkey_address === address).reduce((x, o) => x + o.value, 0), 0);
      const spent = history.reduce((a, t) => a + t.vin.filter((i) => i.prevout.scriptpubkey_address === address).reduce((x, i) => x + i.prevout.value, 0), 0);
      return Promise.resolve(
        json({ chain_stats: { funded_txo_sum: funded, spent_txo_sum: spent, tx_count: history.length }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 } }),
      );
    }
    const from = cursor === undefined ? 0 : history.findIndex((t) => t.txid === cursor) + 1;
    if (cursor !== undefined && from === 0) return Promise.resolve(new Response('after_txid not found', { status: 422 }));
    if (kind === 'summary') {
      if (!summary || !url.startsWith(MEMPOOL_API)) return Promise.resolve(json('not found', 404));
      return Promise.resolve(
        json(history.slice(from, from + 5000).map((t) => ({ txid: t.txid, height: t.status.block_height, value: netOf(t, address), time: t.status.block_time, tx_position: 1 }))),
      );
    }
    if (kind === 'mempool') return Promise.resolve(json([]));
    return Promise.resolve(json(history.slice(from, from + 25)));
  });
  vi.stubGlobal('fetch', f);
  return { f, calls };
}
