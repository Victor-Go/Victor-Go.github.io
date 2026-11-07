import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Conversation } from "../components/Conversation";
import { setLang } from "../lang";
import { initialState, useChat } from "../store";

const removeContact = vi.hoisted(() => vi.fn(async (_userId: string) => {}));
vi.mock("../client", async (orig) => ({ ...(await orig<typeof import("../client")>()), removeContact }));

const CONV = "c1";
const setContact = (over: { deleted?: boolean } = {}) =>
  useChat.setState({
    ...initialState,
    phase: "ready",
    me: { userId: "me", handle: "me", role: "user", publicKey: "" },
    contacts: [{ userId: "peer", handle: "peer", role: "user", convId: CONV, key: new Uint8Array(32), ...over }],
    activeConv: CONV,
    messages: { [CONV]: [] },
  });

beforeEach(() => {
  setLang("zh");
  removeContact.mockClear();
  setContact();
});
afterEach(() => vi.restoreAllMocks());

describe("removing a contact from the chat", () => {
  it("the info button opens the contact, and nothing is removed until it is confirmed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Conversation />);
    fireEvent.click(screen.getByLabelText("联系人信息"));
    fireEvent.click(screen.getByText("删除联系人"));
    expect(removeContact).not.toHaveBeenCalled();
  });

  it("confirming removes that contact", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Conversation />);
    fireEvent.click(screen.getByLabelText("联系人信息"));
    fireEvent.click(screen.getByText("删除联系人"));
    await waitFor(() => expect(removeContact).toHaveBeenCalledWith("peer"));
  });

  it("a contact whose account is gone has no such button (the server refuses it)", () => {
    setContact({ deleted: true });
    render(<Conversation />);
    expect(screen.queryByLabelText("联系人信息")).toBeNull();
  });
});
