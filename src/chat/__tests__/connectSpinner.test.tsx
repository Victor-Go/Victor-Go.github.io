import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ContactsPane } from "../components/ContactsPane";
import { setLang } from "../lang";
import { initialState, useChat } from "../store";

beforeEach(() => {
  setLang("zh");
  useChat.setState({ ...initialState, phase: "ready", me: { userId: "me", handle: "me", role: "user", publicKey: "" } });
});
afterEach(cleanup);

describe("the spinner next to the contacts title", () => {
  it.each(["connecting", "reconnecting"] as const)("shows while the socket is %s", (socket) => {
    useChat.setState({ socket });
    render(<ContactsPane />);
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it.each(["open", "idle", "closed"] as const)("is not there when the socket is %s", (socket) => {
    useChat.setState({ socket });
    render(<ContactsPane />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
