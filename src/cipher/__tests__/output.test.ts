import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from '../output';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('best-effort clipboard clearing', () => {
  it('tries to clear the same copied text after 30 seconds', async () => {
    vi.useFakeTimers();
    let text = '';
    const writeText = vi.fn(async (s: string) => { text = s; });
    const readText = vi.fn(async () => text);
    vi.stubGlobal('navigator', { clipboard: { writeText, readText } });
    expect(await copyText('secret')).toBe(true);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(text).toBe('secret');
    await vi.advanceTimersByTimeAsync(1);
    expect(text).toBe('');
  });

  it('does not erase text the user copied from another application', async () => {
    vi.useFakeTimers();
    let text = '';
    vi.stubGlobal('navigator', { clipboard: {
      writeText: async (s: string) => { text = s; },
      readText: async () => text,
    } });
    expect(await copyText('secret')).toBe(true);
    text = 'new content from elsewhere';
    await vi.advanceTimersByTimeAsync(30_000);
    expect(text).toBe('new content from elsewhere');
  });

  it('silently tolerates clipboard permission denial', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { clipboard: {
      writeText: vi.fn(async () => undefined),
      readText: vi.fn(async () => { throw new Error('denied'); }),
    } });
    expect(await copyText('secret')).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000);
  });
});
