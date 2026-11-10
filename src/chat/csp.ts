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
export function connectSrc(api: string | undefined, ws: string | undefined, voice?: string | undefined): string {
  const origins = [...parseEndpoints(api, "http"), ...parseEndpoints(ws, "ws"), parseEndpoint(voice, "http")]
    .filter((u): u is string => u !== null)
    .map((u) => new URL(u).origin);
  return origins.length ? [...new Set(origins)].join(" ") : "'none'";
}
