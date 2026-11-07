import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Api } from "../net/api";
import { CACHE_MAX, configure, deleteMessages, favoritesAmong, isLooking, loadHistory, loadOlder, lock, markRead, openConversation, resumeView } from "../client";
import { DELETE_MAX, DELETE_MAX_VOICE, canDelete, planDeleteBatches } from "../selection";
import { initialState, useChat, type Msg } from "../store";

const ME = "me";
const CONV = "c1";

const live = (seq: number, over: Partial<Msg> = {}): Msg => ({
  id: `m${seq}`,
  seq,
  senderId: ME,
  role: "user",
  time: 1000 + seq,
  mine: true,
  payload: { k: "text", text: `text ${seq}`, sentAt: 1000 + seq },
  status: "sent",
  ...over,
});
const voice = (seq: number, id: string): Msg => live(seq, { payload: { k: "voice", voice: { id, ms: 1000 }, sentAt: 1 } });
const wireLive = (seq: number, senderId = ME) => ({ seq, conv: CONV, senderId, serverTime: 1000 + seq, role: "user", ct: "", clientMsgId: `m${seq}`, epoch: 0, gen: 0 });
const wireDeleted = (seq: number, senderId = ME) => ({ seq, conv: CONV, senderId, serverTime: 1000 + seq, role: "user", deleted: true, ct: "", clientMsgId: "", epoch: 0, gen: 0 });

type Handler = (path: string, body?: unknown) => unknown;
function fakeApi(get: Handler, post: Handler = () => ({})): { api: Api; get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> } {
  const g = vi.fn(async (path: string) => get(path));
  const p = vi.fn(async (path: string, body?: unknown) => post(path, body));
  const api = { token: "t", base: "http://x", get: g, post: p, put: vi.fn(), del: vi.fn(), request: vi.fn(), onUnauthorized: null } as unknown as Api;
  configure(api, null, { notifyTitle: () => "", lockNotice: () => "" });
  return { api, get: g, post: p };
}

beforeEach(() => {
  lock(null);
  useChat.setState({ ...initialState, phase: "ready", me: { userId: ME, handle: "me", role: "user", publicKey: "" }, activeConv: CONV });
});

describe("what can be selected and how a selection is split", () => {
  it("only my own, accepted, not-yet-deleted messages", () => {
    expect(canDelete(live(3))).toBe(true);
    expect(canDelete(live(3, { mine: false }))).toBe(false);
    expect(canDelete(live(0, { status: "sending" }))).toBe(false);
    expect(canDelete(live(3, { status: "failed" }))).toBe(false);
    expect(canDelete(live(3, { deleted: true }))).toBe(false);
  });

  it("keeps every request within 50 messages and 20 recordings", () => {
    const msgs = Array.from({ length: 120 }, (_, i) => (i % 2 === 0 ? voice(i + 1, `v${i}`) : live(i + 1)));
    const batches = planDeleteBatches(msgs);
    expect(batches.flatMap((b) => b.seqs)).toEqual(msgs.map((m) => m.seq));
    for (const b of batches) {
      expect(b.seqs.length).toBeLessThanOrEqual(DELETE_MAX);
      expect(b.voiceIds.length).toBeLessThanOrEqual(DELETE_MAX_VOICE);
    }
    expect(batches.flatMap((b) => b.voiceIds)).toHaveLength(60);
  });
});

