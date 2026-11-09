import { describe, expect, it } from "vitest";
import { toEpochs } from "../crypto/keys";
import { IMAGE_SIDE_MAX, decryptMessage, encryptMessage, type Binding, type Payload } from "../crypto/message";
import { IMAGE_MAX_BYTES, IMAGE_MAX_SIDE, ImageError, compressImage, drawSize, fitSize, fitToBudget } from "../image";
import { planDeleteBatches } from "../selection";
import type { Msg } from "../store";
import { VOICE_MAX_BYTES } from "../voice";

const epochs = toEpochs([{ id: 3, constant: "week_three" }], 3);
const key = new Uint8Array(32).fill(7);
const binding: Binding = { conv: "c1", senderId: "u1", clientMsgId: "m1", gen: 0 };

describe("sizes", () => {
  it("shrinks the longer side to the limit and keeps the shape; never enlarges", () => {
    expect(fitSize(4000, 2000, 1600)).toEqual({ w: 1600, h: 800 });
    expect(fitSize(2000, 4000, 1600)).toEqual({ w: 800, h: 1600 });
    expect(fitSize(800, 600, 1600)).toEqual({ w: 800, h: 600 });
    expect(fitSize(10000, 1, 1600)).toEqual({ w: 1600, h: 1 });
  });

  it("leaves room for sealing under the server's limit", () => {
    expect(IMAGE_MAX_BYTES).toBeLessThan(VOICE_MAX_BYTES - 47);
    expect(IMAGE_MAX_BYTES).toBeGreaterThan(400 * 1024);
  });

  it("draws a bubble inside 240 × 320 whatever the shape", () => {
    expect(drawSize(1600, 800)).toEqual({ w: 240, h: 120 });
    expect(drawSize(800, 1600)).toEqual({ w: 160, h: 320 });
    expect(drawSize(100, 50)).toEqual({ w: 100, h: 50 });
  });
});

describe("compressing", () => {
  it("refuses a file the browser cannot read as a picture", async () => {
    await expect(compressImage(new Blob(["not a picture"], { type: "image/png" }))).rejects.toMatchObject({ name: "Error", message: "unreadable" });
    await expect(compressImage(new Blob(["x"]))).rejects.toBeInstanceOf(ImageError);
  });
});

describe("fitting the budget", () => {
  /** An encoder whose output grows with the pixels and the quality: `weight` bytes per pixel at quality 1. */
  const encoder = (weight: number) => async (w: number, h: number, q: number) => ({ size: Math.round(w * h * q * weight), w, h, q });

  it("keeps the biggest size and the best quality when the first try already fits", async () => {
    const r = await fitToBudget(4000, 3000, 500_000, encoder(0.1));
    expect([r.w, r.h]).toEqual([IMAGE_MAX_SIDE, 1200]);
    expect(r.out.q).toBe(0.85);
  });

  it("gives up quality before size", async () => {
    // 1600×1200×0.85×0.5 = 816000 > 500000; at 0.45: 432000 fits at the same size
    const r = await fitToBudget(4000, 3000, 500_000, encoder(0.5));
    expect([r.w, r.h]).toEqual([IMAGE_MAX_SIDE, 1200]);
    expect(r.out.q).toBe(0.45);
  });

  it("then gives up size", async () => {
    const r = await fitToBudget(4000, 3000, 500_000, encoder(2));
    expect(r.w).toBeLessThan(IMAGE_MAX_SIDE);
    expect(r.out.size).toBeLessThanOrEqual(500_000);
  });

  it("never gives up on the budget: even an encoder that is hopeless until the picture is tiny ends with one that fits", async () => {
    const r = await fitToBudget(12000, 9000, IMAGE_MAX_BYTES, encoder(500));
    expect(r.out.size).toBeLessThanOrEqual(IMAGE_MAX_BYTES);
    expect(r.w).toBeGreaterThanOrEqual(1);
    expect(r.h).toBeGreaterThanOrEqual(1);
    // an absurd shape too
    const strip = await fitToBudget(20000, 1, 5000, encoder(500));
    expect(strip.out.size).toBeLessThanOrEqual(5000);
  });

  it("does not enlarge a small original while searching", async () => {
    const r = await fitToBudget(300, 200, IMAGE_MAX_BYTES, encoder(0.5));
    expect([r.w, r.h]).toEqual([300, 200]);
  });

  it("says unreadable only when the browser cannot encode at all", async () => {
    await expect(fitToBudget(3000, 2000, 1000, async () => null)).rejects.toBeInstanceOf(ImageError);
  });
});

describe("a picture message", () => {
  const image: Payload = { k: "image", image: { id: "stored1", w: 800, h: 600 }, sentAt: 5 };

  it("is sealed and opened like any message body", async () => {
    const { ct } = await encryptMessage(key, epochs, image, binding);
    expect(await decryptMessage(key, epochs, ct, binding)).toEqual(image);
  });

  it("is rejected when the stored id or the pixel counts are not sane", async () => {
    const bad: unknown[] = [
      { k: "image", image: { id: "", w: 10, h: 10 }, sentAt: 1 },
      { k: "image", image: { id: "x".repeat(129), w: 10, h: 10 }, sentAt: 1 },
      { k: "image", image: { id: "a", w: 0, h: 10 }, sentAt: 1 },
      { k: "image", image: { id: "a", w: 10, h: -1 }, sentAt: 1 },
      { k: "image", image: { id: "a", w: 10.5, h: 10 }, sentAt: 1 },
      { k: "image", image: { id: "a", w: IMAGE_SIDE_MAX + 1, h: 10 }, sentAt: 1 },
      { k: "image", image: { id: "a", w: "10", h: 10 }, sentAt: 1 },
      { k: "image", sentAt: 1 },
    ];
    for (const p of bad) {
      const { ct } = await encryptMessage(key, epochs, p as Payload, binding);
      await expect(decryptMessage(key, epochs, ct, binding)).rejects.toThrow();
    }
  });
});

describe("deleting pictures", () => {
  const msg = (seq: number, payload: Msg["payload"]): Msg => ({ id: `m${seq}`, seq, senderId: "me", role: "user", time: 1, mine: true, payload, status: "sent" });

  it("sends a picture's stored id in voiceIds, like a recording's, and counts it against the 20 per request", () => {
    const batches = planDeleteBatches([
      msg(1, { k: "image", image: { id: "i1", w: 1, h: 1 }, sentAt: 1 }),
      msg(2, { k: "voice", voice: { id: "v1", ms: 1000 }, sentAt: 1 }),
      msg(3, { k: "text", text: "t", sentAt: 1 }),
      msg(4, { k: "image", image: { id: "", w: 1, h: 1 }, sentAt: 1 }), // not uploaded yet: nothing to delete in the storage
    ]);
    expect(batches).toEqual([{ seqs: [1, 2, 3, 4], voiceIds: ["i1", "v1"] }]);
    const many = Array.from({ length: 21 }, (_, i) => msg(i + 1, { k: "image", image: { id: `i${i}`, w: 1, h: 1 }, sentAt: 1 }));
    expect(planDeleteBatches(many).map((b) => b.voiceIds.length)).toEqual([20, 1]);
  });
});
