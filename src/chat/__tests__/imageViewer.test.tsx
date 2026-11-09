import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ImageViewer } from "../components/ImageViewer";
import { setLang } from "../lang";
import { MAX_SCALE, clampView, containSize, startView, zoomAt } from "../zoom";

const box = { w: 400, h: 800 };

describe("zoom arithmetic", () => {
  it("fits the whole picture on the screen, keeping its shape, and never enlarges it past its own pixels", () => {
    expect(containSize(box, 800, 400)).toEqual({ w: 400, h: 200 }); // wide: limited by the width
    expect(containSize(box, 400, 1600)).toEqual({ w: 200, h: 800 }); // tall: limited by the height
    expect(containSize(box, 300, 200)).toEqual({ w: 300, h: 200 }); // small: shown at its size
    expect(containSize({ w: 1670, h: 920 }, 1200, 800)).toEqual({ w: 1200, h: 800 });
  });

  it("starts with the whole picture in the middle", () => {
    expect(startView(box, { w: 400, h: 200 })).toEqual({ s: 1, x: 0, y: 300 });
    expect(startView(box, { w: 200, h: 800 })).toEqual({ s: 1, x: 100, y: 0 });
  });

  it("never goes below the whole picture or above the maximum", () => {
    const base = { w: 400, h: 200 };
    expect(clampView({ s: 0.2, x: 0, y: 0 }, box, base).s).toBe(1);
    expect(clampView({ s: 99, x: 0, y: 0 }, box, base).s).toBe(MAX_SCALE);
  });

  it("keeps the edges of a larger picture on or beyond the screen's edges", () => {
    const base = { w: 400, h: 200 };
    const v = clampView({ s: 2, x: 500, y: -900 }, box, base); // 800 × 400: wider than the screen, shorter than it
    expect(v.x).toBe(0);
    expect(v.y).toBe(200); // still centred along the short axis
    expect(clampView({ s: 2, x: -999, y: 0 }, box, base).x).toBe(-400);
  });

  it("zooms around a point, which stays where it was on the picture", () => {
    const base = { w: 400, h: 800 }; // fills the screen, so nothing is re-centred
    const v = zoomAt(startView(box, base), 2, 100, 300, box, base);
    expect(v.s).toBe(2);
    // the picture point under (100, 300) was (100, 300); at scale 2 it is at (200, 600), so the picture moves by (-100, -300)
    expect(v.x).toBe(-100);
    expect(v.y).toBe(-300);
  });
});

const transform = (): { s: number; x: number; y: number } => {
  const t = (document.querySelector(".ch-viewer-img") as HTMLElement).style.transform;
  const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\((-?[\d.]+)\)/.exec(t)!;
  return { x: Number(m[1]), y: Number(m[2]), s: Number(m[3]) };
};

beforeEach(() => {
  setLang("zh");
  vi.stubGlobal("innerWidth", 400);
  vi.stubGlobal("innerHeight", 800);
});

