import { useEffect, useRef } from "react";

const IDLE_MILLISECONDS = 5 * 60 * 1000;

/**
 * Discard state on pagehide and bfcache restoration, or after five minutes with
 * no user interaction. Events never read, log, or retain input values.
 */
export function attachWipeListeners(
  onWipe: () => void,
  target: Window = window,
  idleMs = IDLE_MILLISECONDS,
): () => void {
  let timer: number | undefined;
  const stopTimer = () => {
    if (timer !== undefined) target.clearTimeout(timer);
    timer = undefined;
  };
  const restartTimer = () => {
    stopTimer();
    timer = target.setTimeout(() => {
      onWipe();
      restartTimer();
    }, idleMs);
  };
  const onPageHide = () => {
    stopTimer();
    onWipe();
  };
  const onPageShow = (e: Event) => {
    if ((e as PageTransitionEvent).persisted) onWipe();
    restartTimer();
  };
  const activity = ["pointerdown", "keydown", "input", "touchstart", "wheel", "scroll"] as const;
  target.addEventListener("pagehide", onPageHide);
  target.addEventListener("pageshow", onPageShow);
  for (const name of activity) target.addEventListener(name, restartTimer, { passive: true });
  restartTimer();
  return () => {
    stopTimer();
    target.removeEventListener("pagehide", onPageHide);
    target.removeEventListener("pageshow", onPageShow);
    for (const name of activity) target.removeEventListener(name, restartTimer);
  };
}

export function useWipeTriggers(onWipe: () => void): void {
  const ref = useRef(onWipe);
  useEffect(() => {
    ref.current = onWipe;
  });
  useEffect(() => attachWipeListeners(() => ref.current()), []);
}
