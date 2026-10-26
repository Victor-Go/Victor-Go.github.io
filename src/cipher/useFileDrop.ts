import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Accepts a file dropped anywhere on the page while `ref`'s panel is the visible one. A file dropped
 * elsewhere is swallowed too, so a stray drop never navigates away and loses what was typed.
 */
export function useFileDrop(ref: RefObject<HTMLElement | null>, onPick: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  });
  useEffect(() => {
    const active = () => !!ref.current && !ref.current.closest("[hidden]");
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(active());
    };
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0 && active()) pick.current(files);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [ref]);
  return dragging;
}