describe("the full-screen viewer", () => {
  it("opens with the whole picture in view and centred, wide or tall", () => {
    const { unmount } = render(<ImageViewer url="blob:x" w={800} h={400} onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    const img = () => document.querySelector(".ch-viewer-img") as HTMLElement;
    expect([img().style.width, img().style.height]).toEqual(["400px", "200px"]);
    expect(transform()).toEqual({ s: 1, x: 0, y: 300 });
    unmount();
    render(<ImageViewer url="blob:x" w={400} h={1600} onClose={() => {}} />);
    expect([img().style.width, img().style.height]).toEqual(["200px", "800px"]); // the screen is 400 × 800: the height decides
    expect(transform()).toEqual({ s: 1, x: 100, y: 0 });
  });

  it("closes with the button, Escape, or a tap on the empty part, but not a tap on the picture", () => {
    const onClose = vi.fn();
    render(<ImageViewer url="blob:x" w={800} h={400} onClose={onClose} />);
    const img = document.querySelector(".ch-viewer-img") as HTMLElement;
    fireEvent.pointerDown(img, { pointerId: 1, clientX: 200, clientY: 400 });
    fireEvent.pointerUp(img, { pointerId: 1, clientX: 200, clientY: 400 });
    expect(onClose).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    fireEvent.pointerDown(dialog, { pointerId: 2, clientX: 200, clientY: 20 });
    fireEvent.pointerUp(dialog, { pointerId: 2, clientX: 200, clientY: 20 });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("zooms with the wheel at the pointer", () => {
    render(<ImageViewer url="blob:x" w={400} h={1600} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(fireEvent.wheel(dialog, { deltaY: -460, clientX: 100, clientY: 300 })).toBe(false); // the page's own scrolling is stopped
    const v = transform();
    expect(v.s).toBeGreaterThan(1.5);
    fireEvent.wheel(dialog, { deltaY: 100000, clientX: 100, clientY: 300 });
    expect(transform().s).toBe(1);
  });

  it("zooms by a useful amount when the browser counts a wheel notch in lines (3 lines) or pages, not pixels", () => {
    render(<ImageViewer url="blob:x" w={400} h={1600} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.wheel(dialog, { deltaY: -3, deltaMode: 1, clientX: 100, clientY: 300 });
    expect(transform().s).toBeGreaterThan(1.2);
    fireEvent.wheel(dialog, { deltaY: 100000, deltaMode: 0, clientX: 100, clientY: 300 });
    fireEvent.wheel(dialog, { deltaY: -0.05, deltaMode: 2, clientX: 100, clientY: 300 });
    expect(transform().s).toBeGreaterThan(1.05);
  });

  it("one fast spin cannot jump from the whole picture to the limit", () => {
    render(<ImageViewer url="blob:x" w={400} h={1600} onClose={() => {}} />);
    fireEvent.wheel(screen.getByRole("dialog"), { deltaY: -100000, clientX: 100, clientY: 300 });
    expect(transform().s).toBeLessThan(2.5);
  });

  it("drags a zoomed picture with one pointer, and a drag does not close it", () => {
    const onClose = vi.fn();
    render(<ImageViewer url="blob:x" w={400} h={1600} onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.wheel(dialog, { deltaY: -1000, clientX: 200, clientY: 400 });
    const before = transform();
    const img = document.querySelector(".ch-viewer-img") as HTMLElement;
    fireEvent.pointerDown(img, { pointerId: 1, clientX: 200, clientY: 400 });
    fireEvent.pointerMove(img, { pointerId: 1, clientX: 180, clientY: 340 });
    fireEvent.pointerUp(img, { pointerId: 1, clientX: 180, clientY: 340 });
    const after = transform();
    expect(after.s).toBe(before.s);
    expect(after.x).toBe(before.x - 20);
    expect(after.y).toBe(before.y - 60);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("pinches with two pointers: moving them apart zooms in", () => {
    render(<ImageViewer url="blob:x" w={400} h={1600} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.pointerDown(dialog, { pointerId: 1, clientX: 150, clientY: 400 });
    fireEvent.pointerDown(dialog, { pointerId: 2, clientX: 250, clientY: 400 });
    fireEvent.pointerMove(dialog, { pointerId: 2, clientX: 350, clientY: 400 }); // 100 → 200 apart
    expect(transform().s).toBeCloseTo(2, 5);
    fireEvent.pointerUp(dialog, { pointerId: 2 });
    fireEvent.pointerUp(dialog, { pointerId: 1 });
  });

  it("zooms in on a double tap on the picture and back out on the next", () => {
    vi.useFakeTimers();
    render(<ImageViewer url="blob:x" w={400} h={1600} onClose={() => {}} />);
    const img = document.querySelector(".ch-viewer-img") as HTMLElement;
    const tap = (id: number) => {
      fireEvent.pointerDown(img, { pointerId: id, clientX: 200, clientY: 400 });
      fireEvent.pointerUp(img, { pointerId: id, clientX: 200, clientY: 400 });
    };
    tap(1);
    vi.advanceTimersByTime(100);
    tap(2);
    expect(transform().s).toBe(2.5);
    vi.advanceTimersByTime(1000);
    tap(3);
    vi.advanceTimersByTime(100);
    tap(4);
    expect(transform().s).toBe(1);
    vi.useRealTimers();
  });
});
