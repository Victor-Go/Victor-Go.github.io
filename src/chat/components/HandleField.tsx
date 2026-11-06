import { useId, useRef, type FormEvent } from "react";
import { NO_AUTOFILL } from "./noAutofill";
import { onEnter } from "../keys";
import { sanitizeHandleInput } from "../validation";

interface HandleFieldProps {
  label: string;
  hint: string;
  problem: string | null;
  value: string;
  onChange: (v: string) => void;
  /** Enter in this field runs it (the form's single action). */
  onEnter?: () => void;
  autoFocus?: boolean;
}

/** Username input: only ASCII letters, digits, _ and - can get in; IME composition is cleaned when it ends. */
export function HandleField({ label, hint, problem, value, onChange, onEnter: enter, autoFocus }: HandleFieldProps) {
  const id = useId();
  const composing = useRef(false);
  // A single typed character that is not allowed never enters the field (no caret jump).
  // Longer inserts (paste, drop) go through and are cleaned by onChange, so their valid part is kept.
  const onBeforeInput = (e: FormEvent<HTMLInputElement>) => {
    const data = (e.nativeEvent as InputEvent).data;
    if (!composing.current && data && Array.from(data).length === 1 && /[^A-Za-z0-9_@-]/.test(data)) e.preventDefault();
  };
  return (
    <div className="ch-field">
      <label htmlFor={id}>{label}</label>
      <div className="ch-handle">
        <span className="ch-at" aria-hidden="true">@</span>
        <input
          id={id}
          type="text"
          lang="en"
          inputMode="text"
          maxLength={64}
          autoFocus={autoFocus}
          {...NO_AUTOFILL}
          className="ch-input"
          aria-invalid={problem ? true : undefined}
          aria-describedby={`${id}-hint`}
          value={value}
          onBeforeInput={onBeforeInput}
          onKeyDown={onEnter(enter)}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(e) => {
            composing.current = false;
            onChange(sanitizeHandleInput(e.currentTarget.value));
          }}
          onChange={(e) => onChange(composing.current ? e.target.value : sanitizeHandleInput(e.target.value))}
        />
      </div>
      <div id={`${id}-hint`} className={problem ? "ch-hint ch-bad" : "ch-hint"}>
        {problem ?? hint}
      </div>
    </div>
  );
}
