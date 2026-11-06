import { useSyncExternalStore } from "react";

/**
 * A tiny in-memory router for the one-page app. Every screen has its own address, so the browser's back gesture (the phone's
 * edge swipe) walks back through the screens instead of leaving the chat. The session lives only in memory and nothing is
 * written to cookies or storage: moving between addresses is pushState, which never reloads the page, so it never signs out.
 *
 * Only an opaque key and a depth go into the history entry. What a screen needs besides its address (which chat, which user) is
 * kept in memory under that key, because history entries can be written to disk by the browser.
 */
import { isChatPath } from "./paths";
export * from "./paths";

export interface Loc {
  path: string;
  /** In-memory extra for the screen (a chat id, a user record); never put in the history entry. */
  payload: unknown;
  depth: number;
}

interface Entry {
  k: string;
  d: number;
}

const normalize = (p: string): string => (p.endsWith("/") ? p : p + "/");

const payloads = new Map<string, unknown>();
/** The path at each depth of the current trail, to tell whether "back" is the same address as the one just before. */
const trail = new Map<number, string>();
const listeners = new Set<() => void>();
let counter = 0;
const newKey = (): string => `${Date.now().toString(36)}.${(counter++).toString(36)}`;

const entryOf = (): Entry => {
  const st = window.history.state as Partial<Entry> | null;
  return { k: typeof st?.k === "string" ? st.k : "", d: typeof st?.d === "number" ? st.d : 0 };
};

let current: Loc = { path: normalize(window.location.pathname), payload: undefined, depth: entryOf().d };
trail.set(current.depth, current.path);
/** The address the page was loaded at, so a sign-in can continue there. */
export const startPath: string = current.path;

const emit = (): void => {
  for (const l of listeners) l();
};

const sync = (): void => {
  const e = entryOf();
  current = { path: normalize(window.location.pathname), payload: payloads.get(e.k), depth: e.d };
  trail.set(current.depth, current.path);
  emit();
};
window.addEventListener("popstate", sync);

/**
 * Goes to a screen. When the screen is the one just before this one in the trail it goes back instead of pushing, so the in-app
 * back buttons and the swipe gesture leave the same history. `replace` swaps the current entry (used for tab switches, and between
 * two chats so a wide screen's chat list does not fill the history).
 */
export function go(path: string, payload?: unknown, opts: { replace?: boolean } = {}): void {
  const cur = current;
  const target = normalize(path);
  if (target === cur.path && payload === undefined) return;
  if (!opts.replace && payload === undefined && cur.depth > 0 && trail.get(cur.depth - 1) === target) {
    window.history.back();
    return;
  }
  const replace = opts.replace || (isChatPath(cur.path) && isChatPath(target));
  const k = newKey();
  const d = replace ? cur.depth : cur.depth + 1;
  const old = entryOf().k;
  if (replace) {
    window.history.replaceState({ k, d } satisfies Entry, "", target);
    payloads.delete(old);
  } else {
    window.history.pushState({ k, d } satisfies Entry, "", target);
  }
  if (payload !== undefined) payloads.set(k, payload);
  current = { path: target, payload, depth: d };
  trail.set(d, target);
  emit();
}

/** Back one screen: the browser's own back when this app put an entry before this one, else a replace to `fallback`. */
export function back(fallback: string): void {
  if (current.depth > 0) window.history.back();
  else go(fallback, undefined, { replace: true });
}

export function useLocation(): Loc {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => current,
  );
}

/** Keeps the address bar honest without adding history (sign-in and sign-out replace the entry). */
export function showPath(path: string): void {
  go(path, undefined, { replace: true });
}
