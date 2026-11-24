import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useIdleLogout } from "../hooks";
import { initialState, useChat } from "../store";
import { lock } from "../client";

vi.mock("../client", async (orig) => ({ ...(await orig<typeof import("../client")>()), lock: vi.fn(), touch: vi.fn(), callInProgress: () => false }));

beforeEach(() => {
  vi.mocked(lock).mockClear();
  vi.useFakeTimers();
  useChat.setState({ ...initialState, idleMinutes: 1 });
});
afterEach(() => vi.useRealTimers());

const notice = (n: number) => `idle ${n}`;
const move = (x: number, y: number) => window.dispatchEvent(new MouseEvent("pointermove", { clientX: x, clientY: y }));

describe("the inactivity logout", () => {
  it("signs out with its own notice, naming the minutes", () => {
    renderHook(() => useIdleLogout(true, notice));
    act(() => void vi.advanceTimersByTime(61_000));
    expect(lock).toHaveBeenCalledWith("idle 1");
  });

  it("ignores a small or slow mouse movement but counts 10 px within a second", () => {
    renderHook(() => useIdleLogout(true, notice));
    act(() => void vi.advanceTimersByTime(40_000));
    act(() => {
      move(0, 0);
      move(5, 5); // 7 px: a twitch
    });
    act(() => void vi.advanceTimersByTime(1500));
    act(() => {
      move(100, 100); // a new anchor after more than a second
      vi.advanceTimersByTime(1500);
      move(120, 100); // 20 px, but too slow
    });
    act(() => void vi.advanceTimersByTime(19_000)); // 61 s since the start, nothing counted
    expect(lock).toHaveBeenCalled();
  });

  it("counts a real mouse movement as activity", () => {
    renderHook(() => useIdleLogout(true, notice));
    act(() => void vi.advanceTimersByTime(50_000));
    act(() => {
      move(0, 0);
      vi.advanceTimersByTime(300);
      move(30, 0);
    });
    act(() => void vi.advanceTimersByTime(30_000));
    expect(lock).not.toHaveBeenCalled();
  });
});

describe("the inactivity warning", () => {
  it("shows in the last 30 seconds and goes away when the person is signed out", () => {
    const { result, rerender } = renderHook(({ on }) => useIdleLogout(on, notice), { initialProps: { on: true } });
    act(() => void vi.advanceTimersByTime(40_000));
    expect(result.current.warning).toBe(true);
    rerender({ on: false }); // signed out
    expect(result.current.warning).toBe(false);
  });
});
