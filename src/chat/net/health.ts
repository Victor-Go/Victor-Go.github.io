/** Contract: chat-server docs/protocol.md section 4. */
export const PROTOCOL_VERSION = 1;
export const HEALTH_TIMEOUT_MS = 5000;
/** Round trips at or above this are shown as "slow". */
export const SLOW_RTT_MS = 1500;

export interface Health {
  server: { version: string; commit: string; builtAt: number; region: string };
  protocol: { current: number; minClient: number };
  features: {
    inviteRequired: boolean;
    groupMax: number;
    retentionDays: number;
    messageMaxChars: number;
    voiceMaxSec: number;
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
  const groupMax = num(features.groupMax);
  const retentionDays = num(features.retentionDays);
  const messageMaxChars = num(features.messageMaxChars);
  const voiceMaxSec = num(features.voiceMaxSec);
  const serverTime = num(json.serverTime);
  if (
    version === null || commit === null || region === null || builtAt === null || current === null || minClient === null ||
    typeof features.inviteRequired !== "boolean" || groupMax === null || retentionDays === null ||
    messageMaxChars === null || voiceMaxSec === null || serverTime === null
  ) {
    return null;
  }
  return {
    server: { version, commit, builtAt, region },
    protocol: { current, minClient },
    features: { inviteRequired: features.inviteRequired, groupMax, retentionDays, messageMaxChars, voiceMaxSec },
    serverTime,
  };
}

export interface HealthDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

/** One plain HTTPS request: no cookies, no referrer, no cache. Never opens a WebSocket. */
export async function checkHealth(api: string | null, deps: HealthDeps = {}): Promise<HealthState> {
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
