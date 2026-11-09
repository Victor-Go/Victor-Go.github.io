/** The pan and zoom of the full-screen picture viewer, as plain arithmetic. */
export interface View {
  /** 1 is "the whole picture on the screen"; more is zoomed in. */
  s: number;
  /** Where the picture's top-left corner is on the screen, in CSS pixels (after scaling). */
  x: number;
  y: number;
}
export interface Size {
  w: number;
  h: number;
}

export const MAX_SCALE = 6;

const limit = (s: number): number => Math.min(MAX_SCALE, Math.max(1, s));

/** The picture's size at scale 1: all of it inside the screen, keeping its shape, and never drawn larger than its own pixels. */
export function containSize(box: Size, w: number, h: number): Size {
  const k = Math.min(box.w / w, box.h / h, 1);
  return { w: w * k, h: h * k };
}

/**
 * Keeps the picture where it can be: never smaller than whole on the screen, never pulled so far that the screen shows empty space on a side
 * where the picture is larger than the screen, and centred along an axis where it is smaller.
 * `box` is the screen, `base` the picture's size at scale 1 (see containSize).
 */
export function clampView(v: View, box: Size, base: Size): View {
  const s = limit(v.s);
  const sw = base.w * s;
  const sh = base.h * s;
  return {
    s,
    x: sw <= box.w ? (box.w - sw) / 2 : Math.min(0, Math.max(box.w - sw, v.x)),
    y: sh <= box.h ? (box.h - sh) / 2 : Math.min(0, Math.max(box.h - sh, v.y)),
  };
}

/** The whole picture, in the middle of the screen. */
export const startView = (box: Size, base: Size): View => clampView({ s: 1, x: 0, y: 0 }, box, base);

/** Zooms by `k` keeping the point (px, py) of the screen over the same point of the picture. */
export function zoomAt(v: View, k: number, px: number, py: number, box: Size, base: Size): View {
  const s = limit(v.s * k);
  const r = s / v.s;
  return clampView({ s, x: px - (px - v.x) * r, y: py - (py - v.y) * r }, box, base);
}
