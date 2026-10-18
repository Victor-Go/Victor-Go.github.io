import { CipherError } from "../crypto/encoding";
import type { Kdf } from "../crypto/password";

/** Cancel active password derivations when the page is wiped. */
const pending = new Set<() => void>();

export function cancelPendingKdf(): void {
  for (const cancel of [...pending]) cancel();
}

/**
 * Argon2id runs in a fresh worker per operation. The worker is terminated as
 * soon as it answers, fails, or the page is cleared.
 */
export const workerKdf: Kdf = (password, salt, { m, t, p }) =>
  new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./kdf.worker.ts", import.meta.url), { type: "module" });
    const done = () => {
      pending.delete(cancel);
      worker.terminate();
    };
    const cancel = () => {
      done();
      reject(new CipherError("decrypt"));
    };
    pending.add(cancel);
    worker.onmessage = (e: MessageEvent<{ key?: Uint8Array; error?: boolean }>) => {
      done();
      if (e.data.key) resolve(e.data.key);
      else reject(new CipherError("decrypt"));
    };
    worker.onerror = () => {
      done();
      reject(new CipherError("decrypt"));
    };
    const pw = password.slice();
    try {
      worker.postMessage({ password: pw, salt: salt.slice(), m, t, p }, [pw.buffer]);
    } catch {
      pw.fill(0);
      cancel();
    }
  });
