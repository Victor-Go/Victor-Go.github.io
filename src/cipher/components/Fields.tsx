import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Messages } from "../i18n";
import { copyText, downloadText } from "../output";

/** Attributes that keep browsers, password managers and spellcheckers away from the content. */
const NO_AUTOFILL = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
  "data-1p-ignore": true,
  "data-lpignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
} as const;

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  m: Messages;
  /** Masks the text like a password and shows a character count. */
  secret?: boolean;
  /** Single-line semantics: Enter is swallowed (passwords). */
  singleLine?: boolean;
  rows?: number;
  /** Tall message box: 600px by default, never below 300px. */
  tall?: boolean;
  /** Extra control shown in the label row. */
  action?: ReactNode;
}

export function Field({ label, value, onChange, m, secret, singleLine, rows = 4, tall, action }: FieldProps) {
  const id = useId();
  const [reveal, setReveal] = useState(false);
  const masked = secret && !reveal;
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (singleLine && e.key === "Enter") e.preventDefault();
  };
  return (
    <div className="c-field">
      <div className="c-field-head">
        <label htmlFor={id}>{label}</label>
        <span className="c-field-tools">
          {action}
          {secret && (
            <button type="button" className="c-link" aria-pressed={reveal} onClick={() => setReveal((r) => !r)}>
              {reveal ? m.hide : m.show}
            </button>
          )}
        </span>
      </div>
      <textarea
        id={id}
        {...NO_AUTOFILL}
        className={(masked ? "c-input c-masked" : "c-input") + (tall ? " c-tall" : "")}
        rows={singleLine ? 1 : rows}
        value={value}
        onChange={(e) => onChange(singleLine ? e.target.value.replace(/[\r\n]/g, "") : e.target.value)}
        onKeyDown={onKeyDown}
      />
      {secret && <div className="c-hint">{m.chars(Array.from(value).length)}</div>}
    </div>
  );
}

/** How long the copy button shows its result before returning to normal. */
export const COPY_FEEDBACK_MS = 1000;

interface OutputProps {
  label: string;
  value: string;
  m: Messages;
  secret?: boolean;
  /** When set, offers a ciphertext download with a persistent-file warning. */
  downloadName?: string;
  rows?: number;
  tall?: boolean;
}

export function Output({ label, value, m, secret, downloadName, rows = 5, tall }: OutputProps) {
  const id = useId();
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");
  const timer = useRef<number | undefined>(undefined);
  const [reveal, setReveal] = useState(false);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (!value) return null;
  const masked = secret && !reveal;
  const copy = async () => {
    setCopyState((await copyText(value)) ? "ok" : "fail");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopyState("idle"), COPY_FEEDBACK_MS);
  };
  return (
    <div className="c-field c-output">
      <div className="c-field-head">
        <label htmlFor={id}>{label}</label>
        {secret && (
          <button type="button" className="c-link" aria-pressed={reveal} onClick={() => setReveal((r) => !r)}>
            {reveal ? m.hide : m.show}
          </button>
        )}
      </div>
      <textarea
        id={id}
        {...NO_AUTOFILL}
        readOnly
        className={(masked ? "c-input c-masked" : "c-input") + (tall ? " c-tall" : "")}
        rows={rows}
        value={value}
      />
      <div className="c-actions">
        <button
          type="button"
          className={copyState === "ok" ? "c-copied" : copyState === "fail" ? "c-copy-failed" : undefined}
          aria-live="polite"
          onClick={copy}
        >
          {copyState === "ok" ? m.copied : copyState === "fail" ? m.copyFailed : m.copy}
        </button>
        {downloadName && (
          <button type="button" onClick={() => downloadText(downloadName, value)}>
            {m.download}
          </button>
        )}
      </div>
      {downloadName && <div className="c-hint">{m.downloadWarn}</div>}
    </div>
  );
}

interface TabDef {
  id: string;
  label: string;
  /** Stays mounted (just hidden) while another tab is active, so typed content survives tab switches. */
  content: ReactNode;
}

interface TabsProps {
  label: string;
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ label, tabs, active, onChange, className }: TabsProps) {
  const base = useId();
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = tabs[(i + dir + tabs.length) % tabs.length];
    onChange(next.id);
    document.getElementById(`${base}-tab-${next.id}`)?.focus();
  };
  return (
    <div className={className}>
      <div role="tablist" aria-label={label} className="c-tablist">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            className="c-tab"
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${base}-panel-${t.id}`}
          aria-labelledby={`${base}-tab-${t.id}`}
          hidden={active !== t.id}
          className="c-panel"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
