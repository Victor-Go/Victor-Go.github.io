import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useIdleLogout } from "../hooks";
import { initialState, useChat } from "../store";

vi.mock("../client", async (orig) => ({ ...(await orig<typeof import("../client")>()), lock: vi.fn(), touch: vi.fn(), callInProgress: () => false }));

beforeEach(() => {
  vi.useFakeTimers();
  useChat.setState({ ...initialState, idleMinutes: 1 });
});
afterEach(() => vi.useRealTimers());

describe("the inactivity warning", () => {
  it("shows in the last 30 seconds and goes away when the person is signed out", () => {
    const { result, rerender } = renderHook(({ on }) => useIdleLogout(on, "expired"), { initialProps: { on: true } });
    act(() => void vi.advanceTimersByTime(40_000));
    expect(result.current.warning).toBe(true);
    rerender({ on: false }); // signed out
    expect(result.current.warning).toBe(false);
  });
});
