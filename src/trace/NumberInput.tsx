import { useEffect, useState } from "react";

interface Props {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  label?: string;
}

/**
 * A number field with its own − and + buttons. The browser's built-in spin arrows react in a much larger
 * area than they draw, so they are switched off in trace.css.
 */
export function NumberInput({ value, min, max, onChange, label }: Props) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n)));
  return (
    <span className="t-num">
      <button type="button" aria-label="−" disabled={value <= min} onClick={() => onChange(clamp(value - 1))}>−</button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={text}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          setText(digits);
          if (digits !== "") onChange(clamp(Number(digits)));
        }}
        onBlur={() => setText(String(value))}
      />
      <button type="button" aria-label="+" disabled={value >= max} onClick={() => onChange(clamp(value + 1))}>+</button>
    </span>
  );
}
