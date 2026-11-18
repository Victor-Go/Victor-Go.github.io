/**
 * Parses a server endpoint given at build time. Returns the URL without a trailing slash, or null when it is
 * missing or unusable. Plain http / ws is accepted only for localhost (the simulator).
 */
export function parseEndpoint(raw: string | undefined, kind: "http" | "ws"): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  const secure = kind === "http" ? "https:" : "wss:";
  const insecure = kind === "http" ? "http:" : "ws:";
  if (url.protocol !== secure && !(local && url.protocol === insecure)) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  return url.href.replace(/\/+$/, "");
}

/** The separators of a list of endpoints: commas, and also spaces and new lines, so `a, b` and a list over several lines work. */
const LIST_SEPARATOR = /[\s,]+/;

/**
 * A build value that holds several endpoints (`a,b,c`): the pool. The order is kept, because it is the order they are tried in (the first
 * is preferred); one that appears twice counts once; one that is not usable (see `parseEndpoint`) is left out.
 */
export function parseEndpoints(raw: string | undefined, kind: "http" | "ws"): string[] {
  const out: string[] = [];
  for (const part of (raw ?? "").split(LIST_SEPARATOR)) {
    const url = parseEndpoint(part, kind);
    if (url !== null && !out.includes(url)) out.push(url);
  }
  return out;
}

/** The entries of a list that `parseEndpoints` leaves out (a typo, `http://`, a path with a query): the build warns about them. */
export function unusableEndpoints(raw: string | undefined, kind: "http" | "ws"): string[] {
  return (raw ?? "").split(LIST_SEPARATOR).filter((part) => part !== "" && parseEndpoint(part, kind) === null);
}

/**
 * The `connect-src` value for the chat pages: only the configured server origins (every one of the `api` and `ws` pools), or 'none'.
 * `voice` is the object storage origin that recordings are uploaded to and fetched from (`VITE_CHAT_FILES_ORIGIN`, printed by the
 * server's Terraform as `files_origin`).
 */
export function connectSrc(
  api: string | undefined,
  ws: string | undefined,
  voice?: string | undefined,
  signed?: { sources?: string | undefined; hosts?: string | undefined },
): string {
  const wsPool = parseEndpoints(ws, "ws");
  // Each live-channel (wss) host also gets its https origin: the connectivity check asks the host with one plain HTTPS request (net/health.ts, wsReachUrl).
  const origins = [
    ...parseEndpoints(api, "http"),
    ...wsPool,
    ...wsPool.map((u) => "https://" + new URL(u).host),
    parseEndpoint(voice, "http"),
  ]
    .filter((u): u is string => u !== null)
    .map((u) => new URL(u).origin);
  // The signed address list (net/endpoints.ts): where it is fetched from ('self' for a path on the page's own host) and which families of names
  // an address in it may use. Nothing else can be reached, whatever the list says.
  const { sources, hosts } = parseSignedConfig(signed?.sources, signed?.hosts);
  for (const src of sources) origins.push(src.startsWith("/") ? "'self'" : new URL(src).origin);
  for (const host of hosts) origins.push(`https://${host}`, `wss://${host}`);
  return origins.length ? [...new Set(origins)].join(" ") : "'none'";
}

/** A family of names that a signed address may use: `*.example.com` (a subdomain of a domain we own), never a bare `*` or a whole top-level domain. */
export const HOST_PATTERN = /^\*\.(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

/** Does `host` belong to one of the families (`*.example.com` matches `a.example.com` and `a.b.example.com`, not `example.com`)? */
export function hostMatches(host: string, patterns: string[]): boolean {
  return patterns.some((p) => host.endsWith(p.slice(1)) && host.length > p.length - 1);
}

/**
 * The build values of the signed address list: `sources` (a comma-separated list of absolute https URLs of the signed file, or a path that
 * starts with `/` for a file on the page's own host) and `hosts` (the name families, see HOST_PATTERN). Entries that do not fit are dropped.
 */
export function parseSignedConfig(sources: string | undefined, hosts: string | undefined): { sources: string[]; hosts: string[] } {
  const okSource = (v: string): boolean => {
    if (v.startsWith("/")) return !v.startsWith("//") && !v.includes("..") && !/[?#]/.test(v);
    const u = parseEndpoint(v, "http");
    return u !== null && new URL(u).pathname !== "/" && !/[?#]/.test(v);
  };
  const split = (v: string | undefined): string[] => (v ?? "").split(LIST_SEPARATOR).filter(Boolean);
  return {
    sources: [...new Set(split(sources).filter(okSource))],
    hosts: [...new Set(split(hosts).map((h) => h.toLowerCase()).filter((h) => HOST_PATTERN.test(h)))],
  };
}
