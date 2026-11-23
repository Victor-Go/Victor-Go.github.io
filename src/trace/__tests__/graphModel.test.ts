import { describe, expect, it } from 'vitest';
import { aggregate, type Flow, type Flows } from '../aggregate';
import { buildGraph, moreKey, centerId, NODE_W } from '../graphModel';
import { parseTx } from '../../shared/esplora/parse';
import { A, X, Y, esploraTx } from './fixtures';

const flow = (address: string, sats: number): Flow => ({ address, sats, count: 1, txids: ['0'.repeat(64)], estimated: false });
const flows = (src: Flow[], dst: Flow[]): Flows => ({ sources: src, destinations: dst, filtered: 0, total: 0 });
const addr = (i: number) => `bc1qsyntheticn${i}`;

describe('buildGraph', () => {
  it('puts sources left, destinations right, the target in the middle, with arrows along the money', () => {
    const g = buildGraph({ center: A, flows: flows([flow(X, 500)], [flow(Y, 300)]), neighbors: {}, hops: 1, perLayer: 2, more: {} });
    const by = (a?: string) => g.nodes.find((n) => n.address === a)!;
    expect(by(X).x).toBeLessThan(by(A).x);
    expect(by(Y).x).toBeGreaterThan(by(A).x);
    expect(g.edges.map((e) => [e.from === centerId ? 'A' : by(X).id === e.from ? 'X' : 'Y', e.to === centerId ? 'A' : by(Y).id === e.to ? 'Y' : 'X'])).toEqual([
      ['X', 'A'],
      ['A', 'Y'],
    ]);
    expect(g.columns).toHaveLength(3);
  });

  it('keeps the biggest per layer and folds the rest into "N more", opened per side', () => {
    const src = [5, 4, 3, 2, 1].map((i) => flow(addr(i), i * 100));
    const dst = [9, 8, 7].map((i) => flow(addr(i), i * 100));
    const input = { center: A, flows: flows(src, dst), neighbors: {}, hops: 1 as const, perLayer: 2, more: {} };
    const g = buildGraph(input);
    expect(g.nodes.filter((n) => n.side === 'src' && !n.fold).map((n) => n.address)).toEqual([addr(5), addr(4)]);
    expect(g.nodes.find((n) => n.side === 'src' && n.fold)?.fold).toBe(3);
    expect(g.nodes.find((n) => n.side === 'dst' && n.fold)?.fold).toBe(1);
    const opened = buildGraph({ ...input, more: { [moreKey('src', centerId)]: 1 } });
    expect(opened.nodes.filter((n) => n.side === 'src' && !n.fold)).toHaveLength(4);
    expect(opened.nodes.filter((n) => n.side === 'dst' && !n.fold)).toHaveLength(2); // the other side is untouched
  });

  it('adds the second hop from the neighbours\' own flows, never leading back to the target', () => {
    const neighbors = { [X]: { status: 'done' as const, flows: flows([flow(Y, 700), flow(A, 50)], []), complete: false } };
    const g = buildGraph({ center: A, flows: flows([flow(X, 500)], []), neighbors, hops: 2, perLayer: 2, more: {} });
    const x = g.nodes.find((n) => n.address === X && n.level === 1)!;
    const y = g.nodes.find((n) => n.address === Y && n.level === 2)!;
    expect(y.x).toBeLessThan(x.x);
    expect(g.nodes.some((n) => n.level === 2 && n.address === A)).toBe(false);
    expect(x.incomplete).toBe(true);
    expect(g.columns).toHaveLength(5);
    expect(g.width).toBeGreaterThan(5 * NODE_W);
  });

  it('marks a neighbour that is still being read, and one that failed', () => {
    const base = { center: A, flows: flows([flow(X, 500)], [flow(Y, 300)]), hops: 2 as const, perLayer: 2, more: {} };
    const g = buildGraph({ ...base, neighbors: { [X]: { status: 'loading' }, [Y]: { status: 'error' } } });
    expect(g.nodes.find((n) => n.address === X)?.loading).toBe(true);
    expect(g.nodes.find((n) => n.address === Y)?.failed).toBe(true);
  });

  it('works on real aggregate output', () => {
    const tx = parseTx(esploraTx({ from: [[X, 20_000]], to: [[A, 19_900]], time: 1, height: 1 }));
    const g = buildGraph({ center: A, flows: aggregate(A, [{ tx, net: 0 }]), neighbors: {}, hops: 1, perLayer: 2, more: {} });
    expect(g.nodes.map((n) => n.address).sort()).toEqual([A, X].sort());
  });
});
