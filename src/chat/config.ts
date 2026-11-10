import { parseEndpoint, parseEndpoints } from "./csp";

export interface ChatConfig {
  /** HTTPS base URLs of the chat server, without a trailing slash, in the order they are tried (the first is preferred); empty when the build has none. */
  api: string[];
  /** WSS URLs of the chat server, in the order they are tried; empty when the build has none. */
  ws: string[];
  /** Origin of the object storage that holds files (voice recordings and pictures); null when the build has none. Only the page's CSP needs it (vite.config.ts). */
  files: string | null;
}

/**
 * Endpoints come from the build. Nothing is hard-coded to a domain.
 * - `VITE_CHAT_API`: HTTPS base URL of the chat server, or several separated by commas (`a,b,c`): a pool. The first is preferred; when it
 *   does not answer, the next one is used (net/api.ts).
 * - `VITE_CHAT_WS`: its WSS URL, or a pool of them the same way (net/socket.ts). The two pools fail over on their own: any API address may be
 *   used with any WSS address, because every address reaches the same server (the one-time ticket is the server's, not the address's).
 * - `VITE_CHAT_FILES_ORIGIN`: origin of the file storage (the server's Terraform prints it as `files_origin`); it goes into the CSP `connect-src`,
 *   without it recordings can be neither sent nor played.
 */
export function getConfig(): ChatConfig {
  return {
    api: parseEndpoints(import.meta.env.VITE_CHAT_API, "http"),
    ws: parseEndpoints(import.meta.env.VITE_CHAT_WS, "ws"),
    files: parseEndpoint(import.meta.env.VITE_CHAT_FILES_ORIGIN, "http"),
  };
}
