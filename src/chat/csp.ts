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

/**
 * The `connect-src` value for the chat pages: only the configured server origins, or 'none'. `voice` is the object storage origin that
 * recordings are uploaded to and fetched from (`VITE_CHAT_FILES_ORIGIN`, printed by the server's Terraform as `files_origin`).
 */
export function connectSrc(api: string | undefined, ws: string | undefined, voice?: string | undefined): string {
  const origins = [parseEndpoint(api, "http"), parseEndpoint(ws, "ws"), parseEndpoint(voice, "http")]
    .filter((u): u is string => u !== null)
    .map((u) => new URL(u).origin);
  return origins.length ? [...new Set(origins)].join(" ") : "'none'";
}
