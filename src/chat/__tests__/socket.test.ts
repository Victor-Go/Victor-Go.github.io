import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatSocket, CONNECT_TIMEOUT_MS, SWITCH_DELAY_MS } from "../net/socket";

class FakeSocket {
  static all: FakeSocket[] = [];
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
    FakeSocket.all.push(this);
  }
  send() {}
  /** Closing a socket that is not open, or open, ends in `onclose`. */
  close(code = 1006) {
    this.onclose?.({ code, reason: "" });
  }
}

const WS_A = "wss://a.example.com";
const WS_B = "wss://b.example.com";

function make(urls: string[]) {
  vi.stubGlobal("WebSocket", FakeSocket);
  FakeSocket.all = [];
  const finals: string[] = [];
  const states: string[] = [];
  const sock = new ChatSocket({ urls, getTicket: async () => "t", onFrame: () => {}, onState: (s) => states.push(s), onFinal: (r) => finals.push(r) });
  return { sock, finals, states };
}

async function started() {
  const made = make(["ws://x"]);
  made.sock.start();
  await vi.waitFor(() => expect(FakeSocket.all.length).toBe(1));
  FakeSocket.last.onopen?.();
  return made;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

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

describe("ChatSocket with a pool of addresses", () => {
  it("starts with the first address and carries the ticket", async () => {
    const { sock } = make([WS_A, WS_B]);
    sock.start();
    await vi.waitFor(() => expect(FakeSocket.all.length).toBe(1));
    expect(FakeSocket.all[0].url).toBe(`${WS_A}?ticket=t`);
    sock.stop();
  });

  it("hands over to the next address, after a short pause, when one never opens", async () => {
    const { sock } = make([WS_A, WS_B]);
    sock.start();
    await vi.waitFor(() => expect(FakeSocket.all.length).toBe(1));
    FakeSocket.all[0].onclose?.({ code: 1006, reason: "" }); // refused or reset before it opened
    await vi.waitFor(() => expect(FakeSocket.all.length).toBe(2), { timeout: SWITCH_DELAY_MS * 8 });
    expect(FakeSocket.all[1].url).toBe(`${WS_B}?ticket=t`);
    sock.stop();
  });

  it("gives up an address that stays silent, after the connect timeout", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const { sock } = make([WS_A, WS_B]);
    sock.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeSocket.all.map((s) => s.url)).toEqual([`${WS_A}?ticket=t`]);
    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS); // the fake socket closes when told to
    await vi.advanceTimersByTimeAsync(SWITCH_DELAY_MS);
    expect(FakeSocket.all.map((s) => s.url)).toEqual([`${WS_A}?ticket=t`, `${WS_B}?ticket=t`]);
    sock.stop();
  });

  it("keeps the address that opened, also after it drops", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const { sock } = make([WS_A, WS_B]);
    sock.start();
    await vi.advanceTimersByTimeAsync(0);
    FakeSocket.all[0].onclose?.({ code: 1006, reason: "" }); // A never opens
    await vi.advanceTimersByTimeAsync(SWITCH_DELAY_MS);
    FakeSocket.all[1].onopen?.(); // B opens
    FakeSocket.all[1].onclose?.({ code: 1006, reason: "" }); // and drops later: the usual backoff, and B again
    await vi.advanceTimersByTimeAsync(2000);
    expect(FakeSocket.all.map((s) => s.url)).toEqual([`${WS_A}?ticket=t`, `${WS_B}?ticket=t`, `${WS_B}?ticket=t`]);
    sock.stop();
  });

  it("after a whole round of failures it backs off instead of hammering", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const { sock } = make([WS_A, WS_B]);
    sock.start();
    await vi.advanceTimersByTimeAsync(0);
    FakeSocket.all[0].onclose?.({ code: 1006, reason: "" });
    await vi.advanceTimersByTimeAsync(SWITCH_DELAY_MS);
    FakeSocket.all[1].onclose?.({ code: 1006, reason: "" }); // B fails too: the round is over
    await vi.advanceTimersByTimeAsync(SWITCH_DELAY_MS);
    expect(FakeSocket.all.length).toBe(2); // not yet: the backoff is at least half a second
    await vi.advanceTimersByTimeAsync(2000);
    expect(FakeSocket.all.length).toBe(3);
    expect(FakeSocket.all[2].url).toBe(`${WS_A}?ticket=t`);
    sock.stop();
  });

  it("a new start begins with the first address again", async () => {
    const { sock } = make([WS_A, WS_B]);
    sock.start();
    await vi.waitFor(() => expect(FakeSocket.all.length).toBe(1));
    FakeSocket.all[0].onclose?.({ code: 1006, reason: "" });
    await vi.waitFor(() => expect(FakeSocket.all.length).toBe(2), { timeout: SWITCH_DELAY_MS * 8 });
    sock.stop();
    sock.start();
    await vi.waitFor(() => expect(FakeSocket.all.length).toBe(3));
    expect(FakeSocket.all[2].url).toBe(`${WS_A}?ticket=t`);
    sock.stop();
  });
});
