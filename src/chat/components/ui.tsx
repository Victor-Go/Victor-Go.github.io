import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { OFFICIAL_ID, avatarUri } from "../avatar";
import type { Progress } from "../client";
import type { Messages } from "../i18n";
import { useBadge, type Badge } from "../store";
import { useLang } from "../useChat";

/**
 * The title badge of an administrator: "管理员", or the gold "负责人" for the owner. The title comes from the server's administrator list
 * (`GET /admins`); `role` is only the fallback for somebody the list does not have. Nothing for anyone else.
 */
/**
 * A name on one line. When it does not fit it scrolls back and forth (a marquee) so the whole of it can be read; when it fits, or when the person
 * asks for less motion, it stays still (with an ellipsis if it is cut). Put it in a flex line next to a badge: `<span class="ch-name-line">`.
 */
export function Marquee({ children }: { children: ReactNode }) {
  // A short name cannot overflow a row, and a long chat has a name above every message: those get no observer and no measuring at all.
  if (typeof children === "string" && children.length <= SHORT_NAME) return <span className="ch-marq">{children}</span>;
  return <MarqueeLong>{children}</MarqueeLong>;
}
const SHORT_NAME = 12;

function MarqueeLong({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      // The outer box is a block with hidden overflow, so its scrollWidth is the full width of the text (an inline span reports 0).
      const o = outer.current;
      if (o) setShift(Math.max(0, Math.ceil(o.scrollWidth - o.clientWidth)));
    };
    measure();
    if (typeof ResizeObserver === "undefined" || !outer.current) return;
    const watch = new ResizeObserver(measure);
    watch.observe(outer.current);
    return () => watch.disconnect();
  }, [children]);
  const style = shift > 0 ? ({ "--ch-shift": `-${shift}px`, "--ch-dur": `${Math.min(20, 3 + shift / 25)}s` } as CSSProperties) : undefined;
  return (
    <span ref={outer} className="ch-marq">
      <span className="ch-marq-in" data-run={shift > 0 ? "true" : undefined} style={style}>
        {children}
      </span>
    </span>
  );
}

export function TitleBadge({ userId, role, title, className = "" }: { userId?: string; role?: string; title?: string; className?: string }) {
  const { a } = useLang();
  const looked = useBadge(userId, role);
  // `title` is a title already known (an administrator invite carries one); it needs no lookup.
  const badge: Badge = title === undefined ? looked : title === "owner" ? "owner" : "admin";
  if (badge === "none") return null;
  return <span className={"ch-admin" + (badge === "owner" ? " ch-owner" : "") + (className ? " " + className : "")} data-badge={badge}>{badge === "owner" ? a.ownerTitleBadge : a.adminBadge}</span>;
}

/** Every avatar wears a ring in the theme blue, or gold for an administrator (`admin`: the role says so; the title list may say it too). */
export function Avatar({ userId, size = 40, admin: roleAdmin = false }: { userId: string; size?: number; admin?: boolean }) {
  const badge = useBadge(userId, roleAdmin ? "admin" : undefined);
  const admin = badge !== "none";
  // The official channel is not a user: it always wears the fixed verified badge, with no ring.
  if (userId === OFFICIAL_ID) {
    return <img className="ch-avatar-official" src={avatarUri(OFFICIAL_ID)} width={size} height={size} alt="" draggable={false} />;
  }
  const big = size >= 60 ? " ch-avatar-big" : "";
  // The owner's ring is a wrapper (the ring is a pseudo-element behind the picture); its outer size is the same as a plain avatar's.
  if (badge === "owner") {
    return (
      <span className={"ch-avatar-owner" + big} data-badge="owner" style={{ width: size, height: size }}>
        <img className="ch-avatar" src={avatarUri(userId)} width={size} height={size} alt="" draggable={false} />
      </span>
    );
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
export function Modal({ title, titleExtra, onClose, children, closeLabel }: { title: string; titleExtra?: ReactNode; onClose: () => void; children: ReactNode; closeLabel: string }) {
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
          <h2>
            {title}
            {titleExtra}
          </h2>
          <button type="button" className="ch-link" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * A yes/no question in our own dialog (never the browser's alert, confirm or prompt). The confirm button is red when `danger`. With
 * `requireText` the person has to type exactly that text (a name) before the button works.
 */
export function ConfirmModal({
  title,
  children,
  confirmLabel,
  cancelLabel,
  closeLabel,
  danger = false,
  busy = false,
  requireText,
  requireLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel: string;
  danger?: boolean;
  busy?: boolean;
  requireText?: string;
  requireLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const blocked = requireText !== undefined && typed !== requireText;
  return (
    <Modal title={title} onClose={() => !busy && onCancel()} closeLabel={closeLabel}>
      {children}
      {requireText !== undefined && (
        <label className="ch-field">
          <span className="ch-label">{requireLabel}</span>
          <input className="ch-input" value={typed} autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={(e) => setTyped(e.target.value)} />
        </label>
      )}
      <button type="button" className={danger ? "ch-danger" : "ch-primary"} disabled={busy || blocked} onClick={onConfirm}>
        {confirmLabel}
      </button>
      <button type="button" className="ch-secondary" disabled={busy} onClick={onCancel}>
        {cancelLabel}
      </button>
    </Modal>
  );
}

/** Where a slow step is, in friendly words; the proof-of-work step shows a bar and the failure multiplier. */
export function Steps({ progress, m }: { progress: Progress | null; m: Messages }) {
  const [slow, setSlow] = useState(false);
  const active = progress !== null;
  useEffect(() => {
    setSlow(false);
    if (!active) return;
    const t = setTimeout(() => setSlow(true), 20_000);
    return () => clearTimeout(t);
  }, [active]);
  if (!progress) return null;
  const text = { derive: m.stepDerive, pow: m.stepPow, server: m.stepServer, submit: m.stepSubmit, create: m.stepCreate, vault: m.stepVault }[progress.step];
  const prefix = progress.n && progress.of ? m.stepOf(progress.n, progress.of) : "";
  return (
    <div className="ch-steps" role="status" aria-live="polite">
      <div className="ch-steps-title">{prefix}{progress.step === "pow" ? m.powTitle : text}</div>
      {progress.step === "pow" && (
        <>
          <div className="ch-meter" aria-hidden="true">
            <span style={{ width: `${Math.round((progress.fraction ?? 0) * 100)}%`, background: "var(--ch-accent)" }} />
          </div>
          <div className="ch-hint">{progress.of ? m.powNoteSignUp : m.powNote}</div>
          {(progress.multiplier ?? 1) > 1 && <div className="ch-notice">{m.multiplierNote(progress.multiplier ?? 1)}</div>}
        </>
      )}
      {slow && <div className="ch-hint">{m.slowNote}</div>}
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
