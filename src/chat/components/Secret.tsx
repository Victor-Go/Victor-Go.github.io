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

/**
 * A real password field. Browsers switch the input method off for it (a Chinese IME would otherwise see, learn and sync what is typed),
 * and phone keyboards neither learn from it nor offer it to cloud suggestions. While "show" is on it is a plain text field, so the
 * input method is back for that time. It sits in no <form> and has no name, so a browser has little to latch onto, but no page can stop
 * a browser from offering to remember a password: that is the browser's own setting.
 */
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
        type={reveal ? "text" : "password"}
        {...NO_AUTOFILL}
        className="ch-input"
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
