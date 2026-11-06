import type { Kdf } from "../crypto/devAuth";
import type { Challenge } from "./solve";

/** Workers that are running; cancelled when the user leaves, locks or cancels. */
const running = new Set<() => void>();

export function cancelWork(): void {
  for (const cancel of [...running]) cancel();
}

export class Cancelled extends Error {
  constructor() {
    super("cancelled");
  }
}

/** Argon2id in a fresh worker, terminated as soon as it answers. */
export const workerKdf: Kdf = (password, salt, { m, t, p, dkLen }) =>
  new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./kdf.worker.ts", import.meta.url), { type: "module" });
    const cancel = () => {
      finish();
      reject(new Cancelled());
    };
    const finish = () => {
      running.delete(cancel);
      worker.terminate();
    };
    running.add(cancel);
    worker.onmessage = (e: MessageEvent<{ key?: Uint8Array }>) => {
      finish();
      if (e.data.key) resolve(e.data.key);
      else reject(new Error("kdf failed"));
    };
    worker.onerror = () => {
      finish();
      reject(new Error("kdf failed"));
    };
    const pw = password.slice();
    worker.postMessage({ password: pw, salt: salt.slice(), m, t, p, dkLen }, [pw.buffer]);
  });

/**
 * Solves a challenge on one or two workers (parts are split between them). `onProgress` gets 0..1.
 * Memory-hard on purpose; the browser tab stays responsive because this runs off the main thread.
 */
export function solveInWorkers(challenge: Challenge, onProgress: (fraction: number) => void): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const count = Math.min(challenge.parts, (navigator.hardwareConcurrency ?? 2) >= 4 ? 2 : 1);
    const nonces: number[] = new Array(challenge.parts).fill(-1);
    const workers: Worker[] = [];
    let solved = 0;
    const finish = () => {
      running.delete(cancel);
      for (const w of workers) w.terminate();
    };
    const cancel = () => {
      finish();
      reject(new Cancelled());
    };
    running.add(cancel);
    const fail = () => {
      finish();
      reject(new Error("proof of work failed"));
    };
    for (let w = 0; w < count; w++) {
      const worker = new Worker(new URL("./pow.worker.ts", import.meta.url), { type: "module" });
      workers.push(worker);
      worker.onerror = fail;
      worker.onmessage = (e: MessageEvent<{ part?: number; nonce?: number | null; error?: boolean }>) => {
        if (e.data.error || (e.data.part !== undefined && typeof e.data.nonce !== "number")) return fail();
        if (e.data.part === undefined) return;
        nonces[e.data.part] = e.data.nonce as number;
        onProgress(++solved / challenge.parts);
        if (solved === challenge.parts) {
          finish();
          resolve(nonces);
        }
      };
      const parts = Array.from({ length: challenge.parts }, (_, i) => i).filter((i) => i % count === w);
      worker.postMessage({ challenge, parts });
    }
  });
}
