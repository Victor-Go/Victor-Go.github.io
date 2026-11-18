/** Contract: chat-server docs/protocol.md section 4. */
export const PROTOCOL_VERSION = 2;
export const HEALTH_TIMEOUT_MS = 5000;
/** Round trips at or above this are shown as "slow". */
export const SLOW_RTT_MS = 1500;

export interface Health {
  server: { version: string; commit: string; builtAt: number; region: string };
  protocol: { current: number; minClient: number };
  /** Only what the sign-up and sign-in page shows before anybody has signed in; the rest of the settings come after sign-in (`config`). */
  features: {
    inviteRequired: boolean;
    retentionDays: number;
  };
  serverTime: number;
}

export type HealthState =
  | { kind: "unconfigured" }
  | { kind: "checking" }
  | { kind: "ok" | "slow"; rttMs: number; health: Health }
  | { kind: "incompatible"; rttMs: number; health: Health }
  | { kind: "down"; reason: "timeout" | "network" | "bad_response" };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, max = 64): string | null => (typeof v === "string" && v.length <= max ? v : null);

/** Anything that does not match the contract is rejected, so a wrong URL never looks like a healthy server. */
export function parseHealth(json: unknown): Health | null {
  if (!isRecord(json) || !isRecord(json.server) || !isRecord(json.protocol) || !isRecord(json.features)) return null;
  const { server, protocol, features } = json;
  const version = str(server.version);
  const commit = str(server.commit);
  const region = str(server.region);
  const builtAt = num(server.builtAt);
  const current = num(protocol.current);
  const minClient = num(protocol.minClient);
  const retentionDays = num(features.retentionDays);
  const serverTime = num(json.serverTime);
  if (
    version === null || commit === null || region === null || builtAt === null || current === null || minClient === null ||
    typeof features.inviteRequired !== "boolean" || retentionDays === null || serverTime === null
  ) {
    return null;
  }
  return {
    server: { version, commit, builtAt, region },
    protocol: { current, minClient },
    features: { inviteRequired: features.inviteRequired, retentionDays },
    serverTime,
  };
}

export interface HealthDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  /** Pool only: how long a base has to answer before the next one is tried alongside it. */
  staggerMs?: number;
}

/** A base that has not answered after this long gets company: the next one of the pool is tried too, and the first to answer is used. */
export const POOL_STAGGER_MS = 1500;

export interface PoolResult {
  /** Which base of the pool answered (0 when none did). */
  index: number;
  state: HealthState;
}

/**
 * Asks the pool in its order of preference: the first base at once, and each next one when the one before has failed, or has not
 * answered within `staggerMs`. The first base that answers wins, so a dead (blocked) preferred address costs a moment, never the timeout.
 * "Answers" means it is our server (the contract of `parseHealth`), whatever its protocol version. When none does, the result is the
 * first base's failure.
 */
export function probePool(bases: string[], deps: HealthDeps = {}): Promise<PoolResult> {
  if (bases.length === 0) return Promise.resolve({ index: 0, state: { kind: "unconfigured" } });
  const stagger = deps.staggerMs ?? POOL_STAGGER_MS;
  return new Promise((resolve) => {
    const started = new Set<number>();
    const timers: ReturnType<typeof setTimeout>[] = [];
    const failures: HealthState[] = [];
    let done = false;
    const finish = (result: PoolResult): void => {
      if (done) return;
      done = true;
      for (const t of timers) clearTimeout(t);
      resolve(result);
    };
    const start = (i: number): void => {
      if (done || i >= bases.length || started.has(i)) return;
      started.add(i);
      if (i + 1 < bases.length) timers.push(setTimeout(() => start(i + 1), stagger));
      void checkOne(bases[i], deps).then((state) => {
        if (state.kind !== "down") return finish({ index: i, state });
        failures[i] = state;
        if (Object.keys(failures).length === bases.length) return finish({ index: 0, state: failures[0] });
        start(i + 1); // a base that failed hands over at once: the next one does not wait out the stagger
      });
    };
    start(0);
  });
}

/** The state of the server: of one base, or of the pool (the first that answers). */
export async function checkHealth(api: string | string[] | null, deps: HealthDeps = {}): Promise<HealthState> {
  if (api === null) return { kind: "unconfigured" };
  if (typeof api === "string") return checkOne(api, deps);
  if (api.length === 1) return checkOne(api[0], deps);
  return (await probePool(api, deps)).state;
}

