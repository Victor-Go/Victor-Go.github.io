import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatSocket } from "../net/socket";

class FakeSocket {
  static last: FakeSocket;
  static OPEN = 1;
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  readonly url: string;
  constructor(url: string) {
    this.url = url;
    FakeSocket.last = this;
  }
  send() {}
  close() {}
}

async function started() {
  vi.stubGlobal("WebSocket", FakeSocket);
  const finals: string[] = [];
  const states: string[] = [];
  const sock = new ChatSocket({ url: "ws://x", getTicket: async () => "t", onFrame: () => {}, onState: (s) => states.push(s), onFinal: (r) => finals.push(r) });
  sock.start();
  await vi.waitFor(() => expect(FakeSocket.last).toBeDefined());
  FakeSocket.last.onopen?.();
  return { sock, finals, states };
}

afterEach(() => vi.unstubAllGlobals());

describe("ChatSocket final closes", () => {
  it("a bye frame ends the sign-in once, with its reason, even if the close code is lost", async () => {
    const { sock, finals, states } = await started();
    FakeSocket.last.onmessage?.({ data: JSON.stringify({ t: "bye", code: 4002, reason: "replaced" }) });
    FakeSocket.last.onclose?.({ code: 1000, reason: "" });
    expect(finals).toEqual(["replaced"]);
    expect(states.at(-1)).toBe("closed");
    sock.stop();
  });

  it("a final close code still works without a bye frame, and is not reported twice", async () => {
    const { finals } = await started();
    FakeSocket.last.onclose?.({ code: 4001, reason: "session" });
    FakeSocket.last.onclose?.({ code: 4001, reason: "session" });
    expect(finals).toEqual(["session"]);
  });
});
