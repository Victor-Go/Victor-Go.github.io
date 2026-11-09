import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useLang } from "../useChat";
import { clampView, containSize, startView, zoomAt, type Size, type View } from "../zoom";

/** A touch or click that moves less than this (in pixels) is a tap, not a drag. */
const TAP_SLOP = 8;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 30;
/** A double tap on a picture that is fit to the screen zooms in this far. */
const DOUBLE_TAP_SCALE = 2.5;
/** One wheel event moves the zoom by at most this much (pixels of scrolling), so a fast spin does not jump from fit to the limit. */
const WHEEL_MAX = 400;

const screenSize = (): Size => ({ w: window.innerWidth, h: window.innerHeight });
const baseOf = containSize;
const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The picture over the whole screen, all of it in view, with the chat blurred behind it. One finger or the mouse drags it, two fingers pinch,
 * the wheel zooms at the pointer, a double tap zooms in and out. A tap on the empty part, Escape or the button closes it.
 * `w` and `h` are the picture's pixels (they give its shape before it has loaded).
 */
export function ImageViewer({ url, w, h, onClose }: { url: string; w: number; h: number; onClose: () => void }) {
  const { a } = useLang();
  const root = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Size>(screenSize);
  const base = baseOf(box, w, h);
  const [view, setView] = useState<View>(() => startView(box, baseOf(box, w, h)));
  // What the event handlers read: they must see the latest numbers without being rebuilt for every move.
  const now = useRef({ view, box, base });
  useLayoutEffect(() => {
    now.current = { view, box, base };
  });
  const change = (next: (v: View, box: Size, base: Size) => View) => setView((v) => next(v, now.current.box, now.current.base));

  // The screen turning or the window changing size keeps the picture where it can be.
  useEffect(() => {
    const onSize = () => {
      const next = screenSize();
      setBox(next);
      setView((v) => clampView(v, next, baseOf(next, w, h)));
    };
    window.addEventListener("resize", onSize);
    return () => window.removeEventListener("resize", onSize);
  }, [w, h]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("keydown", esc);
      previous?.focus?.();
    };
  }, [onClose]);

  // The wheel is a native listener: a React one is passive and could not stop the page from scrolling.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      // Some browsers (Firefox on Windows) count a notch as 3 lines, not 100 pixels: without this a notch would zoom by half a percent.
      const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? window.innerHeight : 1;
      const dy = Math.max(-WHEEL_MAX, Math.min(WHEEL_MAX, e.deltaY * unit));
      // A trackpad pinch arrives as a wheel with ctrlKey and small steps.
      const k = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.002));
      setView((v) => zoomAt(v, k, e.clientX, e.clientY, now.current.box, now.current.base));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: 0, onPicture: false, lastTap: { t: 0, x: 0, y: 0 }, dist: 0, mid: { x: 0, y: 0 } });

  const pinchState = () => {
    const [p, q] = [...pointers.current.values()];
    return { dist: distance(p, q), mid: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } };
  };

  const down = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return; // the close button gets its own click
    root.current?.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (pointers.current.size === 1) {
      g.moved = 0;
      g.onPicture = (e.target as HTMLElement).tagName === "IMG";
    } else if (pointers.current.size === 2) {
      g.moved = Infinity; // two fingers are never a tap
      Object.assign(g, pinchState());
    }
  };

  const move = (e: React.PointerEvent) => {
    const before = pointers.current.get(e.pointerId);
    if (!before) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (pointers.current.size === 1) {
      const dx = e.clientX - before.x;
      const dy = e.clientY - before.y;
      g.moved += Math.abs(dx) + Math.abs(dy);
      if (g.moved >= TAP_SLOP) change((v, box, base) => clampView({ ...v, x: v.x + dx, y: v.y + dy }, box, base));
    } else if (pointers.current.size === 2) {
      const next = pinchState();
      const k = g.dist > 0 ? next.dist / g.dist : 1;
      const dx = next.mid.x - g.mid.x;
      const dy = next.mid.y - g.mid.y;
      change((v, box, base) => {
        const zoomed = zoomAt(v, k, next.mid.x, next.mid.y, box, base);
        return clampView({ ...zoomed, x: zoomed.x + dx, y: zoomed.y + dy }, box, base);
      });
      Object.assign(g, next);
    }
  };

  const up = (e: React.PointerEvent) => {
    if (!pointers.current.delete(e.pointerId)) return;
    const g = gesture.current;
    // One finger lifted from a pinch: the other carries on as a drag from where it is.
    if (pointers.current.size > 0) return;
    if (e.type === "pointercancel" || g.moved >= TAP_SLOP) return;
    // A tap. On the empty part it closes; on the picture, two in a row zoom.
    if (!g.onPicture) return onClose();
    const t = Date.now();
    const last = g.lastTap;
    if (t - last.t < DOUBLE_TAP_MS && distance(last, { x: e.clientX, y: e.clientY }) < DOUBLE_TAP_PX) {
      g.lastTap = { t: 0, x: 0, y: 0 };
      change((v, box, base) => (v.s > 1.01 ? startView(box, base) : zoomAt(v, DOUBLE_TAP_SCALE, e.clientX, e.clientY, box, base)));
    } else {
      g.lastTap = { t, x: e.clientX, y: e.clientY };
    }
  };

  return (
    <div
      ref={root}
      className={"ch-viewer" + (view.s > 1.01 ? " ch-zoomed" : "")}
      role="dialog"
      aria-modal="true"
      aria-label={a.imageMessage}
      tabIndex={-1}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <img
        className="ch-viewer-img"
        src={url}
        alt={a.imageMessage}
        draggable={false}
        style={{ width: base.w, height: base.h, transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
      />
      <button type="button" className="ch-viewer-close" aria-label={a.close} onClick={onClose}>
        <X size={24} aria-hidden="true" />
      </button>
    </div>
  );
}
