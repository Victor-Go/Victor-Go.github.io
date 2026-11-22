import { useEffect, useState } from "react";
import { callInProgress, lock, touch } from "./client";
import { useChat } from "./store";

/** Anything the user does with the page counts, including just swiping or moving the pointer. */
const ACTIVITY = ["pointerdown", "pointermove", "touchstart", "touchmove", "scroll", "wheel", "keydown", "input"] as const;
const WARN_MS = 30_000;

/**
 * Signs out after `idleMinutes` without activity. The last-activity time is a plain number in memory, so a
 * phone that was in the background is judged by the clock when the page comes back, not by a timer that
 * the OS may have frozen. Nothing is stored.
 */
export function useIdleLogout(enabled: boolean, onExpired: string): { warning: boolean } {
  const idleMinutes = useChat((s) => s.idleMinutes);
  const [warning, setWarning] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setWarning(false); // signed out (by this timer or any other way): the warning that was up has nothing left to warn about
      return;
    }
    let last = Date.now();
    const limit = idleMinutes * 60_000;
    const check = () => {
      // A voice call is activity: the person is talking, not idle, and signing them out would cut the call.
      if (callInProgress()) last = Date.now();
      const idle = Date.now() - last;
      if (idle >= limit) lock(onExpired);
      else setWarning(limit - idle <= WARN_MS);
    };
    const onActivity = () => {
      last = Date.now();
      setWarning((w) => (w ? false : w));
      touch();
    };
    const timer = setInterval(check, 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    for (const name of ACTIVITY) window.addEventListener(name, onActivity, { passive: true, capture: true });
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", check);
    return () => {
      clearInterval(timer);
      for (const name of ACTIVITY) window.removeEventListener(name, onActivity, { capture: true });
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", check);
    };
  }, [enabled, idleMinutes, onExpired]);
  return { warning };
}

/** Leaving the page (bfcache or navigation) wipes every key and message from memory. */
export function useWipeOnLeave(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onHide = () => lock(null);
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) lock(null);
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onShow);
    };
  }, [enabled]);
}

/**
 * Blurs everything the moment the page loses focus or visibility, so app switchers and screenshots do not
 * show messages. The attribute is set synchronously inside the event (before React renders) because some
 * platforms take the snapshot immediately.
 */
export function usePrivacyCover(enabled: boolean): { covered: boolean; uncover: () => void } {
  const [covered, setCovered] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    if (!enabled) {
      root.removeAttribute("data-covered");
      return;
    }
    const cover = () => {
      root.setAttribute("data-covered", "");
      setCovered(true);
    };
    const uncover = () => {
      root.removeAttribute("data-covered");
      setCovered(false);
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? cover() : document.hasFocus() && uncover());
    window.addEventListener("blur", cover);
    window.addEventListener("focus", uncover);
    window.addEventListener("pagehide", cover);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", cover);
      window.removeEventListener("focus", uncover);
      window.removeEventListener("pagehide", cover);
      document.removeEventListener("visibilitychange", onVisibility);
      root.removeAttribute("data-covered");
    };
  }, [enabled]);
  return {
    covered,
    uncover: () => {
      document.documentElement.removeAttribute("data-covered");
      setCovered(false);
    },
  };
}
