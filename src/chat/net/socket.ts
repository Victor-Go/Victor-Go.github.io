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

interface Options {
  url: string;
  /** Asks the server for a single-use ticket (HTTPS), so no long-lived secret is ever in the URL. */
  getTicket: () => Promise<string>;
  onFrame: (frame: Frame) => void;
  onState: (state: SocketState) => void;
  /** The server closed the socket for good (deleted account, forced logout, signed in elsewhere); `reason` is the close reason ("replaced" for a newer sign-in). */
  onFinal: (reason: string) => void;
}

/** One WebSocket that reconnects with backoff, pings every 5 minutes and rolls over before the 2 hour limit. */
export class ChatSocket {
  private ws: WebSocket | null = null;
  private stopped = true;
  private attempt = 0;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private rollTimer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly o: Options;

  constructor(o: Options) {
    this.o = o;
  }

  start(): void {
    this.stopped = false;
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
    const ws = new WebSocket(`${this.o.url}?ticket=${encodeURIComponent(ticket)}`);
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.o.onState("open");
      this.pingTimer = setInterval(() => this.send({ t: "ping" }), PING_MS);
      this.rollTimer = setTimeout(() => ws.close(1000), RECONNECT_AFTER_MS);
    };
    ws.onmessage = (e) => {
      try {
        const frame = JSON.parse(String(e.data)) as Frame;
        if (typeof frame?.t === "string") this.o.onFrame(frame);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = (e) => {
      clearInterval(this.pingTimer);
      clearTimeout(this.rollTimer);
      if (this.ws === ws) this.ws = null;
      if (this.stopped) return;
      if (FINAL_CLOSES.has(e.code)) {
        this.stopped = true;
        this.o.onState("closed");
        this.o.onFinal(e.reason);
        return;
      }
      this.retry();
    };
  }

  private retry(): void {
    if (this.stopped) return;
    this.o.onState("reconnecting");
    const base = Math.min(30_000, 1000 * 2 ** this.attempt++);
    const jitter = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
    this.retryTimer = setTimeout(() => void this.connect(), base / 2 + jitter * base);
  }
}
