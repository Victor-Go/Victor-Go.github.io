import { argon2id } from "@noble/hashes/argon2.js";

interface Request {
  password: Uint8Array;
  salt: Uint8Array;
  m: number;
  t: number;
  p: number;
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<Request>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

ctx.onmessage = (e) => {
  const { password, salt, m, t, p } = e.data;
  try {
    const key = argon2id(password, salt, { m, t, p, dkLen: 32, maxmem: 2 ** 32 - 1 });
    ctx.postMessage({ key }, [key.buffer]);
  } catch {
    ctx.postMessage({ error: true });
  } finally {
    password.fill(0);
  }
};
