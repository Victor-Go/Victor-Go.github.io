import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MePage } from "../components/MePage";
import { WelcomeNotice } from "../components/WelcomeNotice";
import { setLang } from "../lang";
import { initialState, useChat } from "../store";

const refreshUsage = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../client", async (orig) => ({ ...(await orig<typeof import("../client")>()), refreshUsage }));

beforeEach(() => {
  setLang("zh");
  refreshUsage.mockClear();
  useChat.setState({ ...initialState, phase: "ready", me: { userId: "me", handle: "me", role: "user", publicKey: "" }, idleMinutes: 10 });
});
afterEach(cleanup);

describe("the notice after an account is created", () => {
  it("is shown while welcome is set, with the person's own idle time, and closes for good", () => {
    useChat.setState({ welcome: true });
    render(<WelcomeNotice />);
    expect(screen.getByText("无操作 10 分钟后会自动登出并清空所有信息。")).toBeTruthy();
    expect(screen.getByText(/关闭标签页就会登出/)).toBeTruthy();
    fireEvent.click(screen.getByText("知道了"));
    expect(useChat.getState().welcome).toBe(false);
    expect(screen.queryByText("请先了解")).toBeNull();
  });

  it("is not shown at an ordinary sign-in", () => {
    render(<WelcomeNotice />);
    expect(screen.queryByText("请先了解")).toBeNull();
  });
});

describe("the usage counters", () => {
  it("are read when the Me pages open, and not by anything else here", () => {
    render(<MePage />);
    expect(refreshUsage).toHaveBeenCalledTimes(1);
  });
});
