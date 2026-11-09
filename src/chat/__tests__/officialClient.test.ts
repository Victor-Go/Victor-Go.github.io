import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Api, ApiError } from "../net/api";
import { configure, deleteMessages, loadHistory, loadOlder, lock, markRead, onFrame, openConversation, refreshMe, requestContact, requestViaCard, sendText } from "../client";
import { initialState, useChat, type Msg } from "../store";

const solve = vi.hoisted(() => vi.fn(async () => [1, 2, 3]));
vi.mock("../workers/client", async (orig) => ({ ...(await orig<typeof import("../workers/client")>()), solveInWorkers: solve }));

const ME = "me";
const OFFICIAL = "official:me";

const wire = (seq: number, kind: string, data: Record<string, unknown>) => ({
  seq,
  conv: OFFICIAL,
  senderId: "official",
  role: "system",
  ct: "",
  epoch: 0,
  gen: 0,
  clientMsgId: "",
  serverTime: 5000 + seq,
  kind,
  data,
});
const cardData = { cardId: "card1", subjectId: "u2", subjectHandle: "bob", expiresAt: 9e12, state: "active" };

type Handler = (path: string, body?: unknown) => unknown;
function fakeApi(get: Handler = () => ({}), post: Handler = () => ({})) {
  const g = vi.fn(async (path: string) => get(path));
  const p = vi.fn(async (path: string, body?: unknown) => post(path, body));
  const api = { token: "t", base: "http://x", get: g, post: p, put: vi.fn(), del: vi.fn(), request: vi.fn(), onUnauthorized: null } as unknown as Api;
  configure(api, null, { notifyTitle: () => "", lockNotice: () => "" });
  return { get: g, post: p };
}

beforeEach(() => {
  lock(null);
  solve.mockClear();
  useChat.setState({ ...initialState, sound: false, phase: "ready", me: { userId: ME, handle: "me", role: "user", publicKey: "" }, official: OFFICIAL });
});
afterEach(() => vi.restoreAllMocks());

