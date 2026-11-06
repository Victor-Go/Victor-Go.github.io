import { parseEndpoint } from "./csp";

export interface ChatConfig {
  /** HTTPS base URL of the chat server, without a trailing slash; null when the build has none. */
  api: string | null;
  /** WSS URL of the chat server; null when the build has none. */
  ws: string | null;
}

/** Endpoints come from the build (`VITE_CHAT_API`, `VITE_CHAT_WS`). Nothing is hard-coded to a domain. */
export function getConfig(): ChatConfig {
  return {
    api: parseEndpoint(import.meta.env.VITE_CHAT_API, "http"),
    ws: parseEndpoint(import.meta.env.VITE_CHAT_WS, "ws"),
  };
}
