/** Pan/zoom state of the full-screen viewer. Offsets are relative to the viewport centre. */
export interface View {
  s: number;
  x: number;
  y: number;
}

export const MIN_SCALE = 1;
export const MAX_SCALE = 16;
export const FIT: View = { s: 1, x: 0, y: 0 };

/** Scales by `factor` while keeping the point (px, py), given relative to the centre, fixed on screen. */
export function zoomAt(v: View, factor: number, px: number, py: number): View {
  const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.s * factor));
  if (s <= MIN_SCALE) return FIT;
  const k = s / v.s;
  return { s, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
}

export function pan(v: View, dx: number, dy: number): View {
  return v.s <= MIN_SCALE ? FIT : { ...v, x: v.x + dx, y: v.y + dy };
}
