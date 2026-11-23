import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTransportState } from '../../shared/esplora/transport';
import { parseTx } from '../../shared/esplora/parse';
import { analyse, correlate, expand, neighbours, pickFrontier, relate, type AddrInfo, type PairEdge } from '../correlate';
import { isNoise } from '../aggregate';
import { A, B, X, Y, esploraTx, serveChain, type Pay } from './fixtures';

const DAY = 86_400;
const T = 1_300_000_000; // long ago
const Z = 'bc1qsyntheticzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
const sig = () => new AbortController().signal;
const win = { from: T - DAY, to: T + 8 * DAY };

beforeEach(() => resetTransportState());
afterEach(() => vi.unstubAllGlobals());

const pay = (from: [string, number][], to: [string, number][], day: number, height: number): Pay => ({ from, to, time: T + day * DAY, height });

/** The shape to find: X pays Y, then X pays A and Y pays B, all within a week, long ago. */
const shape = () => [
  esploraTx(pay([[X, 100_000]], [[Y, 60_000], [X, 39_000]], 0, 100)),
  esploraTx(pay([[X, 39_000]], [[A, 30_000], [X, 8_000]], 2, 102)),
  esploraTx(pay([[Y, 60_000]], [[B, 50_000], [Y, 9_000]], 5, 105)),
];

describe('correlate: A and B joined through X and Y', () => {
  it('finds X→Y, X→A and Y→B from the address sets alone, and proves A and B are connected', async () => {
    const { calls } = serveChain(shape());
    const c = await correlate([A, B, X, Y], win, sig(), { noise: 8 });
    expect(c.complete).toBe(true);
    expect(c.shared).toBe(3);
    expect(c.edges.map((e) => `${e.a}>${e.b}`).sort()).toEqual([`${X}>${A}`, `${X}>${Y}`, `${Y}>${B}`].sort());
    // only the three shared transactions were read in detail; no address was paged through
    expect(calls.filter((p) => p.startsWith('/tx/'))).toHaveLength(3);
    expect(calls.some((p) => p.includes('/txs/chain'))).toBe(false);

    const v = analyse(c.edges, A, B);
    expect(v.connected).toBe(true);
    expect(v.path?.nodes).toEqual([A, X, Y, B]);
    expect(v.commonUpstream).toEqual([X]);
  });

  it('is not connected, and says so completely, when the window misses the payments', async () => {
    serveChain(shape());
    const c = await correlate([A, B, X, Y], { from: T + 20 * DAY, to: T + 30 * DAY }, sig(), { noise: 8 });
    expect(c.complete).toBe(true);
    expect(c.edges).toEqual([]);
    expect(analyse(c.edges, A, B).connected).toBe(false);
  });

  it('without the middle addresses the two targets share nothing: the gap is the middle', async () => {
    serveChain(shape());
    const c = await correlate([A, B], win, sig(), { noise: 8 });
    expect(c.edges).toEqual([]);
  });

  it('works without the summary endpoint too (slower, same answer)', async () => {
    serveChain(shape(), { summary: false });
    const c = await correlate([A, B, X, Y], win, sig(), { noise: 8 });
    expect(c.infos[A].via).toBe('paging');
    expect(analyse(c.edges, A, B).connected).toBe(true);
  });

  it('reports an incomplete check when shared transactions could not be read', async () => {
    serveChain(shape());
    const c = await correlate([A, B, X, Y], win, sig(), { noise: 8, detailBudget: 1 });
    expect(c.unread).toBe(2);
    expect(c.complete).toBe(false);
  });
});

describe('relate', () => {
  const tx = (from: [string, number][], to: [string, number][]) => parseTx(esploraTx({ from, to, time: T, height: 1 }));

  it('records inputs spent together as a dashed (cospend) link, not a payment', () => {
    const r = relate([A, X], [tx([[A, 5_000], [X, 5_000]], [[Z, 9_900]])], 8);
    expect(r.edges).toMatchObject([{ kind: 'cospend', count: 1 }]);
  });

  it('splits a shared payment by input share and marks it estimated', () => {
    const r = relate([A, X], [tx([[A, 3_000], [Z, 7_000]], [[X, 9_000]])], 8);
    expect(r.edges).toMatchObject([{ kind: 'pay', a: A, b: X, sats: 2_700, estimated: true }]);
  });

  it('leaves out transactions with too many inputs or outputs', () => {
    const many = Array.from({ length: 10 }, (_, i) => [`bc1qsynthetic${i}`, 100] as [string, number]);
    const r = relate([A, X], [tx([[A, 20_000]], [[X, 1_000], ...many])], 8);
    expect(r).toMatchObject({ edges: [], filtered: 1 });
  });

  it('marks links through a hub weak, and keeps them out of the strong verdict', () => {
    const r = relate([A, X, B], [tx([[X, 9_000]], [[A, 4_000], [Z, 4_900]]), tx([[X, 9_000]], [[B, 8_000]])], 8, new Set([X]));
    expect(r.edges.every((e) => e.weak)).toBe(true);
    const v = analyse(r.edges, A, B);
    expect(v.connected).toBe(false);
    expect(v.weakPath?.nodes).toEqual([A, X, B]);
  });

  it('honours the switches for link kinds', () => {
    const r = relate([A, X, B], [tx([[A, 5_000], [X, 5_000]], [[Z, 9_900]]), tx([[X, 9_000]], [[B, 8_000]])], 8);
    expect(analyse(r.edges, A, B).connected).toBe(true);
    expect(analyse(r.edges, A, B, { pay: true, cospend: false }).connected).toBe(false);
  });
});

