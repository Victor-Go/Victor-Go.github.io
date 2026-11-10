export type SocketState = "idle" | "connecting" | "open" | "reconnecting" | "closed";

export interface Frame {
  t: string;
  [key: string]: unknown;
}

/** API Gateway idles a socket after 10 minutes and ends it after 2 hours (protocol section 2). */
export const PING_MS = 5 * 60_000;
export const RECONNECT_AFTER_MS = 110 * 60_000;
/** Close codes the server uses to say "do not come back": account deleted, forced logout. */
const FINAL_CLOSES = new Set([4001, 4002]);

/** A connection that is not open after this long is given up, and the next address of the pool is tried. */
export const CONNECT_TIMEOUT_MS = 8000;
/** The pause before the next address of the pool is tried after one that never opened. */
export const SWITCH_DELAY_MS = 250;

interface Options {
  /** The pool of WebSocket addresses of the same server, most preferred first (one is fine). */
  urls: string[];
  /** Asks the server for a single-use ticket (HTTPS), so no long-lived secret is ever in the URL. */
  getTicket: () => Promise<string>;
  onFrame: (frame: Frame) => void;
  onState: (state: SocketState) => void;
  /** The server closed the socket for good (deleted account, forced logout, signed in elsewhere); `reason` is the close reason ("replaced" for a newer sign-in). */
  onFinal: (reason: string) => void;
}

/**
 * One WebSocket that reconnects with backoff, pings every 5 minutes and rolls over before the 2 hour limit.
 *
 * With a pool of addresses it starts with the first. An address that never opens (refused, reset, or silent for `CONNECT_TIMEOUT_MS`) hands
 * over to the next one after a short pause, round and round, and only a whole round of failures backs off as usual. An address that opened
 * stays the one in use, also after it drops and on the two-hour roll-over. A new `start()` begins with the first again.
 */
export class ChatSocket {
  private ws: WebSocket | null = null;
  private stopped = true;
  private attempt = 0;
  /** The address of the pool in use. */
  private index = 0;
  /** Connections in a row that never opened. */
  private misses = 0;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private rollTimer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private connectTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly o: Options;

  constructor(o: Options) {
    this.o = o;
  }

  start(): void {
    this.stopped = false;
    this.index = 0;
    this.misses = 0;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    this.ws?.close(1000);
    this.ws = null;
    this.o.onState("closed");
  }

  /** True when the frame went out on an open socket. */
  send(frame: Frame): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(frame));
    return true;
  }

  private clearTimers(): void {
    clearInterval(this.pingTimer);
    clearTimeout(this.rollTimer);
    clearTimeout(this.retryTimer);
    clearTimeout(this.connectTimer);
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    this.o.onState(this.attempt === 0 ? "connecting" : "reconnecting");
    let ticket: string;
    try {
      ticket = await this.o.getTicket();
    } catch {
      return this.retry();
    }
    if (this.stopped) return;
    const ws = new WebSocket(`${this.o.urls[this.index]}?ticket=${encodeURIComponent(ticket)}`);
    this.ws = ws;
    let opened = false;
    // An address that neither opens nor fails (a black hole) would hold the whole pool up: give it a limit, closing fires onclose below.
    this.connectTimer = setTimeout(() => ws.close(), CONNECT_TIMEOUT_MS);
    ws.onopen = () => {
      opened = true;
      clearTimeout(this.connectTimer);
      this.attempt = 0;
      this.misses = 0;
      this.o.onState("open");
      this.pingTimer = setInterval(() => this.send({ t: "ping" }), PING_MS);
      this.rollTimer = setTimeout(() => ws.close(1000), RECONNECT_AFTER_MS);
    };
    ws.onmessage = (e) => {
      try {
        const frame = JSON.parse(String(e.data)) as Frame;
        // API Gateway cannot pick a close code, so the server says "do not come back" in a last frame before it closes.
        if (frame?.t === "bye" && FINAL_CLOSES.has(Number(frame.code))) return this.final(String(frame.reason ?? ""));
        if (typeof frame?.t === "string") this.o.onFrame(frame);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = (e) => {
      clearInterval(this.pingTimer);
      clearTimeout(this.rollTimer);
      clearTimeout(this.connectTimer);
      if (this.ws === ws) this.ws = null;
      if (this.stopped) return;
      if (FINAL_CLOSES.has(e.code)) return this.final(e.reason);
      if (opened || this.o.urls.length < 2) return this.retry();
      // Never opened: the next address, at once, until a whole round of the pool has failed; then the usual backoff.
      this.misses++;
      this.index = (this.index + 1) % this.o.urls.length;
      this.retry(this.misses % this.o.urls.length !== 0);
    };
  }

  /** The server ended this sign-in for good: no reconnect, and the owner is told why. Only the first of a "bye" frame and its close counts. */
  private final(reason: string): void {
    if (this.stopped) return;
    this.stopped = true;
    this.clearTimers();
    this.o.onState("closed");
    this.o.onFinal(reason);
  }

  /** `next`: the next address of the pool is tried after a short pause, not after the backoff. */
  private retry(next = false): void {
    if (this.stopped) return;
    this.o.onState("reconnecting");
    if (next) {
      this.retryTimer = setTimeout(() => void this.connect(), SWITCH_DELAY_MS);
      return;
    }
    const base = Math.min(30_000, 1000 * 2 ** this.attempt++);
    const jitter = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
    this.retryTimer = setTimeout(() => void this.connect(), base / 2 + jitter * base);
  }
}
