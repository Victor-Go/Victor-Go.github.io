import { probePool } from "./health";

/** Error codes of protocol section 3, plus two the client makes up for failures before any reply. */
export type ErrorCode =
  | "bad_request" | "unauthorized" | "forbidden" | "not_found" | "conflict" | "rate_limited" | "busy"
  | "pow_required" | "pow_invalid" | "invite_required" | "invite_invalid" | "handle_taken"
  | "weak_request" | "too_large" | "gone" | "protocol_unsupported" | "stepup_required" | "internal"
  | "network" | "timeout" | "monthly_limit" | "unavailable" | "favorites_full" | "file_quota";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly extra: Record<string, unknown>;

  constructor(status: number, code: ErrorCode, extra: Record<string, unknown> = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Thin JSON client. Bearer token only; never cookies, never a referrer, never cached.
 *
 * It takes a pool of addresses of the same server, most preferred first. Before the first request (and again after a request failed
 * to reach any server) `probePool` picks the first address that answers `/health`; every request then goes to that one. A read (GET) that
 * could not reach the server is repeated once on the address picked next. A write is never repeated on another address (it may have
 * arrived), the error is the answer as before, but the next call already uses the address that works. The choice lives in memory only.
 */
export class Api {
  token: string | null = null;
  /** Called when the server says the session is gone, so the app can lock. */
  onUnauthorized: (() => void) | null = null;

  private readonly bases: string[];
  private active = 0;
  /** The pool probe of the moment (shared by every request that waits for it); null when the choice must be made again. */
  private choice: Promise<void> | null = null;
  private readonly probe: typeof probePool;

  constructor(bases: string | string[], probe: typeof probePool = probePool) {
    this.bases = typeof bases === "string" ? [bases] : [...bases];
    this.probe = probe;
  }

  /** The address requests go to now. */
  get base(): string {
    return this.bases[this.active];
  }

  private choose(): Promise<void> {
    if (this.bases.length < 2) return Promise.resolve();
    this.choice ??= this.probe(this.bases).then(({ index }) => {
      this.active = index;
    });
    return this.choice;
  }

  /** `keepSession`: a 401 here means a wrong password for this one action, not an ended session. */
  async request<T>(method: string, path: string, body?: unknown, opts: { keepSession?: boolean } = {}): Promise<T> {
    await this.choose();
    try {
      return await this.attempt<T>(method, path, body, opts);
    } catch (e) {
      // Status 0 is "no answer at all" (network, timeout): that is when another address may help. Any answer, even an error, is the server's.
      if (!(e instanceof ApiError) || e.status !== 0 || this.bases.length < 2) throw e;
      this.choice = null;
      await this.choose();
      if (method !== "GET") throw e;
      return await this.attempt<T>(method, path, body, opts);
    }
  }

  private async attempt<T>(method: string, path: string, body: unknown, opts: { keepSession?: boolean }): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(this.base + path, {
        method,
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
        headers: {
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, controller.signal.aborted ? "timeout" : "network");
    } finally {
      clearTimeout(timer);
    }
    let json: unknown = {};
    try {
      json = await res.json();
    } catch {
      if (res.ok) throw new ApiError(res.status, "internal");
    }
    if (!res.ok) {
      const e = (json as { error?: { code?: ErrorCode } & Record<string, unknown> }).error ?? {};
      const { code, ...extra } = e;
      if (res.status === 401 && this.token && !opts.keepSession) this.onUnauthorized?.();
      throw new ApiError(res.status, code ?? "internal", extra);
    }
    return json as T;
  }

  get = <T>(path: string) => this.request<T>("GET", path);
  post = <T>(path: string, body: unknown = {}) => this.request<T>("POST", path, body);
  put = <T>(path: string, body: unknown) => this.request<T>("PUT", path, body);
  del = <T>(path: string) => this.request<T>("DELETE", path);
}
