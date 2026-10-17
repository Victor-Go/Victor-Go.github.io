import { useEffect, useRef } from "react";

/**
 * Calls `onWipe` on page hide and on bfcache restore (pageshow with persisted).
 * There is deliberately no idle timer. Returns a cleanup function.
 */
export function attachWipeListeners(onWipe: () => void, target: Window = window): () => void {
  const onPageHide = () => onWipe();
  const onPageShow = (e: Event) => {
    if ((e as PageTransitionEvent).persisted) onWipe();
  };
  target.addEventListener("pagehide", onPageHide);
  target.addEventListener("pageshow", onPageShow);
  return () => {
    target.removeEventListener("pagehide", onPageHide);
    target.removeEventListener("pageshow", onPageShow);
  };
}

export function useWipeTriggers(onWipe: () => void): void {
  const ref = useRef(onWipe);
  useEffect(() => {
    ref.current = onWipe;
  });
  useEffect(() => attachWipeListeners(() => ref.current()), []);
}
