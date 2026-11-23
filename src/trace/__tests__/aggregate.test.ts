import { describe, expect, it } from 'vitest';
import { aggregate, pinWatched } from '../aggregate';
import { parseTx } from '../../shared/esplora/parse';
import { A, B, X, Y, esploraTx } from './fixtures';

const at = (from: [string, number][], to: [string, number][], time = 1_000) => {
  const tx = parseTx(esploraTx({ from, to, time, height: 1 }));
  return { tx, net: 0 };
};

describe('aggregate', () => {
  it('X pays Y and A: from A\'s side X is the only source; from X\'s side Y and A are destinations', () => {
    const toY = at([[X, 50_000]], [[Y, 40_000], [X, 9_900]]);
    const toA = at([[X, 20_000]], [[A, 19_900]]);
    const fromX = aggregate(X, [toY, toA]);
    expect(fromX.destinations.map((f) => [f.address, f.sats])).toEqual([[Y, 40_000], [A, 19_900]]);
    expect(fromX.destinations[0].estimated).toBe(false); // plain payment with change back to X

    const fromA = aggregate(A, [toA]);
    expect(fromA.sources).toMatchObject([{ address: X, sats: 19_900, count: 1 }]);
    expect(fromA.destinations).toEqual([]);
  });

  it('splits a many-party transaction by input share and marks it estimated', () => {
    const t = at([[X, 30_000], [B, 10_000]], [[A, 39_000]]);
    const r = aggregate(A, [t]);
    expect(r.sources.map((f) => [f.address, f.sats, f.estimated])).toEqual([[X, 29_250, true], [B, 9_750, true]]);
  });

  it('merges repeated counterparties and leaves out noisy transactions', () => {
    const many = Array.from({ length: 10 }, (_, i) => [`bc1qsynthetic${i}`, 100] as [string, number]);
    const r = aggregate(A, [at([[X, 5_000]], [[A, 4_900]], 1), at([[X, 7_000]], [[A, 6_900]], 2), at([[Y, 9_000]], many)]);
    expect(r.sources).toMatchObject([{ address: X, sats: 11_800, count: 2, firstTime: 1, lastTime: 2 }]);
    expect(r.filtered).toBe(1);
    expect(r.total).toBe(3);
  });

  it('pins watched addresses ahead of the paged rest and names the ones with no flow', () => {
    const r = aggregate(A, [at([[X, 5_000]], [[A, 4_900]]), at([[Y, 9_000]], [[A, 8_900]])]);
    const p = pinWatched(r.sources, [X, B]);
    expect(p.pinned.map((f) => f.address)).toEqual([X]);
    expect(p.rest.map((f) => f.address)).toEqual([Y]);
    expect(p.missing).toEqual([B]);
  });
});
