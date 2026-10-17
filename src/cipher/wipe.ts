import { useEffect, useRef } from "react";

export const IDLE_MS = 5 * 60 * 1000;

const ACTIVITY_EVENTS = ["keydown", "pointerdown", "pointermove", "input", "wheel", "touchstart"] as const;

/**
 * Calls `onWipe` on page hide, on bfcache restore (pageshow with persisted) and after
 * IDLE_MS without user activity. Returns a cleanup function.
 */
export function attachWipeListeners(onWipe: () => void, target: Window = window, idleMs = IDLE_MS): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(onWipe, idleMs);
  };
  const onPageHide = () => onWipe();
  const onPageShow = (e: Event) => {
    if ((e as PageTransitionEvent).persisted) onWipe();
  };
  target.addEventListener("pagehide", onPageHide);
  target.addEventListener("pageshow", onPageShow);
  for (const ev of ACTIVITY_EVENTS) target.addEventListener(ev, arm, { passive: true, capture: true });
  arm();
  return () => {
    clearTimeout(timer);
    target.removeEventListener("pagehide", onPageHide);
    target.removeEventListener("pageshow", onPageShow);
    for (const ev of ACTIVITY_EVENTS) target.removeEventListener(ev, arm, { capture: true });
  };
}

export function useWipeTriggers(onWipe: () => void): void {
  const ref = useRef(onWipe);
  useEffect(() => {
    ref.current = onWipe;
  });
  useEffect(() => attachWipeListeners(() => ref.current()), []);
}
