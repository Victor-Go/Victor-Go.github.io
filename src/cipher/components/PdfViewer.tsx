import { useEffect, useRef } from "react";
import type { Messages } from "../i18n";

/** Full-screen PDF reader: the browser's own PDF viewer on the in-memory blob URL. */
export function PdfViewer({ src, m, onClose }: { src: string; m: Messages; onClose: () => void }) {
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    stage.current?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div
      ref={stage}
      className="c-viewer c-viewer-pdf"
      role="dialog"
      aria-modal="true"
      aria-label={m.pdfTitle}
      tabIndex={-1}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <iframe src={src} title={m.pdfTitle} className="c-viewer-frame" />
      <button type="button" className="c-viewer-close" onClick={onClose}>
        {m.close}
      </button>
    </div>
  );
}
