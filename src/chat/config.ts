import { parseEndpoint } from "./csp";

export interface ChatConfig {
  /** HTTPS base URL of the chat server, without a trailing slash; null when the build has none. */
  api: string | null;
  /** WSS URL of the chat server; null when the build has none. */
  ws: string | null;
  /** Origin of the object storage that holds voice recordings; null when the build has none. Only the page's CSP needs it (vite.config.ts). */
  voice: string | null;
}

/**
 * Endpoints come from the build. Nothing is hard-coded to a domain.
 * - `VITE_CHAT_API`: HTTPS base URL of the chat server.
 * - `VITE_CHAT_WS`: its WSS URL.
 * - `VITE_CHAT_VOICE_ORIGIN`: origin of the voice storage (the server's Terraform prints it as `voice_origin`); it goes into the CSP `connect-src`,
 *   without it recordings can be neither sent nor played.
 */
export function getConfig(): ChatConfig {
  return {
    api: parseEndpoint(import.meta.env.VITE_CHAT_API, "http"),
    ws: parseEndpoint(import.meta.env.VITE_CHAT_WS, "ws"),
    voice: parseEndpoint(import.meta.env.VITE_CHAT_VOICE_ORIGIN, "http"),
  };
}