describe("reading the newest page replaces the cache", () => {
  it("drops older pages and deleted messages, shows the marker, keeps what is still being sent, and counts nothing as unread", async () => {
    const pending = live(0, { id: "p1", status: "sending" });
    useChat.setState({ messages: { [CONV]: [live(1), live(2), live(3), pending] }, unread: { [CONV]: 0 } });
    fakeApi(() => ({ messages: [wireDeleted(3), wireLive(4, "peer")], lastSeq: 4, hasMore: true }));
    await loadHistory(CONV);
    const list = useChat.getState().messages[CONV];
    expect(list.map((m) => m.seq)).toEqual([3, 4, 0].sort((a, b) => (a || Infinity) - (b || Infinity)));
    expect(list.find((m) => m.seq === 3)).toMatchObject({ deleted: true, payload: null });
    expect(list.find((m) => m.seq === 0)?.id).toBe("p1");
    expect(useChat.getState().olderMore[CONV]).toBe(true);
    expect(useChat.getState().unread[CONV] ?? 0).toBe(0);
  });

  it("asks for the newest 50", async () => {
    const { get } = fakeApi(() => ({ messages: [], lastSeq: 0, hasMore: false }));
    await loadHistory(CONV);
    expect(get).toHaveBeenCalledWith(`/messages?conv=${CONV}&limit=${CACHE_MAX}`);
  });

  it("several deleted messages stay apart (their client ids are empty)", async () => {
    fakeApi(() => ({ messages: [wireDeleted(1), wireDeleted(2), wireDeleted(3)], lastSeq: 3, hasMore: false }));
    await loadHistory(CONV);
    expect(useChat.getState().messages[CONV].map((m) => m.seq)).toEqual([1, 2, 3]);
  });

  it("a slow answer from before a deletion cannot bring the message back", async () => {
    useChat.setState({ messages: { [CONV]: [live(5)] } });
    let release: (v: unknown) => void = () => {};
    const gate = new Promise((r) => (release = r));
    const api = fakeApi(
      (path) => (path.startsWith("/messages?") ? gate : {}),
      () => ({ deleted: [5], voiceDeleted: [] }),
    );
    const loading = loadHistory(CONV);
    await deleteMessages(CONV, [5]);
    expect(api.post).toHaveBeenCalledWith("/messages/delete", { conv: CONV, seqs: [5] });
    release({ messages: [wireLive(5)], lastSeq: 5, hasMore: false });
    await loading;
    expect(useChat.getState().messages[CONV]).toMatchObject([{ seq: 5, deleted: true, payload: null }]);
  });

  it("an older page that was requested before a newer reload is thrown away", async () => {
    useChat.setState({ messages: { [CONV]: [live(30)] } });
    let release: (v: unknown) => void = () => {};
    const gate = new Promise((r) => (release = r));
    let n = 0;
    fakeApi(() => (n++ === 0 ? gate : { messages: [wireLive(30)], lastSeq: 30, hasMore: false }));
    const older = loadOlder(CONV);
    await loadHistory(CONV);
    release({ messages: [wireLive(29)], lastSeq: 30, hasMore: false });
    await older;
    expect(useChat.getState().messages[CONV].map((m) => m.seq)).toEqual([30]);
  });

  it("a page that is not the first overwrites the cache for its stretch", async () => {
    useChat.setState({ messages: { [CONV]: [live(10)] } });
    fakeApi(() => ({ messages: [wireDeleted(8), wireLive(9)], lastSeq: 10, hasMore: false }));
    await loadOlder(CONV);
    const list = useChat.getState().messages[CONV];
    expect(list.map((m) => [m.seq, !!m.deleted])).toEqual([
      [8, true],
      [9, false],
      [10, false],
    ]);
  });
});

describe("leaving a chat", () => {
  it("keeps only the newest 50 and offers earlier ones again", async () => {
    useChat.setState({ activeConv: CONV, messages: { [CONV]: Array.from({ length: 60 }, (_, i) => live(i + 1)) }, olderMore: { [CONV]: false } });
    fakeApi(() => ({ messages: [], lastSeq: 0, hasMore: false }));
    await openConversation("c2");
    const list = useChat.getState().messages[CONV];
    expect(list).toHaveLength(CACHE_MAX);
    expect(list[0].seq).toBe(11);
    expect(useChat.getState().olderMore[CONV]).toBe(true);
  });
});

