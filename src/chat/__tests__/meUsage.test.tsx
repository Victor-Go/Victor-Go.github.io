import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MePage } from "../components/MePage";
import { setLang } from "../lang";
import { PATH, go } from "../route";
import { initialState, useChat } from "../store";

const me = { userId: "u1", handle: "vera", role: "user" as const, publicKey: "" };

beforeEach(() => {
  setLang("en");
  go(PATH.me);
  useChat.setState({ ...initialState, phase: "ready", me });
});

describe("the monthly usage on the Me page", () => {
  it("shows the voice and pictures sent under the messages sent, in MB against the limit", () => {
    useChat.setState({ usage: { used: 12, limit: 30000, resetAt: 0, fileBytes: 2_500_000, fileLimit: 100_000_000 } });
    render(<MePage />);
    expect(screen.getByText("Messages sent this month")).toBeTruthy();
    expect(screen.getByText("Voice and pictures sent this month")).toBeTruthy();
    expect(screen.getByText("2.5 MB / 100 MB")).toBeTruthy();
  });

  it("says no limit for the administrator, and hides the line while files are off", () => {
    useChat.setState({ me: { ...me, role: "admin" }, usage: { used: 1, limit: null, resetAt: 0, fileBytes: 0, fileLimit: null } });
    const { rerender } = render(<MePage />);
    expect(screen.getByText("0 B (no limit)")).toBeTruthy();
    useChat.setState({ filesOff: true });
    rerender(<MePage />);
    expect(screen.queryByText("Voice and pictures sent this month")).toBeNull();
  });
});
