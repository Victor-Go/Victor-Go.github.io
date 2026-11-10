import { useEffect, useRef, useState, type ReactNode } from "react";
import { OFFICIAL_ID, avatarUri } from "../avatar";
import type { Progress } from "../client";
import type { Messages } from "../i18n";

/** Every avatar wears a ring in the theme blue, or gold for an administrator. */
export function Avatar({ userId, size = 40, admin = false }: { userId: string; size?: number; admin?: boolean }) {
  // The official channel is not a user: it always wears the fixed verified badge, with no ring.
  if (userId === OFFICIAL_ID) {
    return <img className="ch-avatar-official" src={avatarUri(OFFICIAL_ID)} width={size} height={size} alt="" draggable={false} />;
  }
  return (
    <img
      className={"ch-avatar" + (admin ? " ch-gold" : "") + (size >= 60 ? " ch-avatar-big" : "")}
      src={avatarUri(userId)}
      width={size}
      height={size}
      alt=""
      draggable={false}
    />
  );
}

/** A dialog that closes on Escape and returns focus to where it came from. */
export function Modal({ title, onClose, children, closeLabel }: { title: string; onClose: () => void; children: ReactNode; closeLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // The latest onClose, so a caller's new function on every render does not re-run the effect (which would steal the focus again and lose where it came from).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, []);
  return (
    <div className="ch-modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ch-modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="ch-modal-head">
          <h2>{title}</h2>
          <button type="button" className="ch-link" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Where a slow step is, in friendly words; the proof-of-work step shows a bar and the failure multiplier. */
export function Steps({ progress, m }: { progress: Progress | null; m: Messages }) {
  if (!progress) return null;
  const text = { derive: m.stepDerive, pow: m.stepPow, server: m.stepServer, vault: m.stepVault }[progress.step];
  return (
    <div className="ch-steps" role="status" aria-live="polite">
      <div className="ch-steps-title">{progress.step === "pow" ? m.powTitle : text}</div>
      {progress.step === "pow" && (
        <>
          <div className="ch-meter" aria-hidden="true">
            <span style={{ width: `${Math.round((progress.fraction ?? 0) * 100)}%`, background: "var(--ch-accent)" }} />
          </div>
          <div className="ch-hint">{m.powNote}</div>
          {(progress.multiplier ?? 1) > 1 && <div className="ch-notice">{m.multiplierNote(progress.multiplier ?? 1)}</div>}
        </>
      )}
    </div>
  );
}

/** A thin bar under the title that moves while a call is running (it always takes its 3px, so nothing jumps), and, before the first answer, a spinner with a word. */
export function Loading({ busy, first = false, label }: { busy: boolean; first?: boolean; label: string }) {
  return (
    <>
      <div className={"ch-loadbar" + (busy ? " ch-loadbar-on" : "")} role="progressbar" aria-hidden={!busy} aria-label={label} />
      {first && (
        <div className="ch-loading" role="status" aria-live="polite">
          <span className="ch-spinner" aria-hidden="true" />
          {label}
        </div>
      )}
    </>
  );
}

/**
 * Guards a click handler that starts asynchronous work: while the promise it returns is pending, further clicks are ignored (even
 * ones that land before React has re-rendered) and `busy` is true so the control can disable itself and show a spinner.
 */
export function usePending(): [boolean, (fn: () => unknown) => void] {
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const run = (fn: () => unknown): void => {
    if (locked.current) return;
    const r = fn();
    if (r && typeof (r as Promise<unknown>).then === "function") {
      locked.current = true;
      setBusy(true);
      void Promise.resolve(r)
        .catch(() => {})
        .finally(() => {
          locked.current = false;
          if (live.current) setBusy(false);
        });
    }
  };
  return [busy, run];
}
