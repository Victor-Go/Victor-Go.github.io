import { useEffect, useRef, useState } from "react";
import { ApiError, imageUrl } from "../client";
import { errorOf } from "../i18nApp";
import { drawSize } from "../image";
import type { Msg } from "../store";
import { useLang } from "../useChat";

/**
 * A picture message. It keeps its shape while empty (the sender announced the pixels), and is downloaded and opened when it comes near the screen,
 * not when the history loads. A tap hands the blob URL and the pixels to `onOpen` (the full-screen viewer); after a failed download a tap tries again.
 */
export function ImageBubble({ conv, m, onOpen }: { conv: string; m: Msg; onOpen: (url: string, w: number, h: number) => void }) {
  const { a } = useLang();
  const box = useRef<HTMLButtonElement>(null);
  const [near, setNear] = useState(typeof IntersectionObserver === "undefined");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const p = m.payload?.k === "image" ? m.payload.image : null;
  const stored = p?.id ?? "";

  useEffect(() => {
    if (near) return;
    const el = box.current;
    if (!el) return;
    const watch = new IntersectionObserver((seen) => {
      if (seen.some((e) => e.isIntersecting)) {
        setNear(true);
        watch.disconnect();
      }
    }, { rootMargin: "300px" });
    watch.observe(el);
    return () => watch.disconnect();
  }, [near]);

  useEffect(() => {
    if (!near || m.payload?.k !== "image") return;
    let live = true;
    imageUrl(conv, m)
      .then((u) => live && (setUrl(u), setError(null)))
      .catch((e) => live && setError(e instanceof ApiError ? errorOf(a, e) : a.imageFailed));
    return () => {
      live = false;
    };
    // `stored` changes from "" to the real id when my own upload is done; `attempt` is a tap on a failed picture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, conv, m.id, stored, attempt]);

  if (!p) return null;
  const size = drawSize(p.w, p.h);
  const style = { width: size.w, aspectRatio: `${p.w} / ${p.h}` };
  return (
    <button
      ref={box}
      type="button"
      className={"ch-image" + (url ? " ch-loaded" : "")}
      style={style}
      aria-label={a.imageOpen}
      aria-busy={!url && !error}
      onClick={() => (url ? onOpen(url, p.w, p.h) : error ? (setError(null), setAttempt((n) => n + 1)) : undefined)}
    >
      {url ? (
        <img src={url} alt={a.imageMessage} draggable={false} />
      ) : error ? (
        <span className="ch-bad ch-hint" role="alert">
          {error}
        </span>
      ) : (
        <span className="ch-spinner" aria-hidden="true" />
      )}
    </button>
  );
}
