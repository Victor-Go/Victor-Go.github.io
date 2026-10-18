import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from '../output';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('copyText', () => {
  it('only writes to the clipboard and never reads it', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(async () => undefined);
    const readText = vi.fn(async () => '');
    vi.stubGlobal('navigator', { clipboard: { writeText, readText } });
    expect(await copyText('secret')).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('secret');
    expect(readText).not.toHaveBeenCalled();
  });

  it('returns false when the clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => { throw new Error('denied'); }) } });
    expect(await copyText('secret')).toBe(false);
  });
});
