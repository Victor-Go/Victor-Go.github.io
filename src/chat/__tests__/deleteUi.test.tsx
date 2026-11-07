import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Conversation } from "../components/Conversation";
import { setLang } from "../lang";
import { initialState, useChat, type Msg } from "../store";

const deleteMessages = vi.hoisted(() => vi.fn(async () => ({ deleted: [2], error: null })));
const loadOlder = vi.hoisted(() => vi.fn(async (_conv: string) => {}));
vi.mock("../client", async (orig) => ({ ...(await orig<typeof import("../client")>()), deleteMessages, loadOlder }));

const CONV = "c1";
const msg = (seq: number, over: Partial<Msg> = {}): Msg => ({
  id: `m${seq}`,
  seq,
  senderId: "me",
  role: "user",
  time: Date.now(),
  mine: true,
  payload: { k: "text", text: `hello ${seq}`, sentAt: 1 },
  status: "sent",
  ...over,
});

beforeEach(() => {
  setLang("zh");
  vi.useFakeTimers({ shouldAdvanceTime: true });
  useChat.setState({
    ...initialState,
    phase: "ready",
    me: { userId: "me", handle: "me", role: "user", publicKey: "" },
    contacts: [{ userId: "peer", handle: "peer", role: "user", convId: CONV, key: new Uint8Array(32) }],
    activeConv: CONV,
    messages: {
      [CONV]: [
        msg(1, { senderId: "peer", mine: false }),
        msg(2),
        msg(3, { payload: null, deleted: true, id: "deleted:3" }),
      ],
    },
  });
});
afterEach(() => vi.useRealTimers());

describe("deleting from the conversation", () => {
  it("shows a deleted message as a card, without any text", () => {
    render(<Conversation />);
    expect(screen.getByText("消息已删除")).toBeTruthy();
  });

  it("holding my message for a second starts selecting with it picked; the composer becomes cancel and delete; others cannot be picked", () => {
    render(<Conversation />);
    const mine = screen.getByText("hello 2").closest(".ch-msgrow") as HTMLElement;
    fireEvent.pointerDown(mine, { clientX: 5, clientY: 5 });
    act(() => void vi.advanceTimersByTime(999));
    expect(screen.queryByRole("checkbox")).toBeNull();
    act(() => void vi.advanceTimersByTime(2));
    expect(screen.getAllByRole("checkbox")).toHaveLength(1); // only mine
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("已选 1 条")).toBeTruthy();
    expect(screen.queryByPlaceholderText("输入消息")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByPlaceholderText("输入消息")).toBeTruthy();
  });

  it("holding someone else's message, or moving before the second is up, selects nothing", () => {
    render(<Conversation />);
    fireEvent.pointerDown(screen.getByText("hello 1").closest(".ch-msgrow") as HTMLElement, { clientX: 5, clientY: 5 });
    act(() => void vi.advanceTimersByTime(1500));
    expect(screen.queryByRole("checkbox")).toBeNull();
    const mine = screen.getByText("hello 2").closest(".ch-msgrow") as HTMLElement;
    fireEvent.pointerDown(mine, { clientX: 5, clientY: 5 });
    fireEvent.pointerMove(mine, { clientX: 40, clientY: 5 });
    act(() => void vi.advanceTimersByTime(1500));
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("asks before deleting, says how many (and that everyone loses them), then deletes what is picked", async () => {
    useChat.setState({ favorites: [{ id: `${CONV}.m2`, conv: CONV, from: "me", text: "hello 2", time: 1, savedAt: 1, gen: 1 }] });
    render(<Conversation />);
    fireEvent.pointerDown(screen.getByText("hello 2").closest(".ch-msgrow") as HTMLElement, { clientX: 5, clientY: 5 });
    act(() => void vi.advanceTimersByTime(1100));
    fireEvent.click(screen.getByRole("button", { name: /删除/ }));
    expect(screen.getByText(/将删除 1 条消息.其中 1 条是你收藏过的/)).toBeTruthy();
    expect(screen.getByText(/所有人都将看不到/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: /删除/ }).at(-1)!);
    });
    expect(deleteMessages).toHaveBeenCalledWith(CONV, [2]);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});

describe("paging back", () => {
  it("keeps the reader where they were when older messages are drawn above", async () => {
    // jsdom has no layout: every child of the list is 100px high, and the scroll position is a plain number.
    const tops = new WeakMap<Element, number>();
    const proto = HTMLElement.prototype;
    const sh = Object.getOwnPropertyDescriptor(proto, "scrollHeight");
    const st = Object.getOwnPropertyDescriptor(proto, "scrollTop");
    Object.defineProperty(proto, "scrollHeight", { configurable: true, get() { return this.children.length * 100; } });
    Object.defineProperty(proto, "scrollTop", { configurable: true, get() { return tops.get(this) ?? 0; }, set(v: number) { tops.set(this, v); } });
    try {
      const mk = (seq: number) => msg(seq, { time: Date.now() });
      useChat.setState({ messages: { [CONV]: [mk(30), mk(31)] }, olderMore: { [CONV]: true } });
      loadOlder.mockImplementationOnce(async (conv: string) => {
        await new Promise((r) => setTimeout(r, 200)); // a slow answer, while more scroll events arrive
        useChat.setState({ messages: { [conv]: [mk(10), mk(11), mk(12), mk(30), mk(31)] } });
      });
      const { container } = render(<Conversation />);
      const list = container.querySelector(".ch-messages") as HTMLElement;
      const before = list.scrollHeight;
      list.scrollTop = 20; // the reader is near the top
      fireEvent.scroll(list);
      fireEvent.scroll(list);
      fireEvent.scroll(list);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(loadOlder).toHaveBeenCalledTimes(1);
      expect(list.scrollTop).toBe(list.scrollHeight - before + 20); // the same message is still under the reader's eyes, not the bottom
      expect(list.scrollTop).not.toBe(list.scrollHeight);
    } finally {
      if (sh) Object.defineProperty(proto, "scrollHeight", sh);
      else delete (proto as unknown as Record<string, unknown>).scrollHeight;
      if (st) Object.defineProperty(proto, "scrollTop", st);
      else delete (proto as unknown as Record<string, unknown>).scrollTop;
    }
  });
});