describe("the official conversation", () => {
  it("loads like any conversation, never decrypts, and gives its messages stable ids of their own", async () => {
    const { get } = fakeApi((path) => {
      if (path.startsWith("/messages?conv=official%3Ame")) {
        return { messages: [wire(1, "card", cardData), wire(2, "contact_removed", { userId: "u3", handle: "cy", reason: "removed" })], lastSeq: 2, hasMore: true };
      }
      return {};
    });
    await loadHistory(OFFICIAL);
    expect(get).toHaveBeenCalledWith(`/messages?conv=${encodeURIComponent(OFFICIAL)}&limit=50`);
    const list = useChat.getState().messages[OFFICIAL];
    expect(list.map((m) => m.id)).toEqual(["official:1", "official:2"]);
    expect(list.every((m) => m.payload === null && m.lost === undefined && !m.mine)).toBe(true);
    expect(list[0]).toMatchObject({ kind: "card", data: cardData, senderId: "official", role: "system" });
    expect(useChat.getState().olderMore[OFFICIAL]).toBe(true);
  });

  it("pages back with beforeSeq", async () => {
    useChat.setState({ messages: { [OFFICIAL]: [{ id: "official:5", seq: 5, senderId: "official", role: "system", time: 1, mine: false, payload: null, kind: "card", data: cardData, status: "sent" }] } });
    const { get } = fakeApi(() => ({ messages: [wire(3, "contact_removed", { userId: "u3", handle: "cy", reason: "removed" })], lastSeq: 5, hasMore: false }));
    await loadOlder(OFFICIAL);
    expect(get).toHaveBeenCalledWith(`/messages?conv=${encodeURIComponent(OFFICIAL)}&beforeSeq=5&limit=20`);
    expect(useChat.getState().messages[OFFICIAL].map((m) => m.seq)).toEqual([3, 5]);
    expect(useChat.getState().olderMore[OFFICIAL]).toBe(false);
  });

  it("a pushed official message is shown without keys, counts as unread, and makes the conversation known", async () => {
    useChat.setState({ official: null });
    fakeApi();
    await onFrame({ t: "message", ...wire(1, "card", cardData) });
    const st = useChat.getState();
    expect(st.official).toBe(OFFICIAL);
    expect(st.messages[OFFICIAL]).toHaveLength(1);
    expect(st.messages[OFFICIAL][0].payload).toBeNull();
    expect(st.unread[OFFICIAL]).toBe(1);
  });

  it("an `updated` frame replaces the cached message (a card was used or revoked)", async () => {
    fakeApi();
    await onFrame({ t: "message", ...wire(1, "card", cardData) });
    await onFrame({ t: "updated", conv: OFFICIAL, seq: 1, kind: "card", data: { ...cardData, state: "revoked", reason: "revoked_by_admin" } });
    expect(useChat.getState().messages[OFFICIAL][0].data).toMatchObject({ state: "revoked", reason: "revoked_by_admin" });
    // one that is not cached is ignored, a malformed one too
    await onFrame({ t: "updated", conv: OFFICIAL, seq: 99, kind: "card", data: cardData });
    await onFrame({ t: "updated", conv: OFFICIAL, seq: 1, kind: "card", data: "nope" });
    expect(useChat.getState().messages[OFFICIAL]).toHaveLength(1);
    expect(useChat.getState().messages[OFFICIAL][0].data).toMatchObject({ state: "revoked" });
  });

  it("its messages can be deleted, and the deleted push turns them into markers", async () => {
    const { post } = fakeApi(
      () => ({}),
      (path, body) => (path === "/messages/delete" ? { deleted: (body as { seqs: number[] }).seqs, fileDeleted: [] } : {}),
    );
    await onFrame({ t: "message", ...wire(1, "card", cardData) });
    await onFrame({ t: "message", ...wire(2, "contact_removed", { userId: "u3", handle: "cy", reason: "removed" }) });
    const r = await deleteMessages(OFFICIAL, [1, 2]);
    expect(post).toHaveBeenCalledWith("/messages/delete", { conv: OFFICIAL, seqs: [1, 2] });
    expect(r.deleted).toEqual([1, 2]);
    expect(useChat.getState().messages[OFFICIAL].every((m) => m.deleted)).toBe(true);
  });

  it("read marks go out as usual", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const { post } = fakeApi();
    useChat.setState({ section: "contacts", activeConv: OFFICIAL });
    await onFrame({ t: "message", ...wire(4, "card", cardData) });
    markRead(OFFICIAL);
    expect(post).toHaveBeenCalledWith("/conversations/read", { conv: OFFICIAL, upTo: 4 });
  });

  it("opening it loads it and nothing can be sent into it", async () => {
    const { get, post } = fakeApi(() => ({ messages: [], lastSeq: 0, hasMore: false }));
    await openConversation(OFFICIAL);
    expect(get).toHaveBeenCalledWith(expect.stringContaining("/messages?conv="));
    await sendText(OFFICIAL, "hello");
    expect(post).not.toHaveBeenCalledWith("/messages", expect.anything());
  });
});

