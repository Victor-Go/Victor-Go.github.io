import { parseEndpoint, parseEndpoints, parseSignedConfig } from "./csp";

export interface ChatConfig {
  /** HTTPS base URLs of the chat server, without a trailing slash, in the order they are tried (the first is preferred); empty when the build has none. */
  api: string[];
  /** WSS URLs of the chat server, in the order they are tried; empty when the build has none. */
  ws: string[];
  /** Origin of the object storage that holds files (voice recordings and pictures); null when the build has none. Only the page's CSP needs it (vite.config.ts). */
  files: string | null;
  /** The signed address list (net/endpoints.ts): null when the build has no public key, so nothing is ever fetched or trusted. */
  signed: { key: string; sources: string[]; hosts: string[] } | null;
}

/** Addresses that the signed list added in front of the build's own (memory only, set by net/endpoints.ts before the page is shown). */
let override: { api: string[]; ws: string[] } | null = null;

export function setPools(pools: { api: string[]; ws: string[] } | null): void {
  override = pools;
}

/**
 * Endpoints come from the build. Nothing is hard-coded to a domain.
 * - `VITE_CHAT_API`: HTTPS base URL of the chat server, or several separated by commas (`a,b,c`): a pool. The first is preferred; when it
 *   does not answer, the next one is used (net/api.ts).
 * - `VITE_CHAT_WS`: its WSS URL, or a pool of them the same way (net/socket.ts). The two pools fail over on their own: any API address may be
 *   used with any WSS address, because every address reaches the same server (the one-time ticket is the server's, not the address's).
 * - `VITE_CHAT_ENDPOINTS_KEY` (Ed25519 public key, base64, 32 bytes), `VITE_CHAT_ENDPOINTS_SOURCES` (where the signed address list is, default
 *   `/chat/endpoints.json`) and `VITE_CHAT_ENDPOINT_HOSTS` (the name families a signed address may use, `*.example.com`): see net/endpoints.ts.
 * - `VITE_CHAT_FILES_ORIGIN`: origin of the file storage (the server's Terraform prints it as `files_origin`); it goes into the CSP `connect-src`,
 *   without it recordings can be neither sent nor played.
 */
export function getConfig(): ChatConfig {
  const key = (import.meta.env.VITE_CHAT_ENDPOINTS_KEY ?? "").trim();
  const { sources, hosts } = parseSignedConfig(import.meta.env.VITE_CHAT_ENDPOINTS_SOURCES || "/chat/endpoints.json", import.meta.env.VITE_CHAT_ENDPOINT_HOSTS);
  return {
    api: override?.api ?? parseEndpoints(import.meta.env.VITE_CHAT_API, "http"),
    ws: override?.ws ?? parseEndpoints(import.meta.env.VITE_CHAT_WS, "ws"),
    files: parseEndpoint(import.meta.env.VITE_CHAT_FILES_ORIGIN, "http"),
    signed: key ? { key, sources, hosts } : null,
  };
}

/** The addresses the build itself carries, whatever a signed list added (the fallback behind it). */
export function builtPools(): { api: string[]; ws: string[] } {
  return { api: parseEndpoints(import.meta.env.VITE_CHAT_API, "http"), ws: parseEndpoints(import.meta.env.VITE_CHAT_WS, "ws") };
}