/** One plain HTTPS request: no cookies, no referrer, no cache. Never opens a WebSocket. */
async function checkOne(api: string | null, deps: HealthDeps): Promise<HealthState> {
  if (!api) return { kind: "unconfigured" };
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => performance.now());
  const timeoutMs = deps.timeoutMs ?? HEALTH_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = now();
  try {
    const res = await fetchImpl(`${api}/health`, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    if (!res.ok) return { kind: "down", reason: "bad_response" };
    const health = parseHealth(await res.json());
    if (!health) return { kind: "down", reason: "bad_response" };
    const rttMs = Math.round(now() - started);
    if (PROTOCOL_VERSION < health.protocol.minClient) return { kind: "incompatible", rttMs, health };
    return { kind: rttMs >= SLOW_RTT_MS ? "slow" : "ok", rttMs, health };
  } catch (e) {
    if (controller.signal.aborted) return { kind: "down", reason: "timeout" };
    return { kind: "down", reason: e instanceof SyntaxError ? "bad_response" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- the WebSocket side ----------

export type WsState =
  | { kind: "unconfigured" }
  | { kind: "checking" }
  | { kind: "ok" | "slow"; rttMs: number }
  | { kind: "down"; reason: "timeout" | "network" };

/**
 * A browser WebSocket never says why a handshake failed (a refused ticket and a blocked address both end as code 1006), so the live channel is
 * checked without opening one: one plain HTTPS request to the same host. It goes through the same DNS answer, address, port and TLS name that a
 * blocker acts on, and any HTTP answer at all (even the 4xx that API Gateway gives a WebSocket host) proves they work. `no-cors` means the answer
 * is never read, so no CORS header is needed and nothing reaches the server's code (no Lambda, no database).
 */
export function wsReachUrl(ws: string): string {
  const u = new URL(ws);
  u.protocol = u.protocol === "wss:" ? "https:" : "http:";
  return u.href;
}

async function reachOne(ws: string, deps: HealthDeps): Promise<WsState> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => performance.now());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? HEALTH_TIMEOUT_MS);
  const started = now();
  try {
    await fetchImpl(wsReachUrl(ws), {
      method: "GET",
      mode: "no-cors",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    const rttMs = Math.round(now() - started);
    return { kind: rttMs >= SLOW_RTT_MS ? "slow" : "ok", rttMs };
  } catch {
    return { kind: "down", reason: controller.signal.aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

export interface WsPoolResult {
  /** Which address of the pool answered (0 when none did). */
  index: number;
  state: WsState;
}

/** The same order as `probePool`: the first address at once, each next one when the one before failed or has been silent for `staggerMs`. */
export function probeWsPool(urls: string[], deps: HealthDeps = {}): Promise<WsPoolResult> {
  if (urls.length === 0) return Promise.resolve({ index: 0, state: { kind: "unconfigured" } });
  const stagger = deps.staggerMs ?? POOL_STAGGER_MS;
  return new Promise((resolve) => {
    const started = new Set<number>();
    const timers: ReturnType<typeof setTimeout>[] = [];
    const failures: WsState[] = [];
    let done = false;
    const finish = (result: WsPoolResult): void => {
      if (done) return;
      done = true;
      for (const t of timers) clearTimeout(t);
      resolve(result);
    };
    const start = (i: number): void => {
      if (done || i >= urls.length || started.has(i)) return;
      started.add(i);
      if (i + 1 < urls.length) timers.push(setTimeout(() => start(i + 1), stagger));
      void reachOne(urls[i], deps).then((state) => {
        if (state.kind !== "down") return finish({ index: i, state });
        failures[i] = state;
        if (Object.keys(failures).length === urls.length) return finish({ index: 0, state: failures[0] });
        start(i + 1);
      });
    };
    start(0);
  });
}

// ---------- both together ----------

/** What the person is told. The latency is the average of the two channels when both answered; a channel that failed is never averaged in. */
export type Connectivity =
  | { kind: "checking" | "unconfigured" | "incompatible" | "allDown" }
  | { kind: "ok" | "slow"; rttMs: number; httpMs: number; wsMs: number | null }
  /** The sign-in interface (HTTPS) cannot be reached. `wsMs` is the live channel's latency when that one answers. */
  | { kind: "httpDown"; reason: "timeout" | "network" | "bad_response"; wsMs: number | null }
  /** The live channel (WebSocket host) cannot be reached while the sign-in interface works. */
  | { kind: "wsDown"; httpMs: number };

export function summarize(http: HealthState, ws: WsState): Connectivity {
  if (http.kind === "unconfigured") return { kind: "unconfigured" };
  if (http.kind === "checking" || ws.kind === "checking") return { kind: "checking" };
  if (http.kind === "incompatible") return { kind: "incompatible" };
  const wsMs = ws.kind === "ok" || ws.kind === "slow" ? ws.rttMs : null;
  if (http.kind === "down") return ws.kind === "down" ? { kind: "allDown" } : { kind: "httpDown", reason: http.reason, wsMs };
  if (ws.kind === "down") return { kind: "wsDown", httpMs: http.rttMs };
  const times = wsMs === null ? [http.rttMs] : [http.rttMs, wsMs];
  const slow = http.kind === "slow" || ws.kind === "slow";
  return { kind: slow ? "slow" : "ok", rttMs: Math.round(times.reduce((a, b) => a + b, 0) / times.length), httpMs: http.rttMs, wsMs };
}
