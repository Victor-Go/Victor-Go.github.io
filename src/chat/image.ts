import { VOICE_MAX_BYTES } from "./voice";

/** Contract: chat-server docs/protocol.md section 10 (images use the voice storage, 512 KiB of ciphertext at most). */
export const IMAGE_MAX_SIDE = 1600;
/** Sealing adds a 31-byte header and a 16-byte tag; the rest is slack so a size check on the ciphertext never fails after a fit here. */
const SEAL_OVERHEAD = 31 + 16;
export const IMAGE_MAX_BYTES = VOICE_MAX_BYTES - SEAL_OVERHEAD - 1024;
const QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.25];

export class ImageError extends Error {}

/** The size that fits `max` pixels along its longer side, keeping the shape; never larger than the original. */
export function fitSize(w: number, h: number, max: number): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/** The box a picture is drawn in a bubble, in CSS pixels: the whole picture fits, whatever its shape. */
const BOX_W = 240;
const BOX_H = 320;

/** The size to draw a w×h picture at in a bubble, keeping its shape. */
export function drawSize(w: number, h: number): { w: number; h: number } {
  const scale = Math.min(1, BOX_W / w, BOX_H / h);
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/**
 * Finds the best picture that fits the budget: the biggest size (at most IMAGE_MAX_SIDE along the longer side), and at that size the highest
 * quality, whose encoding is no larger than `budget` bytes. It never gives up on size: when a size cannot be made small enough even at the
 * lowest quality it goes smaller, down to a few pixels (which always fits), so a picture is always sent, at the cost of quality if need be.
 * `encode(w, h, quality)` returns the encoded bytes (null when the browser cannot encode).
 */
export async function fitToBudget<T extends { size: number }>(
  srcW: number,
  srcH: number,
  budget: number,
  encode: (w: number, h: number, quality: number) => Promise<T | null>,
): Promise<{ out: T; w: number; h: number }> {
  for (let max = IMAGE_MAX_SIDE; ; max = Math.floor(max * 0.75)) {
    const { w, h } = fitSize(srcW, srcH, max);
    for (const q of QUALITIES) {
      const out = await encode(w, h, q);
      if (out && out.size <= budget) return { out, w, h };
    }
    // Nothing smaller than this exists to try: the browser cannot encode JPEG at all.
    if (w <= 8 && h <= 8) throw new ImageError("unreadable");
  }
}

/**
 * Turns a picked picture into a JPEG that fits IMAGE_MAX_BYTES, whatever the original (see fitToBudget). Drawing it again on a canvas drops
 * everything the file carried besides the pixels (camera data, the place it was taken, the phone's name), straightens a rotated photo, and
 * flattens transparency onto white. Throws ImageError("unreadable") only when the file is not a picture the browser can read.
 */
export async function compressImage(file: Blob): Promise<{ bytes: Uint8Array; w: number; h: number }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageError("unreadable");
  }
  try {
    const { out, w, h } = await fitToBudget<Blob>(bitmap.width, bitmap.height, IMAGE_MAX_BYTES, async (w, h, q) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new ImageError("unreadable");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bitmap, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", q));
      return blob && blob.type === "image/jpeg" ? blob : null;
    });
    return { bytes: new Uint8Array(await out.arrayBuffer()), w, h };
  } finally {
    bitmap.close();
  }
}
