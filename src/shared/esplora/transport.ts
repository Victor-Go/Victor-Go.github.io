import { NetworkError, NotFoundError } from "./errors";

// The only module that touches the network for the Esplora-based pages (/scan and /trace).
// Requests carry no cookies, no referrer and no cache entries; nothing is stored afterwards.
export const PROVIDERS = ["https://mempool.space/api", "https://blockstream.info/api"] as const;
/** Endpoints only mempool.space has (blockstream answers 404 for them). */
export const MEMPOOL = PROVIDERS[0];

/** One attempt is abandoned after this long (a caller may ask for longer, e.g. for 700 KB pages). */
const ATTEMPT_TIMEOUT_MS = 8_000;
/** If the first provider has not answered by then, ask the next one too and take whichever wins. */
const HEDGE_AFTER_MS = 2_000;
/** A provider that just failed is tried last for this long (flat penalty, used by /scan). */
const PENALTY_MS = 30_000;
/** Exponential penalty for callers that opt in (/trace): first failure, then doubling, never above PENALTY_MS. */
const BACKOFF_BASE_MS = 2_000;
/** A request still unanswered after this long is reported as slow, so a page does not look stuck. */
const SLOW_AFTER_MS = 8_000;
/** Public providers throttle bursts (HTTP 429), so cap what is in flight at each one. */
const MAX_PER_PROVIDER = 3;
/**
 * When every provider has just failed, new lookups fail at once for this long instead of hammering
 * servers that are already refusing us. Each lookup tries each provider at most once, never in rounds.
 * A caller that makes many requests passes `cooldown: false` and relies on backoff + retries instead.
 */
const COOLDOWN_MS = 5_000;

export interface RequestOptions {
  /** Ask only these providers (for endpoints not every provider has). Default: all. */
  only?: readonly string[];
  /** Apply the 5 s fail-fast cooldown (default true). */
  cooldown?: boolean;
  /** Per-attempt timeout in ms (default 8000). */
  timeoutMs?: number;
  /** Penalise a failing provider exponentially (2 s, 4 s ... 30 s) instead of a flat 30 s. */
  backoff?: boolean;
  /** After all providers failed, wait out the shortest penalty and try again, up to this many times (default 0). */
  retries?: number;
}

/** What the last request ran into: an HTTP status (429 = throttled), 0 for a timeout or no connection, -1 for "still waiting" (slow); undefined once one succeeds. */
export type Trouble = { status: number } | undefined;

const listeners = new Set<(t: Trouble) => void>();
const emit = (t: Trouble) => listeners.forEach((cb) => cb(t));

