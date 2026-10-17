import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
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
}

export function Field({ label, value, onChange, m, secret, singleLine, rows = 4 }: FieldProps) {
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
        {secret && (
          <button type="button" className="c-link" aria-pressed={reveal} onClick={() => setReveal((r) => !r)}>
            {reveal ? m.hide : m.show}
          </button>
        )}
      </div>
      <textarea
        id={id}
        {...NO_AUTOFILL}
        className={masked ? "c-input c-masked" : "c-input"}
        rows={singleLine ? 1 : rows}
        value={value}
        onChange={(e) => onChange(singleLine ? e.target.value.replace(/[\r\n]/g, "") : e.target.value)}
        onKeyDown={onKeyDown}
      />
      {secret && <div className="c-hint">{m.chars(Array.from(value).length)}</div>}
    </div>
  );
}

interface OutputProps {
  label: string;
  value: string;
  m: Messages;
  secret?: boolean;
  /** When set, offers a ciphertext download with a persistent-file warning. */
  downloadName?: string;
  rows?: number;
}

export function Output({ label, value, m, secret, downloadName, rows = 5 }: OutputProps) {
  const id = useId();
  const [status, setStatus] = useState("");
  const [reveal, setReveal] = useState(false);
  if (!value) return null;
  const masked = secret && !reveal;
  const copy = async () => setStatus((await copyText(value)) ? m.copied : m.copyFailed);
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
        className={masked ? "c-input c-masked" : "c-input"}
        rows={rows}
        value={value}
      />
      <div className="c-actions">
        <button type="button" onClick={copy}>
          {m.copy}
        </button>
        {downloadName && (
          <button type="button" onClick={() => downloadText(downloadName, value)}>
            {m.download}
          </button>
        )}
      </div>
      {downloadName && <div className="c-hint">{m.downloadWarn}</div>}
      <div className="c-hint" role="status">
        {status}
      </div>
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