describe("deleting", () => {
  it("sends only my own sent messages, with the recordings' ids, and follows what the server returns", async () => {
    useChat.setState({ messages: { [CONV]: [live(1), voice(2, "v2"), live(3, { mine: false, senderId: "peer" }), live(0, { id: "p", status: "sending" })] } });
    const api = fakeApi(
      () => ({}),
      () => ({ deleted: [2], voiceDeleted: ["v2"] }),
    );
    const out = await deleteMessages(CONV, [1, 2, 3, 0]);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/messages/delete", { conv: CONV, seqs: [1, 2], voiceIds: ["v2"] });
    expect(out).toEqual({ deleted: [2], error: null });
    const byseq = Object.fromEntries(useChat.getState().messages[CONV].map((m) => [m.seq, m]));
    expect(byseq[2]).toMatchObject({ deleted: true, payload: null });
    expect(byseq[1].deleted).toBeUndefined(); // the server skipped it: the screen does not claim otherwise
    expect(byseq[3].payload).not.toBeNull();
  });

  it("splits a big selection into several requests and stops at the first failure", async () => {
    useChat.setState({ messages: { [CONV]: Array.from({ length: 70 }, (_, i) => live(i + 1)) } });
    let calls = 0;
    fakeApi(
      () => ({}),
      (_p, body) => {
        if (++calls === 2) throw Object.assign(new Error("x"), {});
        return { deleted: (body as { seqs: number[] }).seqs, voiceDeleted: [] };
      },
    );
    const out = await deleteMessages(CONV, Array.from({ length: 70 }, (_, i) => i + 1));
    expect(out.deleted).toHaveLength(50);
    expect(out.error).not.toBeNull();
  });

  it("removes the favourites made from the deleted messages with one request", async () => {
    const fav = (id: string, gen = 1) => ({ id, conv: CONV, from: "me", text: "t", time: 1, savedAt: 1, gen });
    useChat.setState({ messages: { [CONV]: [live(1), live(2), live(3)] }, favorites: [fav(`${CONV}.m1`), fav(`${CONV}.m2`), fav(`${CONV}.m9`)] });
    expect(favoritesAmong(CONV, [live(1), live(2), live(3)])).toBe(2);
    const api = fakeApi(
      () => ({}),
      (p) => (p === "/messages/delete" ? { deleted: [1, 2], voiceDeleted: [] } : p === "/usage" ? {} : { deleted: [], seq: 1 }),
    );
    await deleteMessages(CONV, [1, 2]);
    await vi.waitFor(() => expect(api.post).toHaveBeenCalledWith("/favorites/delete", { ids: [`fav:1:${CONV}.m1`, `fav:1:${CONV}.m2`] }));
    expect(useChat.getState().favorites.map((f) => f.id)).toEqual([`${CONV}.m9`]);
    expect(api.post.mock.calls.filter(([p]) => p === "/favorites/delete")).toHaveLength(1);
  });
});

describe("signing out", () => {
  it("empties every cache", () => {
    useChat.setState({ messages: { [CONV]: [live(1)] } });
    lock(null);
    expect(useChat.getState().messages).toEqual({});
  });
});

describe("read receipts only while someone is looking", () => {
  const sent = (post: ReturnType<typeof vi.fn>) => post.mock.calls.filter(([p]) => p === "/conversations/read");
  const state = (hidden: boolean, focus: boolean) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    vi.spyOn(document, "hasFocus").mockReturnValue(focus);
  };
  afterEach(() => {
    delete (document as unknown as Record<string, unknown>).hidden;
    vi.restoreAllMocks();
    document.documentElement.removeAttribute("data-covered");
  });

  it.each([
    ["the page is hidden", true, true, false],
    ["the window has lost focus", false, false, false],
    ["the privacy cover is up", false, true, true],
    ["someone is looking", false, true, false],
  ])("%s", async (_name, hidden, focus, covered) => {
    useChat.setState({ section: "contacts", activeConv: CONV, messages: { [CONV]: [live(4, { mine: false, senderId: "peer" })] }, unread: {} });
    const api = fakeApi(() => ({}));
    state(hidden, focus);
    if (covered) document.documentElement.setAttribute("data-covered", "");
    markRead(CONV);
    const looking = !hidden && focus && !covered;
    expect(sent(api.post).length).toBe(looking ? 1 : 0);
    expect(isLooking(CONV)).toBe(looking);
  });

  it("a message that arrives while the window is blurred stays unread, and is read once focus returns", async () => {
    useChat.setState({ section: "contacts", activeConv: CONV, messages: { [CONV]: [live(4, { mine: false, senderId: "peer" })] }, unread: { [CONV]: 1 } });
    const api = fakeApi(() => ({}));
    state(false, false);
    resumeView();
    expect(useChat.getState().unread[CONV]).toBe(1);
    expect(sent(api.post)).toHaveLength(0);
    state(false, true);
    resumeView();
    expect(useChat.getState().unread[CONV]).toBe(0);
  });
});
