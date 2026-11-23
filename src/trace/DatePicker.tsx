import { useEffect, useId, useRef, useState, type TouchEvent as RTouchEvent } from "react";
import { dateInput } from "./view";

type Mode = "days" | "months" | "years";

interface Props {
  label: string;
  /** YYYY-MM-DD or empty. */
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  placeholder: string;
  locale: string;
}

const parse = (s: string): Date | undefined => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
};

/** A calendar like the Windows flyout: days, then months, then years of a decade; the header steps up a level. */
export function DatePicker({ label, value, onChange, min, max, placeholder, locale }: Props) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | undefined>(undefined);
  const lastWheel = useRef(0);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("days");
  const today = new Date();
  const selected = parse(value);
  const [view, setView] = useState(() => selected ?? today); // only its year and month matter

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const y = view.getFullYear();
  const mo = view.getMonth();
  const monthName = (m: number, style: "long" | "short") => new Intl.DateTimeFormat(locale, { month: style }).format(new Date(2000, m, 1));
  const mondayFirst = !locale.startsWith("en");
  const weekday = (i: number) => new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(new Date(2023, 0, 1 + ((i + (mondayFirst ? 1 : 0)) % 7)));
  const decade = Math.floor(y / 10) * 10;

  const show = () => {
    setView(selected ?? today);
    setMode("days");
    setOpen(true);
  };
  const step = (dir: -1 | 1) => {
    if (mode === "days") setView(new Date(y, mo + dir, 1));
    else if (mode === "months") setView(new Date(y + dir, mo, 1));
    else setView(new Date(y + dir * 10, mo, 1));
  };
  const up = () => setMode(mode === "days" ? "months" : "years");
  const title = mode === "days" ? `${y} ${monthName(mo, "long")}` : mode === "months" ? String(y) : `${decade} – ${decade + 9}`;

  // Scrolling the wheel over the calendar, or swiping on it, moves by a month, a year or a decade, like the Windows flyout.
  useEffect(() => {
    const el = pop.current;
    if (!open || !el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = Date.now();
      if (now - lastWheel.current < 120) return;
      lastWheel.current = now;
      step(e.deltaY > 0 ? 1 : -1);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }); // re-bound on every render: `step` reads the current mode and view

  const swipeStart = (e: RTouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const swipeEnd = (e: RTouchEvent) => {
    const from = touch.current;
    touch.current = undefined;
    if (!from) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - from.x;
    const dy = t.clientY - from.y;
    // A swipe up or left goes forward, down or right goes back; a tap (little movement) is left to the buttons.
    if (Math.abs(dy) >= 30 && Math.abs(dy) > Math.abs(dx)) step(dy < 0 ? 1 : -1);
    else if (Math.abs(dx) >= 40) step(dx < 0 ? 1 : -1);
  };

  const blocked = (iso: string) => (!!min && iso < min) || (!!max && iso > max);
  /** A whole span (month or year) is out of range when even its nearest day is. */
  const spanBlocked = (first: Date, last: Date) => (!!min && dateInput(last) < min) || (!!max && dateInput(first) > max);
  const pick = (d: Date) => {
    onChange(dateInput(d));
    setOpen(false);
  };

  const cells: Date[] = [];
  if (mode === "days") {
    const first = new Date(y, mo, 1);
    const lead = (first.getDay() + (mondayFirst ? 6 : 0)) % 7;
    for (let i = 0; i < 42; i++) cells.push(new Date(y, mo, 1 - lead + i));
  }

  return (
    <div className="t-dp" ref={root}>
      <button type="button" id={id} className="t-dp-btn" aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => (open ? setOpen(false) : show())}>
        <span className="t-dp-label">{label}</span> <span className={value ? "" : "t-dp-empty"}>{value || placeholder}</span>
      </button>
      {open && (
        <div className="t-dp-pop" role="dialog" aria-label={label} ref={pop} onTouchStart={swipeStart} onTouchEnd={swipeEnd}>
          <div className="t-dp-head">
            <button type="button" className="t-dp-title" onClick={up} disabled={mode === "years"}>
              {title}
            </button>
            <button type="button" className="t-dp-step" aria-label="▲" onClick={() => step(-1)}>▲</button>
            <button type="button" className="t-dp-step" aria-label="▼" onClick={() => step(1)}>▼</button>
          </div>
          {mode === "days" && (
            <div className="t-dp-grid t-dp-days" role="grid">
              {Array.from({ length: 7 }, (_, i) => (
                <span key={i} className="t-dp-wd">{weekday(i)}</span>
              ))}
              {cells.map((d) => {
                const iso = dateInput(d);
                const out = d.getMonth() !== mo;
                const cls = ["t-dp-cell", out && "t-dp-out", iso === value && "t-dp-sel", iso === dateInput(today) && "t-dp-today"];
                return (
                  <button key={iso} type="button" className={cls.filter(Boolean).join(" ")} disabled={blocked(iso)} aria-pressed={iso === value} onClick={() => pick(d)}>
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          )}
          {mode === "months" && (
            <div className="t-dp-grid t-dp-wide">
              {Array.from({ length: 12 }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={spanBlocked(new Date(y, i, 1), new Date(y, i + 1, 0))}
                  className={["t-dp-cell", selected && selected.getFullYear() === y && selected.getMonth() === i && "t-dp-sel"].filter(Boolean).join(" ")}
                  onClick={() => {
                    setView(new Date(y, i, 1));
                    setMode("days");
                  }}
                >
                  {monthName(i, "short")}
                </button>
              ))}
            </div>
          )}
          {mode === "years" && (
            <div className="t-dp-grid t-dp-wide">
              {Array.from({ length: 16 }, (_, i) => {
                const yr = decade - 3 + i;
                const out = yr < decade || yr > decade + 9;
                return (
                  <button
                    key={yr}
                    type="button"
                    disabled={spanBlocked(new Date(yr, 0, 1), new Date(yr, 11, 31))}
                    className={["t-dp-cell", out && "t-dp-out", selected?.getFullYear() === yr && "t-dp-sel"].filter(Boolean).join(" ")}
                    onClick={() => {
                      setView(new Date(yr, mo, 1));
                      setMode("months");
                    }}
                  >
                    {yr}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
