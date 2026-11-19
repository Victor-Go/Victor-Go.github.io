import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { keepScreenAwake, listOutputs } from "../callDevice";
import { CallOverlay } from "../components/CallOverlay";
import { EMPTY, HOLD_MS, SETTLE_MS, stepHold } from "../holdProgress";
import { setLang } from "../lang";
import { initialState, useChat, type CallView } from "../store";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("keeping the screen awake", () => {
  it("asks for the lock, asks again when the page comes back, and gives it up at the end", async () => {
    const release = vi.fn(async () => {});
    const request = vi.fn(async () => ({ release }));
    vi.stubGlobal("navigator", { wakeLock: { request } });
    const stop = keepScreenAwake();
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    document.dispatchEvent(new Event("visibilitychange")); // the page is visible in the test: a new lock is asked for
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    stop();
    await vi.waitFor(() => expect(release).toHaveBeenCalled());
    document.dispatchEvent(new Event("visibilitychange"));
    expect(request).toHaveBeenCalledTimes(2); // nothing more after the end
  });

  it("is a no-op where the browser has no Wake Lock, and a refusal does not matter", async () => {
    vi.stubGlobal("navigator", {});
    expect(() => keepScreenAwake()()).not.toThrow();
    vi.stubGlobal("navigator", { wakeLock: { request: async () => { throw new Error("denied"); } } });
    expect(() => keepScreenAwake()()).not.toThrow();
  });
});

describe("the sound outputs", () => {
  it("lists speakers and headphones only where the page can choose", async () => {
    vi.stubGlobal("navigator", { mediaDevices: { enumerateDevices: async () => [{ kind: "audiooutput", deviceId: "a", label: "Speaker" }, { kind: "audioinput", deviceId: "m", label: "Mic" }, { kind: "audiooutput", deviceId: "b", label: "" }] } });
    const proto = HTMLMediaElement.prototype as unknown as { setSinkId?: unknown };
    expect(await listOutputs()).toEqual([]); // jsdom has no setSinkId: like iOS Safari
    proto.setSinkId = async () => {};
    try {
      expect(await listOutputs()).toEqual([{ id: "a", label: "Speaker" }, { id: "b", label: "2" }]);
    } finally {
      delete proto.setSinkId;
    }
  });
});

