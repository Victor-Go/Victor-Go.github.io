import { beforeEach, describe, expect, it, vi } from "vitest";
import { Api } from "../net/api";
import { configure, lock, onFrame, removeContact } from "../client";
import { initialState, useChat, type Favorite, type Msg } from "../store";

const ME = "me";
const CONV = "c1";
const OTHER = "c2";

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

function fakeApi(): { post: ReturnType<typeof vi.fn>; del: ReturnType<typeof vi.fn> } {
  const get = vi.fn(async (path: string) => (path === "/contacts" ? { contacts: [] } : { requests: [] }));
  const post = vi.fn(async () => ({}));
  const del = vi.fn(async () => ({}));
  const api = { token: "t", base: "http://x", get, post, put: vi.fn(), del, request: vi.fn(), onUnauthorized: null } as unknown as Api;
  configure(api, null, { notifyTitle: () => "", lockNotice: () => "" });
  return { post, del };
}

beforeEach(() => {
  lock(null);
  useChat.setState({
    ...initialState,
    phase: "ready",
    me: { userId: ME, handle: "me", role: "user", publicKey: "" },
    contacts: [{ userId: "peer", handle: "Peer", role: "user", convId: CONV, key: null }],
    activeConv: CONV,
    messages: { [CONV]: [msg(1), msg(0, { id: "p", status: "sending" })], [OTHER]: [msg(1)] },
    favorites: [fav("c1.m1", CONV), fav("c2.m1", OTHER)],
    unread: { [CONV]: 3 },
  });
});

describe("a contact is removed", () => {
  it("by the other person: the chat and the favourites made from it are gone here, the rest stays, and the person is told once", async () => {
    fakeApi();
    await onFrame({ t: "notice", kind: "contact_deleted", userId: "peer" });
    const st = useChat.getState();
    expect(st.messages[CONV]).toBeUndefined(); // even the message still being sent
    expect(st.messages[OTHER]).toHaveLength(1);
    expect(st.favorites.map((f) => f.id)).toEqual(["c2.m1"]);
    expect(st.contacts).toEqual([]);
    expect(st.activeConv).toBeNull();
    expect(st.removedBy).toBe("Peer");
  });

  it("by this person: the server is asked, then the same things are gone, with no toast", async () => {
    const { post } = fakeApi();
    await removeContact("peer");
    expect(post).toHaveBeenCalledWith("/contacts/remove", { userId: "peer" });
    const st = useChat.getState();
    expect(st.messages[CONV]).toBeUndefined();
    expect(st.favorites.map((f) => f.id)).toEqual(["c2.m1"]);
    expect(st.removedBy).toBeNull();
  });

  it("a notice about someone who is not a contact changes nothing and shows nothing", async () => {
    fakeApi();
    await onFrame({ t: "notice", kind: "contact_deleted", userId: "stranger" });
    const st = useChat.getState();
    expect(st.messages[CONV]).toHaveLength(2);
    expect(st.favorites).toHaveLength(2);
    expect(st.removedBy).toBeNull();
  });
});
