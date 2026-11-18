import { builtPools, getConfig, setPools } from "../config";
import { hostMatches, parseEndpoints } from "../csp";

/**
 * The signed address list: a way to move the pages to new server addresses without rebuilding them.
 *
 * `endpoints.json` sits next to every copy of the page (`/chat/endpoints.json`):
 *   { "v": 1, "seq": 7, "api": ["https://api.example.com"], "ws": ["wss://ws.example.com"], "sig": "<base64>" }
 * `sig` is an Ed25519 signature, by a key whose public half is in the build (`VITE_CHAT_ENDPOINTS_KEY`), over `canonical()`. The private key never
 * leaves the operator, so whoever controls a copy of the page, or the network between the page and its files, cannot point it elsewhere. Of the
 * lists that verify, the one with the highest `seq` wins. Its addresses go in front of the build's own, which stay as the fallback behind them.
 *
 * Three limits keep it from widening what the page can reach: the page's CSP only allows the families of names named at build time
 * (`VITE_CHAT_ENDPOINT_HOSTS`, e.g. `*.example.com`), an address outside them is dropped here too, and nothing is stored (memory only).
 */

export interface SignedEndpoints {
  seq: number;
  api: string[];
  ws: string[];
}

/** The exact text that is signed: one unambiguous line per field, so no two different lists can have the same text. */
export function canonical(e: SignedEndpoints): string {
  return ["chat-endpoints-v1", String(e.seq), e.api.join(","), e.ws.join(",")].join("\n");
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] | null => (Array.isArray(v) && v.length <= 32 && v.every((x) => typeof x === "string" && x.length <= 300) ? (v as string[]) : null);

const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** The signed list if its signature verifies, else null. Never throws: a bad file is the same as no file. */
export async function verifyEndpoints(json: unknown, publicKeyB64: string, subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle): Promise<SignedEndpoints | null> {
  try {
    if (!subtle || !isRecord(json) || json.v !== 1) return null;
    const api = strings(json.api);
    const ws = strings(json.ws);
    if (!api || !ws || !Number.isSafeInteger(json.seq) || (json.seq as number) < 0 || typeof json.sig !== "string" || json.sig.length > 200) return null;
    // A comma would let one entry pass as two in the signed text.
    if ([...api, ...ws].some((x) => /[,\n]/.test(x))) return null;
    const list: SignedEndpoints = { seq: json.seq as number, api, ws };
    const key = await subtle.importKey("raw", fromB64(publicKeyB64) as BufferSource, { name: "Ed25519" }, false, ["verify"]);
    const ok = await subtle.verify({ name: "Ed25519" }, key, fromB64(json.sig) as BufferSource, new TextEncoder().encode(canonical(list)) as BufferSource);
    return ok ? list : null;
  } catch {
    return null;
  }
}

export interface EndpointDeps {
  fetchImpl?: typeof fetch;
  subtle?: SubtleCrypto;
  timeoutMs?: number;
  /** The page's own origin, to turn a path into an address (default: where the page is). */
  origin?: string;
}

/** The best verified list among the sources (all asked at once), or null. */
export async function fetchSigned(sources: string[], publicKeyB64: string, deps: EndpointDeps = {}): Promise<SignedEndpoints | null> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const origin = deps.origin ?? location.origin;
  const one = async (url: string): Promise<SignedEndpoints | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 2000);
    try {
      const res = await fetchImpl(url, {
        method: "GET",
        credentials: "omit",
        cache: "no-cache",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      if (!res.ok) return null;
      return await verifyEndpoints(await res.json(), publicKeyB64, deps.subtle);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
  const urls = [...new Set(sources.map((s) => new URL(s, origin).href))]; // the page's own path and its absolute form are one file
  const found = (await Promise.all(urls.map(one))).filter((x): x is SignedEndpoints => x !== null);
  return found.length ? found.reduce((best, e) => (e.seq > best.seq ? e : best)) : null;
}

/** The signed addresses that the build allows (a family of names it named, or a host it already carries), in the order given, then the build's own. */
export function mergePool(signed: string[], built: string[], kind: "http" | "ws", families: string[]): string[] {
  const known = new Set(built.map((u) => new URL(u).hostname));
  const allowed = parseEndpoints(signed.join(","), kind).filter((u) => {
    const host = new URL(u).hostname;
    return known.has(host) || hostMatches(host, families);
  });
  return [...new Set([...allowed, ...built])];
}

/**
 * Called once before the page is drawn: fetches the signed list and, when one verifies, puts its addresses in front of the build's.
 * Does nothing (and asks for nothing) in a build without a public key.
 */
export async function refreshEndpoints(deps: EndpointDeps = {}): Promise<void> {
  const { signed } = getConfig();
  if (!signed || signed.sources.length === 0) return;
  const list = await fetchSigned(signed.sources, signed.key, deps);
  if (!list) return;
  const built = builtPools();
  setPools({
    api: mergePool(list.api, built.api, "http", signed.hosts),
    ws: mergePool(list.ws, built.ws, "ws", signed.hosts),
  });
}