describe("the call screen", () => {
  const live: CallView = { id: "k", userId: "bob", dir: "out", phase: "active", muted: false, startedAt: 1, remote: null };
  beforeEach(() => {
    setLang("en");
    vi.stubGlobal("navigator", { wakeLock: { request: async () => ({ release: async () => {} }) } });
    useChat.setState({ ...initialState, phase: "ready", contacts: [{ userId: "bob", handle: "bob", role: "user", convId: "c", key: null }], call: live });
  });

  /** A requestAnimationFrame the test drives: `tick(ms)` moves the clock on and runs the frame that is waiting. */
  function frames() {
    let clock = 0;
    let waiting: FrameRequestCallback | null = null;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      waiting = cb;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {
      waiting = null;
    });
    return {
      tick: (ms: number) => {
        clock += ms;
        const cb = waiting;
        waiting = null;
        act(() => cb?.(clock));
      },
      pending: () => waiting !== null,
    };
  }
  const target = () => screen.getByLabelText("Press and hold for 3 seconds to unlock");
  const progress = () => Number(target().getAttribute("data-progress"));

  it("locks, and only a hold on the target for three seconds unlocks; a touch anywhere else does nothing", () => {
    const f = frames();
    const { container } = render(<CallOverlay />);
    fireEvent.click(screen.getByLabelText("Lock screen"));
    const cover = container.ownerDocument.querySelector(".ch-call-lock") as HTMLElement;
    fireEvent.pointerDown(cover); // the cover itself, not the target
    f.tick(HOLD_MS * 2);
    expect(target()).toBeTruthy();
    expect(progress()).toBe(0);
    fireEvent.pointerDown(target());
    expect(target().getAttribute("data-holding")).toBe("true");
    f.tick(HOLD_MS / 2);
    expect(progress()).toBeCloseTo(0.5, 2);
    f.tick(HOLD_MS / 2);
    expect(screen.queryByLabelText("Press and hold for 3 seconds to unlock")).toBeNull();
  });

  const held = () => Number(target().getAttribute("data-held"));

  it("letting go loses the press at once and the ring empties in about a tenth of a second (a lerp, not a fixed run)", () => {
    const f = frames();
    render(<CallOverlay />);
    fireEvent.click(screen.getByLabelText("Lock screen"));
    fireEvent.pointerDown(target());
    f.tick(HOLD_MS * 0.5);
    expect(progress()).toBeCloseTo(0.5, 2);
    fireEvent.pointerUp(target());
    expect(held()).toBe(0); // reset the moment the finger is up
    f.tick(SETTLE_MS / 2); // half of the settle time: the ring is well on its way down
    expect(progress()).toBeGreaterThan(0);
    expect(progress()).toBeLessThan(0.1);
    f.tick(SETTLE_MS * 2);
    expect(progress()).toBe(0);
    expect(f.pending()).toBe(false); // nothing keeps running once it is at rest
    expect(target()).toBeTruthy(); // let go early: still locked
  });

  it("a new press needs no waiting for the ring to finish emptying: the press starts from 0 at once", () => {
    const f = frames();
    render(<CallOverlay />);
    fireEvent.click(screen.getByLabelText("Lock screen"));
    fireEvent.pointerDown(target());
    f.tick(HOLD_MS * 0.5);
    fireEvent.pointerUp(target());
    f.tick(SETTLE_MS * 0.2); // still well above zero
    const mid = progress();
    expect(mid).toBeGreaterThan(0.1);
    fireEvent.pointerDown(target());
    expect(target().getAttribute("data-holding")).toBe("true");
    f.tick(HOLD_MS * 0.1);
    expect(held()).toBeCloseTo(0.1, 2); // the press did not inherit the earlier half
    expect(progress()).toBeCloseTo(0.1, 1);
  });

  it("holding in several short goes never adds up: only an unbroken hold unlocks", () => {
    const f = frames();
    render(<CallOverlay />);
    fireEvent.click(screen.getByLabelText("Lock screen"));
    for (let i = 0; i < 3; i++) {
      fireEvent.pointerDown(target());
      f.tick(HOLD_MS * 0.9);
      fireEvent.pointerUp(target());
      f.tick(SETTLE_MS * 3);
    }
    expect(target()).toBeTruthy();
  });

  it("a finger that slides off the target counts as let go", () => {
    const f = frames();
    render(<CallOverlay />);
    fireEvent.click(screen.getByLabelText("Lock screen"));
    vi.spyOn(target(), "getBoundingClientRect").mockReturnValue({ left: 100, right: 200, top: 100, bottom: 200, width: 100, height: 100, x: 100, y: 100, toJSON() {} });
    fireEvent.pointerDown(target(), { clientX: 150, clientY: 150 });
    f.tick(1000);
    fireEvent.pointerMove(target(), { clientX: 150, clientY: 160 }); // still on it
    expect(target().getAttribute("data-holding")).toBe("true");
    fireEvent.pointerMove(target(), { clientX: 400, clientY: 400 }); // off it
    expect(target().getAttribute("data-holding")).toBe("false");
  });

  it("offers no lock while it is only ringing, and drops the lock when the call ends", () => {
    act(() => useChat.setState({ call: { ...live, phase: "ringing", dir: "in", startedAt: null } }));
    render(<CallOverlay />);
    expect(screen.queryByLabelText("Lock screen")).toBeNull();
    act(() => useChat.setState({ call: live }));
    fireEvent.click(screen.getByLabelText("Lock screen"));
    act(() => useChat.setState({ call: { ...live, phase: "ended", reason: "ended" } }));
    expect(screen.queryByLabelText("Press and hold for 3 seconds to unlock")).toBeNull();
  });
});

describe("the hold ratio", () => {
  it("the press grows at 1 / HOLD_MS and drops to 0 when let go; the ring eases towards it", () => {
    const a = stepHold(EMPTY, HOLD_MS / 4, true);
    expect(a.held).toBeCloseTo(0.25, 5);
    expect(a.shown).toBeCloseTo(0.25, 2); // one long step: all the way
    expect(stepHold({ held: 0.9, shown: 0.9 }, HOLD_MS, true).held).toBe(1);
    const gone = stepHold({ held: 0.8, shown: 0.8 }, 16, false);
    expect(gone.held).toBe(0);
    expect(gone.shown).toBeGreaterThan(0.3); // 16 ms of a 100 ms settle: only part of the way (0.8 x e^-0.74)
    expect(gone.shown).toBeLessThan(0.8);
  });

  it("is at 99 % of the way after SETTLE_MS, however many steps it is made of, and then rests exactly at the target", () => {
    let one = { held: 0, shown: 1 };
    one = stepHold(one, SETTLE_MS, false);
    expect(one.shown).toBeCloseTo(0.01, 2);
    let many = { held: 0, shown: 1 };
    for (let i = 0; i < 10; i++) many = stepHold(many, SETTLE_MS / 10, false);
    expect(many.shown).toBeCloseTo(one.shown, 4);
    expect(stepHold(many, SETTLE_MS * 3, false)).toEqual({ held: 0, shown: 0 });
    expect(stepHold({ held: 0.4, shown: 0.4 }, -50, true).held).toBe(0.4);
  });
});
