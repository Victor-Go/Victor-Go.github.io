import { describe, it, expect, afterEach, vi } from 'vitest';
import { epochsAvailable, getEpochs } from '../crypto/epochsEnv';

const g = globalThis as { __cipherEpochs?: unknown };

afterEach(() => {
  delete g.__cipherEpochs;
  vi.unstubAllEnvs();
});

describe('getEpochs outside production', () => {
  it('falls back to the built-in default', () => {
    vi.stubEnv('VITE_CIPHER_EPOCHS', '');
    vi.stubEnv('VITE_CIPHER_EPOCH_CURRENT', '');
    const e = getEpochs();
    expect(e.current).toBe(1);
    expect([...e.labels.keys()]).toEqual([0, 1]);
  });

  it('prefers the VITE_ env values over the default', () => {
    vi.stubEnv('VITE_CIPHER_EPOCHS', '0,1:aaa,2:bbb');
    vi.stubEnv('VITE_CIPHER_EPOCH_CURRENT', '2');
    const e = getEpochs();
    expect(e.current).toBe(2);
    expect(e.labels.get(2)).toBe('bbb');
  });

  it('prefers the global over the env values', () => {
    vi.stubEnv('VITE_CIPHER_EPOCHS', '0,1:aaa,2:bbb');
    vi.stubEnv('VITE_CIPHER_EPOCH_CURRENT', '2');
    g.__cipherEpochs = ['0,3:ccc', '3'];
    const e = getEpochs();
    expect(e.current).toBe(3);
    expect(e.labels.get(3)).toBe('ccc');
  });

  it('reads the defaults at call time', () => {
    vi.stubEnv('VITE_CIPHER_EPOCHS', '0,5:eee');
    vi.stubEnv('VITE_CIPHER_EPOCH_CURRENT', '5');
    expect(getEpochs().current).toBe(5);
    vi.stubEnv('VITE_CIPHER_EPOCH_CURRENT', '');
    vi.stubEnv('VITE_CIPHER_EPOCHS', '');
    expect(getEpochs().current).toBe(1);
  });
});

describe('getEpochs in production', () => {
  it('uses the global', () => {
    vi.stubEnv('PROD', true);
    g.__cipherEpochs = ['0,2:bcd', '2'];
    expect(getEpochs().current).toBe(2);
    expect(epochsAvailable()).toBe(true);
  });

  it('throws without the global, ignoring VITE_ env values', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_CIPHER_EPOCHS', '0,1:aaa,2:bbb');
    vi.stubEnv('VITE_CIPHER_EPOCH_CURRENT', '2');
    expect(() => getEpochs()).toThrow();
    expect(epochsAvailable()).toBe(false);
  });

  it('treats a malformed global as unavailable', () => {
    vi.stubEnv('PROD', true);
    g.__cipherEpochs = ['garbage', '9'];
    expect(epochsAvailable()).toBe(false);
  });
});
