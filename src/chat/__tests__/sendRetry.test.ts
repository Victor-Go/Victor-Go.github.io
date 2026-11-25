import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Api, ApiError } from "../net/api";
import type { ChatSocket } from "../net/socket";
import { toEpochs } from "../crypto/keys";
import { configure, lock, onFrame, resendMessage, sendText, testHooks } from "../client";
import { initialState, useChat } from "../store";

// What the person sees when the server cannot store a message right now (the server is busy) or does not answer at all:
// one automatic second try, then "failed" with a button that sends the same message again under the same id.

const CONV = "c1";
const { s } = testHooks;

function setup(post: (path: string, body?: unknown) => unknown = () => ({})) {
  lock(null);
  useChat.setState({ ...initialState, sound: false, phase: "ready", me: { userId: "me", handle: "me", role: "user", publicKey: "" } });
  const api = { token: "t", base: "http://x", get: vi.fn(async () => ({})), post: vi.fn(async (p: string, b?: unknown) => post(p, b)), put: vi.fn(), del: vi.fn(), request: vi.fn(), onUnauthorized: null } as unknown as Api;
  configure(api, null, { notifyTitle: () => "", lockNotice: () => "" });
  s.epochs = toEpochs([{ id: 1, constant: "week_one" }], 1);
  s.groupKeys.set(CONV, new Map([[0, new Uint8Array(32).fill(5)]]));
  const sent: { clientMsgId: string }[] = [];
  s.ws = { send: vi.fn((f: { t: string; clientMsgId: string }) => (f.t === "send" ? (sent.push(f), true) : true)), stop: vi.fn() } as unknown as ChatSocket;
  return { api, sent };
}

const mine = () => useChat.getState().messages[CONV]?.find((m) => m.mine);

// Only the clock is faked: the encryption finishes on real macrotasks, which `settle` waits for.
beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
/**
 * Waits on the real clock (Date is not faked): until the condition holds (at most 5 s: a slow runner needs far more than a laptop), or, with no
 * condition, a fixed 150 ms in which anything still under way (sealing a message again) finishes and nothing more is expected to happen.
 */
const settle = async (until?: () => boolean): Promise<void> => {
  const end = Date.now() + (until ? 5000 : 150);
  while (Date.now() < end && !until?.()) await new Promise<void>((next) => setImmediate(next));
};
afterEach(async () => {
  await settle(); // what a test left under way must finish while that test's own fakes are still in place, not in the next test
  vi.useRealTimers();
  lock(null);
});

describe("a message sent over the socket", () => {
  it("is sent once more after a busy answer that names it, and fails after a second one", async () => {
    const { sent } = setup();
    await sendText(CONV, "hello");
    const id = mine()!.id;
    expect(sent).toHaveLength(1);
    await onFrame({ t: "error", code: "busy", clientMsgId: id });
    expect(mine()!.status).toBe("sending"); // not failed yet: it is tried again after a short wait
    await vi.advanceTimersByTimeAsync(3_100);
    await settle(() => sent.length >= 2); // sealed again, on real time
    expect(sent.map((f) => f.clientMsgId)).toEqual([id, id]); // the same id: the server stores it once however often it arrives
    await onFrame({ t: "error", code: "busy", clientMsgId: id });
    expect(mine()!.status).toBe("failed");
    await vi.advanceTimersByTimeAsync(3_100);
    await settle();
    expect(sent).toHaveLength(2);
  });

  it("ignores a busy answer that names no message (a read receipt's, say)", async () => {
    const { sent } = setup();
    await sendText(CONV, "hello");
    await onFrame({ t: "error", code: "busy" });
    await vi.advanceTimersByTimeAsync(3_100);
    await settle();
    expect(mine()!.status).toBe("sending");
    expect(sent).toHaveLength(1);
  });

  it("is shown as failed when nothing answers, and turns into a sent one if the answer comes late", async () => {
    const { sent } = setup();
    await sendText(CONV, "hello");
    const id = mine()!.id;
    await vi.advanceTimersByTimeAsync(14_000);
    expect(mine()!.status).toBe("sending");
    await vi.advanceTimersByTimeAsync(1_500);
    expect(mine()!.status).toBe("failed");
    await onFrame({ t: "ack", conv: CONV, clientMsgId: id, seq: 7, serverTime: 1, used: 1 });
    expect(mine()).toMatchObject({ status: "sent", seq: 7 });
    expect(sent).toHaveLength(1);
  });

  it("an answer stops the wait", async () => {
    setup();
    await sendText(CONV, "hello");
    await onFrame({ t: "ack", conv: CONV, clientMsgId: mine()!.id, seq: 1, serverTime: 1, used: 1 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mine()!.status).toBe("sent");
  });

  it("can be sent again by the person with the same id, and only while it is failed", async () => {
    const { sent } = setup();
    await sendText(CONV, "hello");
    const id = mine()!.id;
    await resendMessage(CONV, id); // still sending: nothing happens
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(15_100);
    expect(mine()!.status).toBe("failed");
    await resendMessage(CONV, id);
    expect(mine()!.status).toBe("sending");
    expect(sent.map((f) => f.clientMsgId)).toEqual([id, id]);
    await onFrame({ t: "ack", conv: CONV, clientMsgId: id, seq: 3, serverTime: 1, used: 1 });
    expect(mine()).toMatchObject({ status: "sent", seq: 3 });
    await resendMessage(CONV, id); // already sent: nothing happens
    expect(sent).toHaveLength(2);
  });

  it("a message that failed for good can be sent again with a fresh busy retry", async () => {
    const { sent } = setup();
    await sendText(CONV, "hello");
    const id = mine()!.id;
    await onFrame({ t: "error", code: "busy", clientMsgId: id });
    await vi.advanceTimersByTimeAsync(3_100);
    await settle(() => sent.length >= 2);
    await onFrame({ t: "error", code: "busy", clientMsgId: id });
    expect(mine()!.status).toBe("failed");
    await resendMessage(CONV, id);
    await onFrame({ t: "error", code: "busy", clientMsgId: id });
    await vi.advanceTimersByTimeAsync(3_100);
    await settle(() => sent.length >= 4);
    expect(sent).toHaveLength(4); // first try, the automatic one, the person's, the automatic one after that
  });
});

describe("a message sent over HTTPS (no socket)", () => {
  it("is sent once more after a 503 busy, then fails and can be sent again", async () => {
    let calls = 0;
    const { api } = setup((path) => {
      if (path === "/messages") {
        calls++;
        throw new ApiError(503, "busy");
      }
      return {};
    });
    s.ws = null;
    const sending = sendText(CONV, "hello");
    await settle(() => calls >= 1); // sealed and tried once; now it waits before the second try
    await vi.advanceTimersByTimeAsync(3_100);
    await sending;
    expect(calls).toBe(2);
    expect(mine()!.status).toBe("failed");
    expect((api.post as ReturnType<typeof vi.fn>).mock.calls.filter(([p]) => p === "/messages").map(([, b]) => (b as { clientMsgId: string }).clientMsgId)).toEqual([mine()!.id, mine()!.id]);
    const again = resendMessage(CONV, mine()!.id);
    await settle(() => calls >= 3);
    await vi.advanceTimersByTimeAsync(3_100);
    await again;
    expect(calls).toBe(4);
  });
});
