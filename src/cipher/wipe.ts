import { useEffect, useRef } from "react";

const IDLE_MILLISECONDS = 5 * 60 * 1000;
/** The /cipher page uses a longer, user-switchable idle timeout. */
export const CIPHER_IDLE_MILLISECONDS = 10 * 60 * 1000;

/** Long-running work (file encryption) dispatches this on window so it counts as user activity. */
export const ACTIVITY_EVENT = "cipher-activity";

/**
 * Discard state on pagehide and bfcache restoration, and (unless idleMs is null)
 * after idleMs with no user interaction. Events never read, log, or retain
 * input values.
 */
export function attachWipeListeners(
  onWipe: () => void,
  target: Window = window,
  idleMs: number | null = IDLE_MILLISECONDS,
): () => void {
  let timer: number | undefined;
  const stopTimer = () => {
    if (timer !== undefined) target.clearTimeout(timer);
    timer = undefined;
  };
  const restartTimer = () => {
    stopTimer();
    if (idleMs === null) return;
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
  const activity = ["pointerdown", "keydown", "input", "touchstart", "wheel", "scroll", ACTIVITY_EVENT] as const;
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

export function useWipeTriggers(onWipe: () => void, idleMs: number | null = IDLE_MILLISECONDS): void {
  const ref = useRef(onWipe);
  useEffect(() => {
    ref.current = onWipe;
  });
  useEffect(() => attachWipeListeners(() => ref.current(), window, idleMs), [idleMs]);
}
