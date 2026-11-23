import { describe, expect, it } from 'vitest';
import { MAX_SEARCH, emptyVerify, fromVerifyHash, isVerifyHash, toVerifyHash } from '../verifyView';

// Public documentation addresses, not anything from a real investigation.
const OK = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const OK2 = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

describe('verification view in the URL fragment', () => {
  const base = { ...emptyVerify(), first: OK, second: OK2, from: '2015-01-02', to: '2015-02-03' };

  it('round-trips, including how many search rounds were run', () => {
    const v = { ...base, candidates: [OK], noise: 12, search: 3 };
    expect(isVerifyHash(toVerifyHash(v))).toBe(true);
    expect(fromVerifyHash(toVerifyHash(v))).toEqual(v);
  });

  it('starts with the last month when the link names no window, and keeps an explicit "all"', () => {
    const v = fromVerifyHash(`#m=v&t1=${OK}&t2=${OK2}`);
    expect(v.from).not.toBe('');
    expect(v.to).not.toBe('');
    const all = fromVerifyHash(`#m=v&t1=${OK}&t2=${OK2}&all=1`);
    expect([all.from, all.to]).toEqual(['', '']);
    expect(toVerifyHash({ ...emptyVerify(), first: OK, second: OK2 })).toContain('all=1');
  });

  it('omits the search marker for a plain check, and ignores nonsense values', () => {
    expect(toVerifyHash(base)).not.toContain('s=');
    for (const bad of ['0', '-1', '2.5', 'x', String(MAX_SEARCH + 1)]) {
      expect(fromVerifyHash(`#m=v&t1=${OK}&t2=${OK2}&from=2015-01-02&to=2015-02-03&s=${bad}`).search).toBe(0);
    }
  });
});
