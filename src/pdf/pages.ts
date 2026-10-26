export type ImageFormat = "png" | "jpeg";

export const FORMATS: { id: ImageFormat; label: string; ext: string; mime: string }[] = [
  { id: "png", label: "PNG", ext: "png", mime: "image/png" },
  { id: "jpeg", label: "JPG", ext: "jpg", mime: "image/jpeg" },
];

/** Files are read fully into memory, so cap them. */
export const MAX_FILE_MB = 200;
/** Browsers fail or blank canvases past roughly this many pixels. */
export const MAX_PIXELS = 50_000_000;
export const MAX_SIDE = 16384;

/** Parses "1-3, 5, 8-" into sorted unique 1-based page numbers; empty input means all pages. Returns null if invalid. */
export function parsePages(spec: string, total: number): number[] | null {
  const s = spec.replace(/\s+/g, "");
  if (s === "") return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>();
  for (const part of s.split(/[,，]/)) {
    const m = /^(\d*)(?:-(\d*))?$/.exec(part);
    if (!m || part === "" || part === "-") return null;
    const hasRange = part.includes("-");
    const a = m[1] === "" ? 1 : Number(m[1]);
    const b = hasRange ? (m[2] === "" || m[2] === undefined ? total : Number(m[2])) : a;
    if (a < 1 || b < a || b > total) return null;
    for (let p = a; p <= b; p++) set.add(p);
  }
  return [...set].sort((x, y) => x - y);
}

/** Scale actually used for a page: the requested one, reduced if the canvas would be too large. */
export function effectiveScale(w: number, h: number, scale: number): number {
  const limit = Math.min(MAX_SIDE / Math.max(w, h), Math.sqrt(MAX_PIXELS / (w * h)));
  return Math.min(scale, limit);
}