describe("a contact card", () => {
  const msg = (): Msg => ({ id: "official:1", seq: 1, senderId: "official", role: "system", time: 1, mine: false, payload: null, kind: "card", data: cardData, status: "sent" });

  it("asks for the subject's current handle, does the work for it, and sends the request with the card", async () => {
    useChat.setState({ messages: { [OFFICIAL]: [msg()] } });
    const progress = vi.fn();
    const { get, post } = fakeApi(
      (path) => (path === "/users/u2" ? { userId: "u2", handle: "Bobby", publicKey: "k" } : path === "/contacts" ? { contacts: [] } : { requests: [] }),
      (path) => (path === "/pow/challenge" ? { id: "ch1", salt: "s", parts: 1, bits: 1, memKiB: 8, iterations: 1, expiresAt: 0, multiplier: 1 } : {}),
    );
    await requestViaCard(msg(), progress);
    expect(get).toHaveBeenCalledWith("/users/u2");
    expect(post).toHaveBeenCalledWith("/pow/challenge", { action: "contact", subject: "bobby" });
    expect(post).toHaveBeenCalledWith("/contacts/request", { toHandle: "Bobby", pow: { id: "ch1", nonces: [1, 2, 3] }, cardId: "card1" });
    // shown as used at once; the server's `updated` frame confirms it later
    expect(useChat.getState().messages[OFFICIAL][0].data).toMatchObject({ state: "used" });
  });

  it("stops when the subject's account is gone", async () => {
    fakeApi((path) => (path === "/users/u2" ? { deleted: true, reason: "self_deleted" } : {}));
    await expect(requestViaCard(msg(), vi.fn())).rejects.toMatchObject({ status: 404, code: "not_found" });
    expect(solve).not.toHaveBeenCalled();
  });

  it("passes on the server's card refusal and leaves the card as it was", async () => {
    useChat.setState({ messages: { [OFFICIAL]: [msg()] } });
    fakeApi(
      (path) => (path === "/users/u2" ? { userId: "u2", handle: "Bobby" } : {}),
      (path) => {
        if (path === "/pow/challenge") return { id: "ch1", salt: "s", parts: 1, bits: 1, memKiB: 8, iterations: 1, expiresAt: 0, multiplier: 1 };
        throw new ApiError(410, "gone", { reason: "expired" });
      },
    );
    await expect(requestViaCard(msg(), vi.fn())).rejects.toMatchObject({ status: 410, code: "gone", extra: { reason: "expired" } });
    expect(useChat.getState().messages[OFFICIAL][0].data).toMatchObject({ state: "active" });
  });

  it("only a card message with a server sequence can be used", async () => {
    fakeApi();
    await expect(requestViaCard({ ...msg(), kind: "contact_removed" }, vi.fn())).rejects.toMatchObject({ code: "bad_request" });
    await expect(requestViaCard({ ...msg(), seq: 0 }, vi.fn())).rejects.toMatchObject({ code: "bad_request" });
  });
});

/** The configuration object the server sends in the sign-in answer, in GET /me and in the "account" notice. */
const config = (over: Record<string, unknown> = {}) => ({
  canAddContacts: true,
  contactsBlocked: false,
  globalContactsBlocked: false,
  files: { enabled: true, monthlyMB: 100 },
  limits: { messageMaxChars: 1024, voiceMaxSec: 60, groupMax: 32, retentionDays: 30, favoriteMax: 10, monthlyMessages: 30000 },
  ...over,
});
const meAnswer = (over: Record<string, unknown> = {}) => ({ userId: ME, handle: "me", role: "user", config: config(over) });

describe("who may add contacts", () => {
  it("is read from GET /me", async () => {
    fakeApi(() => meAnswer({ contactsBlocked: true, canAddContacts: false }));
    await refreshMe();
    expect(useChat.getState().account).toEqual({ contactsBlocked: true, globalContactsBlocked: false, canAddContacts: false });
  });

  it("is read again when the server sends an account notice", async () => {
    const { get } = fakeApi(() => meAnswer({ globalContactsBlocked: true, canAddContacts: false }));
    await onFrame({ t: "notice", kind: "account" });
    expect(get).toHaveBeenCalledWith("/me");
    expect(useChat.getState().account.globalContactsBlocked).toBe(true);
    expect(useChat.getState().account.canAddContacts).toBe(false);
  });

  it("is read again after a refusal that names a switch, and the refusal reaches the caller", async () => {
    const { get } = fakeApi(
      () => meAnswer({ contactsBlocked: true, canAddContacts: false }),
      (path) => {
        if (path === "/pow/challenge") return { id: "ch1", salt: "s", parts: 1, bits: 1, memKiB: 8, iterations: 1, expiresAt: 0, multiplier: 1 };
        throw new ApiError(403, "forbidden", { reason: "self_blocked" });
      },
    );
    await expect(requestContact("bob", vi.fn())).rejects.toMatchObject({ extra: { reason: "self_blocked" } });
    await vi.waitFor(() => expect(get).toHaveBeenCalledWith("/me"));
    await vi.waitFor(() => expect(useChat.getState().account.canAddContacts).toBe(false));
  });

  it("a refusal for another reason does not touch the account flags", async () => {
    const { get } = fakeApi(
      () => ({}),
      (path) => {
        if (path === "/pow/challenge") return { id: "ch1", salt: "s", parts: 1, bits: 1, memKiB: 8, iterations: 1, expiresAt: 0, multiplier: 1 };
        throw new ApiError(409, "conflict", { reason: "already_contacts" });
      },
    );
    await expect(requestContact("bob", vi.fn())).rejects.toBeInstanceOf(ApiError);
    expect(get).not.toHaveBeenCalledWith("/me");
  });
});

