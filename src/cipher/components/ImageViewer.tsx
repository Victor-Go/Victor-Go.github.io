import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Messages } from "../i18n";
import { FIT, pan, zoomAt, type View } from "../viewerMath";

interface Point {
  x: number;
  y: number;
}

/** Horizontal travel, in pixels, that counts as a swipe to the next or previous image. */
const SWIPE_DISTANCE = 60;

interface ImageViewerProps {
  src: string;
  m: Messages;
  onClose: () => void;
  /** Present only when there is a previous / next image to go to. */
  onPrev?: () => void;
  onNext?: () => void;
  /** Shown as "2 / 5" when several images can be paged through. */
  position?: string;
}

/**
 * Full-screen image with wheel, double-click, drag and two-finger pinch zoom. With neighbours, a
 * touch swipe (while not zoomed in) or the arrow buttons and keys move to the previous / next one.
 */
export function ImageViewer({ src, m, onClose, onPrev, onNext, position }: ImageViewerProps) {
  const [view, setView] = useState<View>(FIT);
  // A new image starts fitted to the screen.
  useEffect(() => setView(FIT), [src]);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ dist: number; mid: Point } | null>(null);

  /** Pointer position relative to the stage centre. */
  const local = (clientX: number, clientY: number): Point => {
    const r = stage.current!.getBoundingClientRect();
    return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 };
  };

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    stage.current?.focus();
    return () => previous?.focus();
  }, []);

  // React attaches wheel listeners as passive, so zooming needs a native, cancelable one.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e.clientX, e.clientY);
      setView((v) => zoomAt(v, Math.exp(-e.deltaY * 0.0015), p.x, p.y));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const down = (e: ReactPointerEvent) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Not capturable (e.g. a synthetic event); the gesture still works while the pointer stays over the stage.
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Only a single touch on an image that is not zoomed in can become a page swipe.
    swipe.current = pointers.current.size === 1 && view.s <= 1 && e.pointerType !== "mouse" ? { x: e.clientX, y: e.clientY } : null;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: local((a.x + b.x) / 2, (a.y + b.y) / 2) };
    }
  };

  const move = (e: ReactPointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      setView((v) => pan(v, e.clientX - prev.x, e.clientY - prev.y));
    } else if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = local((a.x + b.x) / 2, (a.y + b.y) / 2);
      const last = pinch.current;
      pinch.current = { dist, mid };
      if (last.dist > 0 && dist > 0) {
        setView((v) => pan(zoomAt(v, dist / last.dist, mid.x, mid.y), mid.x - last.mid.x, mid.y - last.mid.y));
      }
    }
  };

  const up = (e: ReactPointerEvent) => {
    const start = swipe.current;
    swipe.current = null;
    if (start && e.type === "pointerup" && pointers.current.size === 1) {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) >= SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? onNext : onPrev)?.();
    }
    pointers.current.delete(e.pointerId);
    pinch.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowLeft") onPrev?.();
    else if (e.key === "ArrowRight") onNext?.();
    else if (e.key === "+" || e.key === "=") setView((v) => zoomAt(v, 1.25, 0, 0));
    else if (e.key === "-") setView((v) => zoomAt(v, 0.8, 0, 0));
    else if (e.key === "0") setView(FIT);
  };

  return (
    <div
      ref={stage}
      className="c-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={m.viewerLabel}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={(e) => {
        const p = local(e.clientX, e.clientY);
        setView((v) => (v.s > 1 ? FIT : zoomAt(v, 2.5, p.x, p.y)));
      }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        className="c-viewer-img"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
      />
      <button
        type="button"
        className="c-viewer-close"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={onClose}
      >
        {m.close}
      </button>
      {onPrev && (
        <button
          type="button"
          className="c-viewer-nav c-viewer-prev"
          aria-label={m.viewerPrev}
          title={m.viewerPrev}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={onPrev}
        >
          ‹
        </button>
      )}
      {onNext && (
        <button
          type="button"
          className="c-viewer-nav c-viewer-next"
          aria-label={m.viewerNext}
          title={m.viewerNext}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={onNext}
        >
          ›
        </button>
      )}
      {position && <div className="c-viewer-position">{position}</div>}
      <div className="c-viewer-hint">{onPrev || onNext ? `${m.viewerHint} · ${m.viewerNavHint}` : m.viewerHint}</div>
    </div>
  );
}
