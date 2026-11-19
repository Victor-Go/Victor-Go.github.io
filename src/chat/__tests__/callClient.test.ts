import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Api } from "../net/api";
import { configure, lock, onFrame, refreshMe, startCall } from "../client";
import { initialState, useChat } from "../store";

function fakeApi(me: Record<string, unknown>) {
  const get = vi.fn(async () => ({ userId: "me", handle: "me", role: "user", config: me }));
  const api = { token: "t", base: "http://x", get, post: vi.fn(), put: vi.fn(), del: vi.fn(), request: vi.fn(), onUnauthorized: null } as unknown as Api;
  configure(api, null, { notifyTitle: () => "", lockNotice: () => "" });
}

beforeEach(() => {
  lock(null);
  useChat.setState({
    ...initialState,
    sound: false,
    phase: "ready",
    me: { userId: "me", handle: "me", role: "user", publicKey: "" },
    contacts: [{ userId: "bob", handle: "bob", role: "user", convId: "c1", key: null }],
  });
});
afterEach(() => lock(null));

describe("who may call, as the server says", () => {
  it("is off unless the server says canCall: true (an older server says nothing)", async () => {
    fakeApi({ canAddContacts: true });
    await refreshMe();
    expect(useChat.getState().account.canCall).toBe(false);
    fakeApi({ canAddContacts: true, canCall: true });
    await refreshMe();
    expect(useChat.getState().account.canCall).toBe(true);
    fakeApi({ canAddContacts: true, canCall: false });
    await refreshMe();
    expect(useChat.getState().account.canCall).toBe(false);
  });

  it("starting a call does nothing when the account may not call: no screen, no microphone", async () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    await startCall("bob");
    expect(useChat.getState().call).toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("an incoming call frame", () => {
  it("rings for a contact, whatever the person's own right to call", async () => {
    expect(useChat.getState().account.canCall).toBe(false);
    await onFrame({ t: "call", id: "k1", from: "bob", op: "invite", data: "offer" });
    expect(useChat.getState().call).toMatchObject({ id: "k1", userId: "bob", dir: "in", phase: "ringing" });
  });

  it("is ignored from somebody who is not a contact", async () => {
    await onFrame({ t: "call", id: "k1", from: "stranger", op: "invite", data: "offer" });
    expect(useChat.getState().call).toBeNull();
  });

  it("signing out drops the call", async () => {
    await onFrame({ t: "call", id: "k1", from: "bob", op: "invite", data: "offer" });
    lock(null);
    expect(useChat.getState().call).toBeNull();
  });
});
