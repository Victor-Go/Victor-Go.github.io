import { useEffect, useRef } from "react";
import { Lock } from "lucide-react";
import { EMPTY, stepHold, type HoldState } from "../holdProgress";

/**
 * The only place on the lock cover that answers to a touch: a ring with the lock in it, and the words under it. Hold it and the ring fills; let go (or
 * slide the finger off it) and the press is lost at once: only an unbroken hold unlocks. The ring on the screen eases (a lerp, holdProgress.ts) towards
 * the press, so it empties in a tenth of a second, and a new press needs no waiting for that to finish. The ratio is worked out in code on every frame,
 * not by a fixed animation. Held for the full time: `onUnlock`.
 * A touch anywhere else on the cover does nothing, so a cheek or a pocket cannot unlock the screen or press a button underneath.
 */
export function HoldToUnlock({ label, onUnlock }: { label: string; onUnlock: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const fill = useRef<SVGCircleElement>(null);
  const state = useRef<HoldState>(EMPTY);
  const holding = useRef(false);
  const frame = useRef<number | null>(null);
  const last = useRef(0);
  const unlock = useRef(onUnlock);
  unlock.current = onUnlock;

  const draw = () => {
    fill.current?.style.setProperty("stroke-dashoffset", String(100 * (1 - state.current.shown)));
    box.current?.setAttribute("data-holding", String(holding.current));
    box.current?.setAttribute("data-progress", state.current.shown.toFixed(3));
    box.current?.setAttribute("data-held", state.current.held.toFixed(3));
  };

  const tick = (now: number) => {
    frame.current = null;
    state.current = stepHold(state.current, now - last.current, holding.current);
    last.current = now;
    if (holding.current && state.current.held >= 1) {
      holding.current = false;
      state.current = EMPTY;
      draw();
      unlock.current();
      return;
    }
    draw();
    // Keep going while the finger is down, or while the ring still has something to empty.
    if (holding.current || state.current.shown > 0) frame.current = requestAnimationFrame(tick);
  };

  const run = () => {
    if (frame.current !== null) return;
    last.current = performance.now();
    frame.current = requestAnimationFrame(tick);
  };

  const press = () => {
    holding.current = true;
    draw();
    run();
  };
  const release = () => {
    if (!holding.current) return;
    holding.current = false;
    state.current = { ...state.current, held: 0 }; // letting go loses the press at once; the ring follows in a moment
    draw();
    run();
  };

  // A finger that has slid off the target still reports to it (touch pointers stay with the element they started on), so look where it is.
  const inside = (e: React.PointerEvent): boolean => {
    const r = box.current?.getBoundingClientRect();
    return !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  };

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  return (
    <div
      ref={box}
      className="ch-call-hold"
      role="button"
      tabIndex={0}
      aria-label={label}
      data-holding="false"
      data-progress="0.000"
      data-held="0.000"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        press();
      }}
      onPointerMove={(e) => holding.current && !inside(e) && release()}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
          e.preventDefault();
          press();
        }
      }}
      onKeyUp={release}
      onBlur={release}
    >
      <div className="ch-call-ring">
        <svg className="ch-call-ring-svg" viewBox="0 0 44 44" width="72" height="72" aria-hidden="true">
          <circle className="ch-call-ring-track" cx="22" cy="22" r="20" />
          <circle ref={fill} className="ch-call-ring-fill" cx="22" cy="22" r="20" pathLength="100" />
        </svg>
        <Lock size={28} />
      </div>
      <span>{label}</span>
    </div>
  );
}
