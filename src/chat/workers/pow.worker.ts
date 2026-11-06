import { solvePart, type Challenge } from "./solve";

interface Request {
  challenge: Challenge;
  parts: number[];
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<Request>) => void) | null;
  postMessage(message: unknown): void;
};

ctx.onmessage = (e) => {
  try {
    for (const part of e.data.parts) {
      const nonce = solvePart(e.data.challenge, part);
      ctx.postMessage({ part, nonce });
    }
    ctx.postMessage({ done: true });
  } catch {
    ctx.postMessage({ error: true });
  }
};
