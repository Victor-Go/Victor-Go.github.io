import { describe, it, expect } from 'vitest';
import { FIT, MAX_SCALE, pan, zoomAt } from '../viewerMath';

describe('viewer zoom math', () => {
  it('keeps the point under the cursor fixed', () => {
    const v = zoomAt(FIT, 2, 100, -40);
    expect((100 - v.x) / v.s).toBeCloseTo(100);
    expect((-40 - v.y) / v.s).toBeCloseTo(-40);
    const w = zoomAt(v, 1.5, -30, 20);
    expect((-30 - w.x) / w.s).toBeCloseTo((-30 - v.x) / v.s);
    expect((20 - w.y) / w.s).toBeCloseTo((20 - v.y) / v.s);
  });

  it('clamps scale and snaps back to fit', () => {
    expect(zoomAt(FIT, 1000, 0, 0).s).toBe(MAX_SCALE);
    expect(zoomAt(zoomAt(FIT, 3, 50, 50), 0.001, 50, 50)).toEqual(FIT);
  });

  it('only pans when zoomed in', () => {
    expect(pan(FIT, 10, 10)).toEqual(FIT);
    expect(pan({ s: 2, x: 0, y: 0 }, 10, -5)).toEqual({ s: 2, x: 10, y: -5 });
  });
});
