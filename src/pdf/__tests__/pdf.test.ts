import { describe, expect, it } from 'vitest';
import { parsePages } from '../pages';

describe('parsePages', () => {
  it('treats empty input as all pages', () => {
    expect(parsePages('', 3)).toEqual([1, 2, 3]);
  });
  it('parses lists, ranges and open ranges', () => {
    expect(parsePages('1-3, 5, 8-', 9)).toEqual([1, 2, 3, 5, 8, 9]);
    expect(parsePages('3,1,3', 5)).toEqual([1, 3]);
  });
  it('rejects invalid input', () => {
    for (const s of ['0', '6', '3-1', 'a', '1,,2', '-', '1-9']) expect(parsePages(s, 5), s).toBeNull();
  });
});

