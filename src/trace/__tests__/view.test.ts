import { describe, expect, it } from 'vitest';
import { DEFAULT_DAYS, dateInput, fromHash, lastDays, toHash, windowOf, emptyView } from '../view';

// A real, well-known public address from the Bitcoin documentation is fine; the user's own addresses never appear here.
const OK = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const OK2 = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

describe('view in the URL fragment', () => {
  it('round-trips a view', () => {
    const v = { address: OK, watch: [OK2], from: '2015-01-02', to: '2015-01-09', noise: 12 };
    expect(fromHash(toHash(v))).toEqual(v);
  });

  it('is empty for an empty view', () => {
    expect(toHash(emptyView())).toBe('');
  });

  it('drops anything that is not a public address or a plain date (keys, seeds, junk)', () => {
    const wif = '5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ';
    const h = `#a=${wif}&w=${OK},${wif},nonsense&from=yesterday&to=2020-02-30x`;
    const v = fromHash(h);
    expect(v.address).toBe('');
    expect(v.watch).toEqual([OK]);
    expect(v.from).toBe('');
    expect(v.to).toBe('');
  });

  it('turns dates into an inclusive window', () => {
    const w = windowOf({ ...emptyView(), from: '2015-01-02', to: '2015-01-02' });
    expect(w.to - w.from).toBe(86_399);
    expect(windowOf(emptyView()).from).toBe(0);
  });

  it('knows the quick ranges', () => {
    expect(lastDays(7, new Date(2024, 2, 10))).toEqual({ from: '2024-03-03', to: '2024-03-10' });
  });

  it('starts with the last month when the link names no window, and keeps an explicit "all"', () => {
    expect(fromHash('')).toMatchObject(lastDays(DEFAULT_DAYS));
    expect(fromHash(`#a=${OK}`)).toMatchObject(lastDays(DEFAULT_DAYS));
    const all = fromHash(toHash({ ...emptyView(), address: OK }));
    expect([all.from, all.to]).toEqual(['', '']);
  });

  it('never accepts a date in the future', () => {
    const today = dateInput(new Date());
    const v = fromHash('#from=2999-01-01&to=2999-12-31');
    expect([v.from, v.to]).toEqual([today, today]);
  });
});
