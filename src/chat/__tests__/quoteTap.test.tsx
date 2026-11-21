import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Conversation } from "../components/Conversation";
import { setLang } from "../lang";
import { initialState, useChat, type Msg } from "../store";

const CONV = "c1";
const msg = (seq: number, text: string, mine = false): Msg => ({
  id: `m${seq}`, seq, senderId: mine ? "me" : "peer", role: "user", time: Date.now(), mine, status: "sent", payload: { k: "text", text, sentAt: 1 },
});

beforeEach(() => {
  setLang("zh");
  useChat.setState({
    ...initialState,
    phase: "ready",
    me: { userId: "me", handle: "me", role: "user", publicKey: "" },
    contacts: [{ userId: "peer", handle: "peer", role: "user", convId: CONV, key: new Uint8Array(32) }],
    activeConv: CONV,
    messages: { [CONV]: [msg(1, "我打给你"), msg(2, "好的\n第二行", true)] },
  });
});

const draftOf = () => (document.querySelector("textarea.ch-input") as HTMLTextAreaElement).value;

describe("double tap on a message", () => {
  it("one tap does nothing; two quote the text on new lines", () => {
    render(<Conversation />);
    const text = screen.getByText("我打给你");
    fireEvent.click(text);
    expect(draftOf()).toBe("");
    fireEvent.click(text);
    expect(draftOf()).toBe("> 我打给你\n");
  });

  it("quoting two messages gives two boxes, and a message with several lines quotes them all", () => {
    render(<Conversation />);
    fireEvent.click(screen.getByText("我打给你"));
    fireEvent.click(screen.getByText("我打给你"));
    const mine = document.querySelectorAll(".ch-text")[1];
    fireEvent.click(mine);
    fireEvent.click(mine);
    expect(draftOf()).toBe("> 我打给你\n\n> 好的\n> 第二行\n");
  });

  it("two taps on different messages are not a double tap", () => {
    render(<Conversation />);
    fireEvent.click(screen.getByText("我打给你"));
    fireEvent.click(document.querySelectorAll(".ch-text")[1]);
    expect(draftOf()).toBe("");
  });
});