describe("a declined contact request", () => {
  const declined = (seq: number) => wire(seq, "contact_declined", { userId: "u2", handle: "bob" });
  const pending = { id: "r1", direction: "out" as const, status: "pending", user: { userId: "u2", handle: "bob" }, createdAt: 1 };
  /** The server no longer has the request: both lists are empty. */
  const gone = (path: string) => (path === "/contacts" ? { contacts: [] } : path === "/contacts/requests" ? { requests: [] } : { messages: [declined(1)], lastSeq: 1, hasMore: false });

  it("when the message is pushed, the requests are read again and the waiting one goes away", async () => {
    useChat.setState({ requests: [pending] });
    const { get } = fakeApi(gone);
    await onFrame({ t: "message", ...declined(1) });
    expect(get).toHaveBeenCalledWith("/contacts/requests");
    expect(useChat.getState().requests).toEqual([]);
    expect(useChat.getState().messages[OFFICIAL][0]).toMatchObject({ kind: "contact_declined", payload: null });
  });

  it("when the official conversation is loaded (a decline that was missed), the same happens", async () => {
    useChat.setState({ requests: [pending] });
    const { get } = fakeApi(gone);
    await loadHistory(OFFICIAL);
    await vi.waitFor(() => expect(useChat.getState().requests).toEqual([]));
    expect(get).toHaveBeenCalledWith("/contacts/requests");
  });

  it("a conversation without such a message does not read the requests", async () => {
    const { get } = fakeApi(() => ({ messages: [wire(1, "card", cardData)], lastSeq: 1, hasMore: false }));
    await loadHistory(OFFICIAL);
    expect(get).not.toHaveBeenCalledWith("/contacts/requests");
  });

  it("a request the server no longer has goes away on any refresh, a pending one it still has stays", async () => {
    useChat.setState({ requests: [pending] });
    fakeApi((path) =>
      path === "/contacts"
        ? { contacts: [] }
        : { requests: [{ id: "r2", status: "pending", createdAt: 2, from: { userId: ME, handle: "me", publicKey: "" }, to: { userId: "u3", handle: "cy", publicKey: "" }, kx: null }] },
    );
    const { refreshContacts } = await import("../client");
    await refreshContacts();
    expect(useChat.getState().requests.map((r) => r.id)).toEqual(["r2"]);
  });
});

