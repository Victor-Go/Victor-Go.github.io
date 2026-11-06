import { useEffect, useRef } from "react";

const IDLE_MILLISECONDS = 5 * 60 * 1000;

/** Idle times the user can pick on the tool pages, in minutes. Nothing longer than an hour. */
export const WIPE_CHOICES = [5, 10, 30, 60] as const;
export const DEFAULT_WIPE_MINUTES = 10;
export const MAX_WIPE_MILLISECONDS = 60 * 60 * 1000;

/** Long-running work (file encryption) dispatches this on window so it counts as user activity. */
export const ACTIVITY_EVENT = "cipher-activity";

/**
 * Discard state on pagehide and bfcache restoration, and (unless idleMs is null)
 * after idleMs with no user interaction, never more than an hour. Events never read, log, or retain
 * input values.
 *
 * Idleness is judged from the time of the last interaction, not from a countdown: a phone that froze the page in the
 * background cannot make it overstay, because the clock is checked again the moment the page is visible. Nothing is stored.
 */
export function attachWipeListeners(
  onWipe: () => void,
  target: Window = window,
  idleMs: number | null = IDLE_MILLISECONDS,
): () => void {
  const limit = idleMs === null ? null : Math.min(idleMs, MAX_WIPE_MILLISECONDS);
  let last = Date.now();
  const check = () => {
    if (limit !== null && Date.now() - last >= limit) {
      onWipe();
      last = Date.now();
    }
  };
  const touch = () => {
    last = Date.now();
  };
  const onPageHide = () => {
    onWipe();
    last = Date.now();
  };
  const onPageShow = (e: Event) => {
    if ((e as PageTransitionEvent).persisted) onWipe();
    last = Date.now();
  };
  const onVisible = () => {
    if (target.document.visibilityState === "visible") check();
  };
  const activity = ["pointerdown", "pointermove", "keydown", "input", "touchstart", "touchmove", "wheel", "scroll", ACTIVITY_EVENT] as const;
  const timer = target.setInterval(check, 1000);
  target.addEventListener("pagehide", onPageHide);
  target.addEventListener("pageshow", onPageShow);
  target.document.addEventListener("visibilitychange", onVisible);
  for (const name of activity) target.addEventListener(name, touch, { passive: true });
  return () => {
    target.clearInterval(timer);
    target.removeEventListener("pagehide", onPageHide);
    target.removeEventListener("pageshow", onPageShow);
    target.document.removeEventListener("visibilitychange", onVisible);
    for (const name of activity) target.removeEventListener(name, touch);
  };
}

export function useWipeTriggers(onWipe: () => void, idleMs: number | null = IDLE_MILLISECONDS): void {
  const ref = useRef(onWipe);
  useEffect(() => {
    ref.current = onWipe;
  });
  useEffect(() => attachWipeListeners(() => ref.current(), window, idleMs), [idleMs]);
}
