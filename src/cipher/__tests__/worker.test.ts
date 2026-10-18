import { afterEach, describe, expect, it, vi } from 'vitest';
import { workerKdf, cancelPendingKdf } from '../workers/kdfClient';

afterEach(() => {
  cancelPendingKdf();
  vi.unstubAllGlobals();
});

describe('worker cancellation on wipe', () => {
  it('terminates running Argon2 workers and rejects pending derivation', async () => {
    const terminate = vi.fn();
    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      terminate = terminate;
      postMessage() {}
    }
    vi.stubGlobal('Worker', FakeWorker);
    const pending = workerKdf(new Uint8Array([1]), new Uint8Array(16), { m: 65536, t: 3, p: 1 });
    cancelPendingKdf();
    await expect(pending).rejects.toMatchObject({ code: 'decrypt' });
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it('reports a worker crash as a key-derivation failure, not a decrypt failure', async () => {
    let instance: { onerror: (() => void) | null } | undefined;
    class CrashingWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      terminate = vi.fn();
      constructor() {
        instance = this;
      }
      postMessage() {}
    }
    vi.stubGlobal('Worker', CrashingWorker);
    const pending = workerKdf(new Uint8Array([1]), new Uint8Array(16), { m: 65536, t: 3, p: 1 });
    instance!.onerror!();
    await expect(pending).rejects.toMatchObject({ code: 'kdf' });
  });
});
