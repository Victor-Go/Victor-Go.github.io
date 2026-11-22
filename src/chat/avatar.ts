import { Avatar, Style } from "@dicebear/core";
import planets from "@dicebear/styles/planets.json";
import shapes from "@dicebear/styles/shapes.json";
import { sha256 } from "@noble/hashes/sha2.js";

const cache = new Map<string, string>();

/** The sender id of every official message (and the id the official conversation's avatar is drawn for): not a user, never looked up. */
export const OFFICIAL_ID = "official";

/** A blue scalloped "verified" seal with a white check mark: 12 points, drawn by hand, the same for everybody. */
export function officialBadgeSvg(): string {
  const points = 12;
  const outer = 48;
  const inner = 41;
  const d: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    d.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`);
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<polygon points="${d.join(" ")}" fill="#4285F4" stroke="#4285F4" stroke-width="4" stroke-linejoin="round"/>` +
    `<path d="M29 51 L44 66 L72 35" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

const planetsStyle = new Style(planets);
const shapesStyle = new Style(shapes);
/** The share of users who get flat shapes; the rest get a planet. */
const SHAPES_SHARE = 0.6;

/**
 * A DiceBear picture as a data: URI, generated from the user id, so everyone sees the same picture and renaming never
 * changes it. The id also decides the look, 60% flat shapes and 40% a planet on a dark sky: the first byte of its hash
 * is read as a number in 0..1, so the split is the same for everybody. DiceBear then draws the picture from the id as
 * the seed. Used through <img>, so the SVG is never inserted into the page as markup.
 */
export function avatarUri(userId: string): string {
  if (userId === OFFICIAL_ID) return `data:image/svg+xml;utf8,${encodeURIComponent(officialBadgeSvg())}`;
  let uri = cache.get(userId);
  if (!uri) {
    const roll = sha256(new TextEncoder().encode(`avatar-style/v1|${userId}`))[0] / 256;
    uri = new Avatar(roll < SHAPES_SHARE ? shapesStyle : planetsStyle, { seed: userId, size: 96 }).toDataUri();
    cache.set(userId, uri);
  }
  return uri;
}
