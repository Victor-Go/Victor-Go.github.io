import { useId, useState } from "react";
import { NO_AUTOFILL } from "./noAutofill";
import { onEnter } from "../keys";

interface SecretProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  showLabel: string;
  hideLabel: string;
  countLabel: (n: number) => string;
  invalid?: boolean;
  describedBy?: string;
  /** Enter in this field runs it (the form's single action). */
  onEnter?: () => void;
}

/** A masked single-line field. Plain text input masked in CSS (no password-manager hooks). */
export function Secret({ label, value, onChange, showLabel, hideLabel, countLabel, invalid, describedBy, onEnter: enter }: SecretProps) {
  const id = useId();
  const [reveal, setReveal] = useState(false);
  return (
    <div className="ch-field">
      <div className="ch-field-head">
        <label htmlFor={id}>{label}</label>
        <button type="button" className="ch-link" aria-pressed={reveal} onClick={() => setReveal((r) => !r)}>
          {reveal ? hideLabel : showLabel}
        </button>
      </div>
      <input
        id={id}
        type="text"
        {...NO_AUTOFILL}
        className={reveal ? "ch-input" : "ch-input ch-masked"}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[\r\n]/g, ""))}
        onKeyDown={onEnter(enter)}
      />
      <div className="ch-hint">{countLabel(Array.from(value).length)}</div>
    </div>
  );
}
