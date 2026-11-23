import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";

const MIN_K = 0.3;
const MAX_K = 3;

/**
 * Drag to pan, wheel or two fingers to zoom, for an SVG whose content is drawn in a <g transform>.
 * `width` is the content's width in px; `fit` scales it down to the box and centres it.
 */
export function usePanZoom(width: number) {
  const box = useRef<HTMLDivElement>(null);
  const [tf, setTf] = useState({ x: 0, y: 0, k: 1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(false);
  const pinch = useRef(0);
  const travel = useRef(0);

  const fit = () => {
    const w = box.current?.clientWidth || 600;
    const k = Math.min(1, (w - 8) / width);
    setTf({ k, x: (w - width * k) / 2, y: 4 });
  };
  useEffect(fit, [width]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomAt = (px: number, py: number, factor: number) =>
    setTf((t) => {
      const k = Math.max(MIN_K, Math.min(MAX_K, t.k * factor));
      const f = k / t.k;
      return { k, x: px - (px - t.x) * f, y: py - (py - t.y) * f };
    });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  const onPointerDown = (e: RPointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    travel.current = 0;
    pinch.current = 0;
  };
  const onPointerMove = (e: RPointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    const r = box.current!.getBoundingClientRect();
    if (pointers.current.size === 1) {
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      travel.current += Math.abs(dx) + Math.abs(dy);
      if (travel.current > 6) moved.current = true;
      setTf((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    } else if (pointers.current.size === 2) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current) zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, d / pinch.current);
      pinch.current = d;
      moved.current = true;
    }
  };
  const onPointerUp = (e: RPointerEvent) => {
    pointers.current.delete(e.pointerId);
    pinch.current = 0;
  };
  // A drag that ends over a node must not count as a click on it.
  const onClickCapture = (e: { stopPropagation(): void }) => {
    if (moved.current) {
      e.stopPropagation();
      moved.current = false;
    }
  };

  return {
    box,
    tf,
    fit,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onPointerLeave: onPointerUp, onClickCapture },
  };
}