/** Lets a page show that the data sources are refusing or not answering, instead of looking stuck. */
export function subscribeTrouble(cb: (t: Trouble) => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

interface ProviderState {
  penalizedUntil: number;
  failures: number;
  inflight: number;
  waiters: (() => void)[];
}

const freshState = (): Map<string, ProviderState> =>
  new Map(PROVIDERS.map((p) => [p, { penalizedUntil: 0, failures: 0, inflight: 0, waiters: [] }]));

let providers = freshState();
let rotation = 0;
let coolUntil = 0;

/** Forgets which providers failed and restarts the rotation. For tests. */
export function resetTransportState(): void {
  providers = freshState();
  rotation = 0;
  coolUntil = 0;
}

/** Healthy providers first, taking turns so concurrent lookups spread over all; failed ones last. */
function providerOrder(only?: readonly string[]): string[] {
  const now = Date.now();
  const list = only ? PROVIDERS.filter((p) => only.includes(p)) : PROVIDERS;
  const start = rotation++ % list.length;
  const turn = list.map((_, i) => list[(start + i) % list.length]);
  const ok = (p: string) => providers.get(p)!.penalizedUntil <= now;
  return [...turn.filter(ok), ...turn.filter((p) => !ok(p))];
}

function penalize(s: ProviderState, backoff: boolean): void {
  s.failures++;
  const ms = backoff ? Math.min(BACKOFF_BASE_MS * 2 ** (s.failures - 1), PENALTY_MS) : PENALTY_MS;
  s.penalizedUntil = Date.now() + ms;
}

/** Takes one of the provider's slots, waiting for a free one. A freed slot is handed straight to the next waiter. */
async function acquire(base: string, signal: AbortSignal): Promise<() => void> {
  const s = providers.get(base)!;
  if (s.inflight < MAX_PER_PROVIDER) s.inflight++;
  else {
    await new Promise<void>((resolve, reject) => {
      const wake = () => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      };
      const onAbort = () => {
        s.waiters.splice(s.waiters.indexOf(wake), 1);
        reject(signal.reason);
      };
      s.waiters.push(wake);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
  return () => {
    const next = s.waiters.shift();
    if (next) next();
    else s.inflight--;
  };
}

type Outcome = { kind: "ok"; text: string } | { kind: "notfound"; status: number } | { kind: "fail" };

/** Statuses that are an answer rather than an outage: do not repeat the query at the next provider. */
const ANSWERS = new Set([400, 404, 422]);

async function attempt(
  base: string,
  path: string,
  signal: AbortSignal,
  onSent: () => void,
  timeoutMs = ATTEMPT_TIMEOUT_MS,
  backoff = false,
): Promise<Outcome> {
  const state = providers.get(base)!;
  let release: (() => void) | undefined;
  let slow: ReturnType<typeof setTimeout> | undefined;
  try {
    release = await acquire(base, signal);
    onSent(); // only now is the request really on its way (it may have queued for a slot first)
    slow = setTimeout(() => emit({ status: -1 }), SLOW_AFTER_MS);
    const res = await fetch(base + path, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
    });
    if (ANSWERS.has(res.status)) return { kind: "notfound", status: res.status };
    if (!res.ok) {
      penalize(state, backoff);
      emit({ status: res.status });
      return { kind: "fail" };
    }
    const text = await res.text();
    state.penalizedUntil = 0;
    state.failures = 0;
    emit(undefined);
    return { kind: "ok", text };
  } catch {
    // Losing a race (our own abort) says nothing about the provider's health.
    if (!signal.aborted) {
      penalize(state, backoff);
      emit({ status: 0 });
    }
    return { kind: "fail" };
  } finally {
    clearTimeout(slow);
    release?.();
  }
}

/** A single request to one named provider, no racing and no cooldown. Used for optional extras. */
export async function attemptOne(base: string, path: string, signal: AbortSignal): Promise<string | undefined> {
  const o = await attempt(base, path, signal, () => {});
  return o.kind === "ok" ? o.text : undefined;
}

/**
 * Asks the providers in turn: the next one is started as soon as the current one fails, or after
 * HEDGE_AFTER_MS if it is merely slow. The first real answer wins and the rest are cancelled.
 */
async function race(path: string, signal: AbortSignal, opts: RequestOptions): Promise<Outcome> {
  const own = new AbortController();
  const forward = () => own.abort(signal.reason);
  signal.addEventListener("abort", forward, { once: true });
  const queue = providerOrder(opts.only);
  try {
    return await new Promise<Outcome>((resolve) => {
      let next = 0;
      let pending = 0;
      let done = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (o: Outcome) => {
        done = true;
        clearTimeout(timer);
        resolve(o);
      };
      const launch = (): boolean => {
        if (done || next >= queue.length) return false;
        pending++;
        const onSent = () => {
          // The wait for a provider's free slot is our own queueing, not the provider being slow.
          if (done || next >= queue.length) return;
          clearTimeout(timer);
          timer = setTimeout(launch, HEDGE_AFTER_MS);
        };
        void attempt(queue[next++], path, own.signal, onSent, opts.timeoutMs, opts.backoff).then((o) => {
          pending--;
          if (done) return;
          if (o.kind !== "fail") finish(o);
          else if (!launch() && pending === 0) finish(o);
        });
        return true;
      };
      launch();
    });
  } finally {
    own.abort();
    signal.removeEventListener("abort", forward);
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function once(path: string, signal: AbortSignal, opts: RequestOptions): Promise<string> {
  const cooling = opts.cooldown !== false;
  if (cooling && Date.now() < coolUntil) throw new NetworkError();
  const o = await race(path, signal, opts);
  signal.throwIfAborted();
  if (o.kind === "ok") return o.text;
  if (o.kind === "notfound") {
    const e = new NotFoundError();
    e.status = o.status;
    throw e;
  }
  if (cooling) coolUntil = Date.now() + COOLDOWN_MS;
  throw new NetworkError();
}

/** The response body of GET `path` from the first provider that answers. Throws NotFoundError / NetworkError. */
export async function request(path: string, signal: AbortSignal, opts: RequestOptions = {}): Promise<string> {
  const retries = opts.retries ?? 0;
  for (let i = 0; ; i++) {
    try {
      return await once(path, signal, opts);
    } catch (e) {
      if (!(e instanceof NetworkError) || i >= retries) throw e;
      const candidates = (opts.only ?? PROVIDERS).map((p) => providers.get(p)!.penalizedUntil);
      const wait = Math.min(Math.max(Math.min(...candidates) - Date.now(), 500), PENALTY_MS);
      await sleep(wait, signal);
    }
  }
}
