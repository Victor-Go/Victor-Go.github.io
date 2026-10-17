import { CipherError } from "../crypto/encoding";
import type { Kdf } from "../crypto/password";

/**
 * Argon2id in a throwaway Web Worker so the UI stays responsive.
 * A fresh worker per call; it is terminated as soon as it answers so its memory is released.
 */
export const workerKdf: Kdf = (password, salt, { m, t, p }) =>
  new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./kdf.worker.ts", import.meta.url), { type: "module" });
    const done = () => worker.terminate();
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
    worker.postMessage({ password: pw, salt: salt.slice(), m, t, p }, [pw.buffer]);
  });
