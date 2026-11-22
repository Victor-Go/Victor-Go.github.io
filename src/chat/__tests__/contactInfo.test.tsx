import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Conversation } from "../components/Conversation";
import { setLang } from "../lang";
import { ApiError } from "../net/api";
import { initialState, useChat } from "../store";

const removeContact = vi.hoisted(() => vi.fn(async (_userId: string) => {}));
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const lookupUser = vi.hoisted(() => vi.fn());
vi.mock("../client", async (orig) => ({ ...(await orig<typeof import("../client")>()), removeContact, rawApi: () => api, lookupUser }));

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
    const alert = vi.spyOn(window, "confirm");
    render(<Conversation />);
    fireEvent.click(screen.getByLabelText("联系人信息"));
    fireEvent.click(screen.getByText("删除联系人"));
    // our own dialog asks, with a word about favourites; the browser's confirm is never used
    expect(screen.getByText("关于收藏")).toBeTruthy();
    expect(alert).not.toHaveBeenCalled();
    expect(removeContact).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("取消"));
    expect(screen.queryByText("关于收藏")).toBeNull();
    expect(removeContact).not.toHaveBeenCalled();
  });

  it("confirming removes that contact", async () => {
    useChat.setState({ favorites: [{ id: "f1", conv: CONV, from: "peer", text: "x", time: 1, savedAt: 1, gen: 1, kind: "voice" }] });
    render(<Conversation />);
    fireEvent.click(screen.getByLabelText("联系人信息"));
    fireEvent.click(screen.getByText("删除联系人"));
    expect(screen.getByText((t) => t.includes("你从这个聊天收藏的 1 条内容会被一并删除(其中 1 条是随收藏保存的语音或图片文件)"))).toBeTruthy();
    fireEvent.click(screen.getAllByText("删除联系人").at(-1)!);
    await waitFor(() => expect(removeContact).toHaveBeenCalledWith("peer"));
  });

  it("a contact whose account is gone has no such button (the server refuses it)", () => {
    setContact({ deleted: true });
    render(<Conversation />);
    expect(screen.queryByLabelText("联系人信息")).toBeNull();
  });
});

describe("sending a contact card from the contact's info panel", () => {
  const asAdmin = () => useChat.setState({ me: { userId: "me", handle: "me", role: "admin", publicKey: "" }, title: "admin", permissions: ["cards", "groups.create"] });
  const open = () => {
    render(<Conversation />);
    fireEvent.click(screen.getByLabelText("联系人信息"));
  };

  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    lookupUser.mockReset();
    lookupUser.mockResolvedValue({ userId: "u2", handle: "bob", role: "user" });
  });

  it("shows the button to an administrator and not to an ordinary user", () => {
    open();
    expect(screen.queryByText("发送联系人名片")).toBeNull();
    cleanup();
    asAdmin();
    open();
    expect(screen.getByText("发送联系人名片")).toBeTruthy();
  });

  it("opens the card dialog with this contact as the recipient, and sends the card for the person found", async () => {
    asAdmin();
    open();
    fireEvent.click(screen.getByText("发送联系人名片"));
    expect(screen.getByText("接收人:@peer")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("名片上的账户名"), { target: { value: "bob" } });
    api.post.mockResolvedValue({});
    fireEvent.click(screen.getByText("发送"));
    await waitFor(() => expect(lookupUser).toHaveBeenCalledWith("bob", expect.any(Function)));
    expect(api.get).not.toHaveBeenCalled(); // no candidate search
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/admin/cards", { recipientId: "peer", subjectId: "u2", expiresInDays: 3 }));
    await screen.findByText(/已把 @bob 的名片发给 @peer/);
  });

  it("tells the administrator to unlock management when the lock is closed", async () => {
    asAdmin();
    open();
    fireEvent.click(screen.getByText("发送联系人名片"));
    fireEvent.change(screen.getByLabelText("名片上的账户名"), { target: { value: "bob" } });
    api.post.mockRejectedValue(new ApiError(403, "stepup_required"));
    fireEvent.click(screen.getByText("发送"));
    await screen.findByText(/管理功能已锁定/);
    expect(screen.getByText("去解锁")).toBeTruthy();
  });
});
