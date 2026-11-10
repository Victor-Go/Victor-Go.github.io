import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { configure, resumeView } from "./client";
import { AccountPage } from "./components/AccountPage";
import { Shell } from "./components/Shell";
import { getConfig } from "./config";
import { useIdleLogout, usePrivacyCover, useWipeOnLeave } from "./hooks";
import { appMessages } from "./i18nApp";
import { useLangStore } from "./lang";
import { Api } from "./net/api";
import { armSound } from "./sound";
import { CHAT_PATHS, PATH, isChatPath, sectionOf, showPath, startPath, useLocation } from "./route";
import { totalUnread, useChat } from "./store";
import { useLang } from "./useChat";

/** Where a sign-in continues: the page the browser loaded, when it is a screen that needs nothing else (not the sign-in page, not a chat, which is picked from the list). */
const resumePath = (isAdmin: boolean): string => {
  if (!CHAT_PATHS.includes(startPath) || startPath === PATH.account || isChatPath(startPath)) return PATH.home;
  return sectionOf(startPath) === "manage" && !isAdmin ? PATH.home : startPath;
};


export function App() {
  const { m, a } = useLang();
  const phase = useChat((s) => s.phase);
  const role = useChat((s) => s.me?.role);
  const api = useMemo(() => {
    const bases = getConfig().api;
    return bases.length ? new Api(bases) : null;
  }, []);
  const ready = phase === "ready";

  // Browsers allow sound only after the user has touched the page, and phones count only a finished tap. Every tap, click and
  // key press (re)unlocks the chime, so it also recovers after the browser put the audio to sleep.
  useEffect(() => {
    const arm = () => armSound();
    const events = ["pointerup", "touchend", "click", "keydown"] as const;
    for (const name of events) window.addEventListener(name, arm, { passive: true });
    return () => {
      for (const name of events) window.removeEventListener(name, arm);
    };
  }, []);

  // The tab title carries the unread count, so a message is noticed even when nothing else is.
  const unreadTotal = useChat(totalUnread);
  useEffect(() => {
    document.title = ready && unreadTotal > 0 ? `(${unreadTotal > 99 ? "99+" : unreadTotal}) ${m.appTitle}` : m.appTitle;
  }, [ready, unreadTotal, m.appTitle]);

  // Coming back to the page counts as reading what arrived meanwhile.
  useEffect(() => {
    const look = () => resumeView();
    document.addEventListener("visibilitychange", look);
    window.addEventListener("focus", look);
    return () => {
      document.removeEventListener("visibilitychange", look);
      window.removeEventListener("focus", look);
    };
  }, []);

  useEffect(() => {
    const text = () => appMessages[useLangStore.getState().lang];
    configure(api, getConfig().ws, {
      notifyTitle: (who) => text().notifyTitle(who),
      lockNotice: (why) => (why === "expired" ? text().lockedExpired : why === "replaced" ? text().lockedReplaced : text().lockedKicked),
    });
  }, [api]);

  // Signed out, the address is the sign-in page; signing in lands on the page that was asked for (or the chat list).
  useEffect(() => {
    showPath(ready ? resumePath(role === "admin") : PATH.account);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  // Going back to an old entry while signed out must not show a signed-in address.
  const here = useLocation().path;
  useEffect(() => {
    if (!ready && here !== PATH.account) showPath(PATH.account);
  }, [ready, here]);

  useWipeOnLeave(ready);
  const { warning } = useIdleLogout(ready, a.lockedExpired);
  const { covered, uncover } = usePrivacyCover(ready);

  return (
    <>
      {ready ? <Shell /> : <AccountPage />}
      {warning && (
        <div className="ch-toast" role="alert">
          {a.idleWarning}
        </div>
      )}
      {/* Outside #root: that element is blurred while covered, and a blurred (or filtered-ancestor) cover would blur its own text and be sized by the page content. */}
      {covered &&
        createPortal(
          <div className="ch-cover" onPointerDown={uncover} role="button" tabIndex={0} onKeyDown={uncover}>
            <strong>{a.privacyCover}</strong>
            <span>{a.privacyHint}</span>
          </div>,
          document.body,
        )}
    </>
  );
}
