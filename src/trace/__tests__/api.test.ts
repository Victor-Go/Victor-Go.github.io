import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTransportState, subscribeTrouble } from '../../shared/esplora/transport';
import { NotFoundError, SUMMARY_PAGE, fetchSummaryPage, scanWindow } from '../api';
import { A, BLOCKSTREAM_API, MEMPOOL_API, esploraTx, json, serve } from './fixtures';

const T0 = 1_500_000_000;
const sig = () => new AbortController().signal;

beforeEach(() => resetTransportState());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A long history, newest first, one transaction per hour. */
const history = (n: number) =>
  Array.from({ length: n }, (_, i) => esploraTx({ from: [[`bc1qsynthetic${i}`, 10_000]], to: [[A, 9_900]], time: T0 - i * 3600, height: 800_000 - i }));

describe('scanWindow with the summary endpoint', () => {
  it('reads only the window, not the 5000 transactions before it', async () => {
    const h = history(SUMMARY_PAGE + 100);
    const { calls } = serve(A, h);
    const win = { from: T0 - 4_049 * 3600, to: T0 - 4_000 * 3600 };
    const r = await scanWindow(A, win, sig());
    expect(r.via).toBe('summary');
    expect(r.complete).toBe(true);
    expect(r.txs.map((t) => t.tx.txid)).toEqual(h.slice(4_000, 4_050).map((t) => t.txid));
    // a summary page, plus about 56 transactions of detail pages (25 each); the plain way would need 160 pages
    expect(calls.filter((c) => c.includes('/txs/summary')).length).toBeLessThanOrEqual(2);
    expect(calls.filter((c) => c.includes('/txs/chain')).length).toBeLessThanOrEqual(4);
  });

  it('pages the summary when the window starts beyond the first 5000 entries', async () => {
    const h = history(SUMMARY_PAGE + 100);
    const { calls } = serve(A, h);
    const r = await scanWindow(A, { from: T0 - 5_040 * 3600, to: T0 - 5_030 * 3600 }, sig());
    expect(r.txs).toHaveLength(11);
    expect(calls.filter((c) => c.includes('/txs/summary'))).toHaveLength(2);
  });

  it('returns at once when nothing happened in the window', async () => {
    const { calls } = serve(A, history(40));
    const r = await scanWindow(A, { from: T0 + 1_000_000, to: T0 + 2_000_000 }, sig());
    expect(r).toMatchObject({ txs: [], complete: true, via: 'summary' });
    expect(calls.some((c) => c.includes('/txs/chain'))).toBe(false);
  });
});

describe('balances at the window edges', () => {
  const win = { from: T0 - 130 * 3600, to: T0 - 120 * 3600 };
  const expected = (h: ReturnType<typeof history>) => {
    // every transaction pays A 9_900 (more recent ones are index 0..119): after the window = 120 txs, in window = 11 txs
    const now = h.length * 9_900;
    return { now, leave: now - 120 * 9_900, enter: now - 131 * 9_900 };
  };

  it('are right through the summary path', async () => {
    const h = history(300);
    serve(A, h);
    const r = await scanWindow(A, win, sig());
    expect(r.via).toBe('summary');
    expect(r.balance).toEqual(expected(h));
  });

  it('are right when paging without the summary', async () => {
    const h = history(300);
    serve(A, h, { summary: false });
    const r = await scanWindow(A, win, sig());
    expect(r.via).toBe('paging');
    expect(r.balance).toEqual(expected(h));
  });

  it('are left out when the window was not fully read', async () => {
    serve(A, history(2_000), { summary: false });
    const r = await scanWindow(A, { from: T0 - 1_900 * 3600, to: T0 - 1_890 * 3600 }, sig(), { budget: 5 });
    expect(r.complete).toBe(false);
    expect(r.balance).toBeUndefined();
  });
});

describe('scanWindow without the summary endpoint', () => {
  it('falls back to paging, and says so when the request budget ends before the window', async () => {
    const h = history(2_000);
    serve(A, h, { summary: false });
    const r = await scanWindow(A, { from: T0 - 1_900 * 3600, to: T0 - 1_890 * 3600 }, sig(), { budget: 20 });
    expect(r.via).toBe('paging');
    expect(r.complete).toBe(false);
    expect(r.requests).toBe(20);
  });

  it('finds the window by paging when the budget is large enough', async () => {
    const h = history(300);
    serve(A, h, { summary: false });
    const r = await scanWindow(A, { from: T0 - 130 * 3600, to: T0 - 120 * 3600 }, sig());
    expect(r.complete).toBe(true);
    expect(r.txs.map((t) => t.tx.txid)).toEqual(h.slice(120, 131).map((t) => t.txid));
  });

  it('skips the summary entirely when told to', async () => {
    const { calls } = serve(A, history(30));
    await scanWindow(A, { from: 0, to: Number.MAX_SAFE_INTEGER }, sig(), { noSummary: true });
    expect(calls.some((c) => c.includes('summary'))).toBe(false);
  });
});

describe('trouble reporting', () => {
  it('tells a page when the sources throttle or do not answer, and when they recover', async () => {
    vi.useFakeTimers();
    const seen: (number | undefined)[] = [];
    const off = subscribeTrouble((t) => seen.push(t?.status));
    let n = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(++n < 3 ? json('slow down', 429) : json([]))),
    );
    const p = fetchSummaryPage(A, undefined, sig());
    await vi.advanceTimersByTimeAsync(20_000);
    await p;
    off();
    expect(seen).toEqual([429, 429, undefined]);
  });
});

describe('summary requests', () => {
  it('go to mempool.space only; a missing endpoint is NotFound, an unknown cursor too', async () => {
    const f = vi.fn(() => Promise.resolve(json('nope', 404)));
    vi.stubGlobal('fetch', f);
    await expect(fetchSummaryPage(A, undefined, sig())).rejects.toBeInstanceOf(NotFoundError);
    expect(f).toHaveBeenCalledTimes(1);
    expect((f.mock.calls[0] as unknown as [string])[0].startsWith(MEMPOOL_API)).toBe(true);
    expect(f.mock.calls.some((c) => (c as unknown as [string])[0].startsWith(BLOCKSTREAM_API))).toBe(false);
  });

  it('backs off and retries on 429 instead of failing the batch', async () => {
    vi.useFakeTimers();
    let n = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(++n < 3 ? json('slow down', 429) : json([]))),
    );
    const p = fetchSummaryPage(A, undefined, sig());
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(p).resolves.toEqual([]);
    expect(n).toBe(3);
  });

  it('rejects a malformed entry', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json([{ txid: 'x', value: 1 }]))));
    await expect(fetchSummaryPage(A, undefined, sig())).rejects.toThrow();
  });
});
