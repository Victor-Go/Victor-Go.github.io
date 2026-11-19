import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { keepScreenAwake, listOutputs } from "../callDevice";
import { CallOverlay, HOLD_MS } from "../components/CallOverlay";
import { setLang } from "../lang";
import { initialState, useChat, type CallView } from "../store";

afterEach(() => vi.unstubAllGlobals());

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

  it("locks against stray touches and unlocks only with a press that lasts three seconds", () => {
    vi.useFakeTimers();
    try {
      render(<CallOverlay />);
      fireEvent.click(screen.getByLabelText("Lock screen"));
      const cover = screen.getByLabelText("Press and hold for 3 seconds to unlock");
      fireEvent.pointerDown(cover);
      act(() => void vi.advanceTimersByTime(HOLD_MS - 500));
      expect(cover.querySelector(".ch-call-ring")?.getAttribute("data-holding")).toBe("true"); // the ring is filling
      fireEvent.pointerUp(cover); // let go too early
      expect(cover.querySelector(".ch-call-ring")?.getAttribute("data-holding")).toBe("false");
      act(() => void vi.advanceTimersByTime(HOLD_MS));
      expect(screen.queryByLabelText("Press and hold for 3 seconds to unlock")).not.toBeNull();
      fireEvent.pointerDown(cover);
      act(() => void vi.advanceTimersByTime(HOLD_MS));
      expect(screen.queryByLabelText("Press and hold for 3 seconds to unlock")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
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
