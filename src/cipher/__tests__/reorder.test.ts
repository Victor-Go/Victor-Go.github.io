import { describe, it, expect } from 'vitest';
import { moveItem } from '../reorder';

describe('moveItem', () => {
  it('moves forward and backward without touching the input', () => {
    const a = [1, 2, 3, 4];
    expect(moveItem(a, 0, 2)).toEqual([2, 3, 1, 4]);
    expect(moveItem(a, 3, 1)).toEqual([1, 4, 2, 3]);
    expect(a).toEqual([1, 2, 3, 4]);
  });
  it('ignores no-ops and out-of-range indexes', () => {
    const a = [1, 2];
    expect(moveItem(a, 1, 1)).toBe(a);
    expect(moveItem(a, 0, 5)).toBe(a);
    expect(moveItem(a, -1, 0)).toBe(a);
  });
});
