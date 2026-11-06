import { sha256 } from "@noble/hashes/sha2.js";
import { toSvg } from "jdenticon";

const cache = new Map<string, string>();

/** hsl (hue in degrees, s and l in 0..1) as "#rrggbb", the only colour format Jdenticon takes for the background. */
function hex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * A Jdenticon picture as a data: URI, generated from the user id, so everyone sees the same picture and renaming never
 * changes it. Jdenticon has no random background of its own, so each user gets a pastel one derived from the id, and the
 * pattern is drawn in a hue well away from it. Used through <img>, so the SVG is never inserted into the page as markup.
 */
export function avatarUri(userId: string): string {
  let uri = cache.get(userId);
  if (!uri) {
    const b = sha256(new TextEncoder().encode(`avatar-back/v1|${userId}`));
    const hue = Math.round((b[0] / 256) * 360);
    const svg = toSvg(userId, 96, {
      backColor: hex(hue, 0.6, 0.88),
      hues: [(hue + 150 + (b[1] % 60)) % 360],
      padding: 0.12,
    });
    uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    cache.set(userId, uri);
  }
  return uri;
}

export { hex as hslToHex };