/** A shape that needs a search: B ← E, E and F spent together (a 12-input consolidation), F → A. Neither E nor F is a top counterparty. */
const E = 'bc1qsyntheticeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const F = 'bc1qsyntheticffffffffffffffffffffffffffffff';
const filler = (tag: string, n: number): [string, number][] => Array.from({ length: n }, (_, i) => [`bc1qsynthetic${tag}${i}`, 50_000]);
const hidden = () => [
  esploraTx(pay([[...filler('p', 3), [E, 1_000]] as [string, number][]].flat(), [[B, 150_000]], 0, 100)),
  esploraTx(pay([[E, 1_000], [F, 1_000], ...filler('q', 10)], [['bc1qsyntheticconsolidated', 400_000]], 5, 105)),
  esploraTx(pay([[F, 2_000], ...filler('g', 8)], [[A, 390_000]], 9, 109)),
];

describe('a path that needs a search', () => {
  it('keeps consolidations (many inputs, one output) and drops mixes (many inputs and outputs)', () => {
    const tx = (vin: number, vout: number) => parseTx(esploraTx({ from: filler('i', vin), to: filler('o', vout), time: T, height: 1 }));
    expect(isNoise(tx(12, 1), 8)).toBe(false);
    expect(isNoise(tx(12, 2), 8)).toBe(false);
    expect(isNoise(tx(12, 3), 8)).toBe(true);
    expect(isNoise(tx(2, 9), 8)).toBe(true);
  });

  it('is not found from A and B alone, nor by the biggest counterparties, but is found once their neighbours are added', async () => {
    serveChain(hidden());
    const w = { from: T - DAY, to: T + 12 * DAY };
    const first = await correlate([A, B], w, sig(), { noise: 8 });
    expect(analyse(first.edges, A, B).connected).toBe(false);

    const { added } = await expand([A, B], new Set([A, B]), w, sig(), { noise: 8, room: 90 });
    expect(added).toEqual(expect.arrayContaining([E, F]));

    const all = await correlate([A, B, ...added], w, sig(), { noise: 8 });
    const v = analyse(all.edges, A, B);
    expect(v.connected).toBe(true);
    expect(v.path?.nodes).toEqual([A, F, E, B]);
    expect(v.path?.edges.map((e) => e.kind)).toEqual(['pay', 'cospend', 'pay']);
  });

  it('ranks neighbours by how often they appear, so a small recurring partner is kept', () => {
    const t = (from: [string, number][], to: [string, number][]) => ({ tx: parseTx(esploraTx({ from, to, time: T, height: 1 })), net: 0 });
    const r = neighbours(A, [t([[X, 100]], [[A, 90]]), t([[X, 100]], [[A, 90]]), t([[Y, 9_000_000]], [[A, 8_000_000]])], 8);
    expect(r.map((n) => n.address)).toEqual([X, Y]);
  });

  it('includes the partners spent together with the address, and what it paid, but not its change', () => {
    const t = { tx: parseTx(esploraTx({ from: [[A, 5_000], [X, 5_000]], to: [[Y, 8_000], [A, 1_900]], time: T, height: 1 })), net: 0 };
    expect(neighbours(A, [t], 8).map((n) => n.address).sort()).toEqual([X, Y].sort());
  });

  it('widens the targets first, then whoever has links, never a hub or an address twice', () => {
    const info = (address: string, extra: Partial<AddrInfo> = {}): AddrInfo => ({ address, entries: 5, complete: true, via: 'summary', hot: false, failed: false, ...extra });
    const infos = { [A]: info(A), [B]: info(B), [X]: info(X), [Y]: info(Y, { hot: true }), [E]: info(E), [F]: info(F) };
    const edges: PairEdge[] = [{ id: 'e', kind: 'cospend', a: E, b: F, sats: 0, count: 1, txids: [], estimated: false, weak: false }];
    expect(pickFrontier([A, B], edges, infos, new Set(), 10)).toEqual([A, B, E, F, X]);
    expect(pickFrontier([A, B], edges, infos, new Set([A, B]), 2)).toEqual([E, F]);
  });
});