describe("an open official conversation stays read", () => {
  beforeEach(() => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    useChat.setState({ section: "contacts", activeConv: OFFICIAL });
  });
  const reads = (post: ReturnType<typeof vi.fn>) => post.mock.calls.filter(([p]) => p === "/conversations/read").map(([, b]) => b);

  it("marks what is already there as read, over HTTPS, and the count drops to zero", async () => {
    useChat.setState({ unread: { [OFFICIAL]: 2 } });
    const { post } = fakeApi(() => ({ messages: [wire(1, "card", cardData), wire(2, "card", cardData)], lastSeq: 2, hasMore: false }));
    await openConversation(OFFICIAL);
    expect(reads(post)).toEqual([{ conv: OFFICIAL, upTo: 2 }]);
    expect(useChat.getState().unread[OFFICIAL]).toBe(0);
  });

  it("marks a message that arrives while it is open, and an `updated` frame sends the position again", async () => {
    const { post } = fakeApi();
    await onFrame({ t: "message", ...wire(3, "card", cardData) });
    expect(reads(post)).toEqual([{ conv: OFFICIAL, upTo: 3 }]);
    expect(useChat.getState().unread[OFFICIAL] ?? 0).toBe(0);
    await onFrame({ t: "updated", conv: OFFICIAL, seq: 3, kind: "card", data: { ...cardData, state: "used" } });
    expect(reads(post)).toHaveLength(2);
  });

  it("a read mark that fails is tried again the next time", async () => {
    let fail = true;
    const { post } = fakeApi(
      () => ({}),
      (path) => {
        if (path === "/conversations/read" && fail) throw new ApiError(0, "network");
        return {};
      },
    );
    await onFrame({ t: "message", ...wire(1, "card", cardData) });
    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    fail = false;
    markRead(OFFICIAL);
    await vi.waitFor(() => expect(reads(post)).toHaveLength(2));
  });

  it("a server count computed before the read was sent does not bring the badge back", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const { get } = fakeApi((path) => (path === "/conversations" ? gate.then(() => ({ conversations: [{ conv: OFFICIAL, kind: "official", unread: 1 }] })) : {}));
    get.mockImplementation(async (path: string) => (path === "/conversations" ? gate.then(() => ({ conversations: [{ conv: OFFICIAL, kind: "official", unread: 1 }] })) : {}));
    // the list is being read (as after a deletion) ...
    const pending = onFrame({ t: "deleted", conv: OFFICIAL, seqs: [9] });
    // ... and meanwhile the chat is looked at and read
    useChat.setState({ activeConv: null });
    await onFrame({ t: "message", ...wire(1, "card", cardData) });
    expect(useChat.getState().unread[OFFICIAL]).toBe(1);
    useChat.setState({ activeConv: OFFICIAL });
    markRead(OFFICIAL);
    expect(useChat.getState().unread[OFFICIAL]).toBe(0);
    release();
    await pending;
    expect(useChat.getState().unread[OFFICIAL]).toBe(0);
  });
});

describe("the microphone and picture buttons", () => {
  it("are hidden while GET /me says files are off, and come back when they are switched on", async () => {
    let enabled = false;
    fakeApi(() => meAnswer({ files: { enabled, monthlyMB: 100 } }));
    await refreshMe();
    expect(useChat.getState().filesOff).toBe(true);
    enabled = true;
    await refreshMe();
    expect(useChat.getState().filesOff).toBe(false);
  });

  it("stay when the answer does not say", async () => {
    fakeApi(() => ({ userId: ME, handle: "me", role: "user", config: { canAddContacts: true } }));
    await refreshMe();
    expect(useChat.getState().filesOff).toBe(false);
  });
});

describe("the configuration the server pushes", () => {
  it("is applied from the account notice itself, without asking again", async () => {
    const { get } = fakeApi();
    await onFrame({ t: "notice", kind: "account", config: config({ canAddContacts: false, files: { enabled: false, monthlyMB: 100 } }) });
    expect(get).not.toHaveBeenCalled();
    expect(useChat.getState().account.canAddContacts).toBe(false);
    expect(useChat.getState().filesOff).toBe(true);
  });

  it("sets the limits the app works with, and a group limit above what this app supports is held at 32", async () => {
    fakeApi(() => meAnswer({ limits: { messageMaxChars: 500, voiceMaxSec: 30, groupMax: 64, retentionDays: 7, favoriteMax: 10, monthlyMessages: null } }));
    await refreshMe();
    expect(useChat.getState()).toMatchObject({ messageMaxChars: 500, voiceMaxSec: 30, groupMax: 32, retentionDays: 7 });
  });

  it("keeps a limit the answer leaves out", async () => {
    useChat.setState({ retentionDays: 9, voiceMaxSec: 20 });
    fakeApi(() => ({ userId: ME, handle: "me", role: "user", config: { canAddContacts: true, limits: { groupMax: 10 } } }));
    await refreshMe();
    expect(useChat.getState()).toMatchObject({ retentionDays: 9, voiceMaxSec: 20, groupMax: 10 });
  });
});
