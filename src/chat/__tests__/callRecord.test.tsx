import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { toEpochs } from "../crypto/keys";
import { decryptMessage, encryptMessage, type Binding, type Payload } from "../crypto/message";
import { CallBubble, talkTime } from "../components/CallBubble";
import { setLang } from "../lang";
import type { Msg } from "../store";

const epochs = toEpochs([{ id: 100, constant: "constA_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }], 100);
const binding: Binding = { conv: "c1", senderId: "alice", clientMsgId: "m1", gen: 0 };
const key = new Uint8Array(32).fill(9);

describe("the call record is an ordinary encrypted message", () => {
  it("round-trips, and only a known outcome and a sensible length are accepted", async () => {
    const ok: Payload = { k: "call", call: { outcome: "answered", sec: 187 }, sentAt: 5 };
    expect(await decryptMessage(key, epochs, (await encryptMessage(key, epochs, ok, binding)).ct, binding)).toEqual(ok);
    for (const bad of [
      { outcome: "online", sec: 0 },
      { outcome: "answered", sec: -1 },
      { outcome: "answered", sec: 1.5 },
      { outcome: "answered", sec: 24 * 3600 + 1 },
      { outcome: "answered" },
    ]) {
      const { ct } = await encryptMessage(key, epochs, { k: "call", call: bad, sentAt: 1 } as unknown as Payload, binding);
      await expect(decryptMessage(key, epochs, ct, binding)).rejects.toThrow();
    }
  });
});

describe("the call record in the chat", () => {
  beforeEach(() => setLang("en"));
  const msg = (outcome: "answered" | "noanswer" | "cancelled" | "declined" | "failed", sec: number, mine: boolean): Msg => ({
    id: "m", seq: 1, senderId: mine ? "me" : "bob", role: "user", time: 1, mine, status: "sent", payload: { k: "call", call: { outcome, sec }, sentAt: 1 },
  });

  it("formats the talking time", () => {
    expect(talkTime(0)).toBe("00:00");
    expect(talkTime(187)).toBe("03:07");
    expect(talkTime(3725)).toBe("1:02:05");
  });

  it("an answered call shows its length to both people", () => {
    const { unmount } = render(<CallBubble m={msg("answered", 187, true)} />);
    expect(screen.getByText("Voice call 03:07")).toBeTruthy();
    unmount();
    render(<CallBubble m={msg("answered", 187, false)} />);
    expect(screen.getByText("Voice call 03:07")).toBeTruthy();
  });

  it("a call nobody took up is a missed call for the one who was rung, and no answer or cancelled for the caller; never anything about being online", () => {
    const cases: [ReturnType<typeof msg>, string][] = [
      [msg("noanswer", 0, false), "Missed call"],
      [msg("cancelled", 0, false), "Missed call"],
      [msg("noanswer", 0, true), "No answer"],
      [msg("cancelled", 0, true), "Cancelled"],
      [msg("failed", 0, true), "The call could not connect"],
    ];
    for (const [m, text] of cases) {
      const { unmount, container } = render(<CallBubble m={m} />);
      expect(screen.getByText(text)).toBeTruthy();
      expect(container.textContent?.toLowerCase()).not.toMatch(/online|offline|busy|declin/);
      unmount();
    }
  });

  it("a declined call reads as declined for the caller and as a call you declined for the callee", () => {
    const { unmount } = render(<CallBubble m={msg("declined", 0, true)} />);
    expect(screen.getByText("Declined")).toBeTruthy();
    unmount();
    render(<CallBubble m={msg("declined", 0, false)} />);
    expect(screen.getByText("You declined")).toBeTruthy();
  });

  it("a missed call is drawn in the warning colour only for the person who missed it", () => {
    const { container, unmount } = render(<CallBubble m={msg("noanswer", 0, false)} />);
    expect(container.querySelector(".ch-callrec.ch-bad")).not.toBeNull();
    unmount();
    const mine = render(<CallBubble m={msg("noanswer", 0, true)} />);
    expect(mine.container.querySelector(".ch-callrec.ch-bad")).toBeNull();
  });
});
