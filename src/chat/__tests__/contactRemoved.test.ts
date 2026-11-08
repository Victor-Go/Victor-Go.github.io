import { beforeEach, describe, expect, it, vi } from "vitest";
import { Api } from "../net/api";
import { configure, lock, onFrame, removeContact } from "../client";
import { initialState, useChat, type Favorite, type Msg } from "../store";

const ME = "me";
const CONV = "c1";
const OTHER = "c2";
const OFFICIAL = "official:me";

const msg = (seq: number, over: Partial<Msg> = {}): Msg => ({
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
const fav = (id: string, conv: string): Favorite => ({ id, conv, from: "peer", text: "kept", time: 1, savedAt: 2, gen: 1 });

/** The `message` frame of an official message (protocol 2): plain, no ciphertext, with a kind and its data. */
const official = (seq: number, kind: string, data: Record<string, unknown>) => ({
  t: "message",
  conv: OFFICIAL,
  seq,
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

function fakeApi(): { post: ReturnType<typeof vi.fn>; del: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> } {
  const get = vi.fn(async (path: string) => (path === "/contacts" ? { contacts: [] } : { requests: [] }));
  const post = vi.fn(async () => ({}));
  const del = vi.fn(async () => ({}));
  const api = { token: "t", base: "http://x", get, post, put: vi.fn(), del, request: vi.fn(), onUnauthorized: null } as unknown as Api;
  configure(api, null, { notifyTitle: () => "", lockNotice: () => "" });
  return { post, del, get };
}

beforeEach(() => {
  lock(null);
  useChat.setState({
    ...initialState,
    phase: "ready",
    me: { userId: ME, handle: "me", role: "user", publicKey: "" },
    contacts: [{ userId: "peer", handle: "Peer", role: "user", convId: CONV, key: null }],
    activeConv: CONV,
    official: OFFICIAL,
    messages: { [CONV]: [msg(1), msg(0, { id: "p", status: "sending" })], [OTHER]: [msg(1)] },
    favorites: [fav("c1.m1", CONV), fav("c2.m1", OTHER)],
    unread: { [CONV]: 3 },
  });
});

describe("a contact is removed", () => {
  it("by the other person (a contact_removed official message): the chat and the favourites made from it are gone here, the rest stays, and there is no toast (the official message says it)", async () => {
    const { get } = fakeApi();
    await onFrame(official(1, "contact_removed", { userId: "peer", handle: "Peer", reason: "removed" }));
    const st = useChat.getState();
    expect(st.messages[CONV]).toBeUndefined(); // even the message still being sent
    expect(st.messages[OTHER]).toHaveLength(1);
    expect(st.favorites.map((f) => f.id)).toEqual(["c2.m1"]);
    expect(st.contacts).toEqual([]);
    expect(st.activeConv).toBeNull();
    expect(get).toHaveBeenCalledWith("/contacts"); // the list is read again
    // the official message itself is kept, as a message of the official conversation
    expect(st.messages[OFFICIAL]).toHaveLength(1);
  });

  it.each(["self_deleted", "admin_deleted"])("because their account was deleted (%s): the same cleanup, same as for a removal", async (reason) => {
    fakeApi();
    await onFrame(official(1, "contact_removed", { userId: "peer", handle: "Peer", reason }));
    const st = useChat.getState();
    expect(st.messages[CONV]).toBeUndefined();
    expect(st.favorites.map((f) => f.id)).toEqual(["c2.m1"]);
  });

  it("the old contact_deleted notice is no longer acted on", async () => {
    fakeApi();
    await onFrame({ t: "notice", kind: "contact_deleted", userId: "peer" });
    expect(useChat.getState().messages[CONV]).toHaveLength(2);
  });

  it("by this person: the server is asked, then the same things are gone, with no toast", async () => {
    const { post } = fakeApi();
    await removeContact("peer");
    expect(post).toHaveBeenCalledWith("/contacts/remove", { userId: "peer" });
    const st = useChat.getState();
    expect(st.messages[CONV]).toBeUndefined();
    expect(st.favorites.map((f) => f.id)).toEqual(["c2.m1"]);
  });

  it("a message about someone who is not a contact changes nothing and shows nothing", async () => {
    fakeApi();
    await onFrame(official(1, "contact_removed", { userId: "stranger", handle: "Stranger", reason: "removed" }));
    const st = useChat.getState();
    expect(st.messages[CONV]).toHaveLength(2);
    expect(st.favorites).toHaveLength(2);
  });

  it("is acted on once: the same message arriving again does nothing more", async () => {
    fakeApi();
    await onFrame(official(1, "contact_removed", { userId: "peer", handle: "Peer", reason: "removed" }));
    useChat.setState({ contacts: [{ userId: "peer", handle: "Peer", role: "user", convId: CONV, key: null }] });
    await onFrame(official(1, "contact_removed", { userId: "peer", handle: "Peer", reason: "removed" }));
    expect(useChat.getState().contacts).toHaveLength(1);
  });
});
