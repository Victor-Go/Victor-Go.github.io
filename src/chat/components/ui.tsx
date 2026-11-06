import { useEffect, useRef, type ReactNode } from "react";
import { avatarUri } from "../avatar";
import type { Progress } from "../client";
import type { Messages } from "../i18n";

/** Every avatar wears a ring in the theme blue, or gold for an administrator. */
export function Avatar({ userId, size = 40, admin = false }: { userId: string; size?: number; admin?: boolean }) {
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
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);
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
