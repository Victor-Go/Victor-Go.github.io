import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Api, ApiError } from "../net/api";
import { downloadBytes, uploadBytes } from "../net/blob";
import { generateIdentity } from "../crypto/keys";
import { acceptRequest, configure, lock, playVoiceMessage, refreshEpochs, sendVoice } from "../client";
import { initialState, useChat } from "../store";

const played = vi.hoisted(() => vi.fn(async (_key: string, _bytes: Uint8Array) => {}));
vi.mock("../voicePlayer", async (orig) => ({ ...(await orig<typeof import("../voicePlayer")>()), playVoice: played }));

// No master key in this test (no sign-in): the vault records the client writes are not sealed, the server mock just takes them.
vi.mock("../crypto/vault", async (orig) => ({ ...(await orig<typeof import("../crypto/vault")>()), sealRecord: vi.fn(async () => "sealed") }));

const ME = "me";
const CONV = "conv1";
const mp3 = Uint8Array.from({ length: 3000 }, (_, i) => (i * 7) % 256);

let stored: { url: string; init: RequestInit } | null;
let fetchMock: ReturnType<typeof vi.fn>;

function stubStorage(over: { put?: () => Response; get?: () => Response } = {}) {
  fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    if (init.method === "PUT") {
      stored = { url, init };
      return over.put?.() ?? new Response(null, { status: 200 });
    }
    return over.get?.() ?? new Response(stored!.init.body as BodyInit, { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
}

/** A signed-in client with one contact whose chat key exists (made by accepting that contact's request) and the current epoch. */
async function signedIn(post: (path: string, body?: unknown) => unknown, get: (path: string) => unknown = () => ({})) {
  const peer = generateIdentity();
  const g = vi.fn(async (path: string) => {
    if (path === "/epochs") return { current: 3, next: 4, epochs: [{ id: 3, constant: "week_three" }], favorite: { current: 1, epochs: [] } };
    if (path === "/contacts/requests") {
      return { requests: [{ id: "r1", status: "pending", createdAt: 1, from: { userId: "peer", handle: "peer", publicKey: peer.publicKey }, to: { userId: ME, handle: "me", publicKey: "" }, kx: null }] };
    }
    if (path === "/contacts") return { contacts: [{ userId: "peer", handle: "peer", role: "user", convId: CONV }] };
    return get(path);
  });
  const p = vi.fn(async (path: string, body?: unknown) => {
    if (path === "/contacts/accept") return { convId: CONV };
    if (path === "/messages") return { seq: 1 };
    return post(path, body);
  });
  const api = { token: "t", base: "http://x", get: g, post: p, put: vi.fn(async () => ({ version: 1 })), del: vi.fn(), request: vi.fn(), onUnauthorized: null } as unknown as Api;
  configure(api, null, { notifyTitle: () => "", lockNotice: () => "" });
  useChat.setState({ ...initialState, sound: false, phase: "ready", me: { userId: ME, handle: "me", role: "user", publicKey: "" } });
  await refreshEpochs();
  await acceptRequest("r1");
  return { post: p, get: g };
}

beforeEach(() => {
  lock(null);
  stored = null;
  played.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("sending a recording", () => {
  it("asks for an upload address with the size, then PUTs the raw ciphertext bytes with the headers it was given", async () => {
    stubStorage();
    const { post } = await signedIn((path) =>
      path === "/voice" ? { voiceId: "v1", upload: { url: "https://store.example/put?sig=abc", method: "PUT", headers: { "content-length": "999999", "content-type": "application/octet-stream", "x-amz-meta-x": "1" } } } : {},
    );
    await sendVoice(CONV, mp3, 1500);

    const asked = post.mock.calls.find(([path]) => path === "/voice")!;
    const size = (asked[1] as { size: number }).size;
    expect(asked[1]).toEqual({ conv: CONV, size });
    expect(Object.keys(asked[1] as object)).not.toContain("ct"); // nothing travels through the API any more

    expect(stored!.url).toBe("https://store.example/put?sig=abc");
    expect(stored!.init.method).toBe("PUT");
    const body = stored!.init.body as Uint8Array;
    expect(body).toBeInstanceOf(Uint8Array); // raw bytes, not base64 text
    expect(body.length).toBe(size);
    expect(body[0]).toBe(1); // the ciphertext's version byte
    expect(body.length).toBeGreaterThan(mp3.length); // header, tag
    // the signed headers go along; the browser sets content-length itself from the body
    expect(stored!.init.headers).toEqual({ "content-type": "application/octet-stream", "x-amz-meta-x": "1" });
    // no session token goes to the storage
    expect(JSON.stringify(stored!.init)).not.toContain("authorization");
    expect(stored!.init).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer" });

    // then the message carrying the voice id goes out
    const msgs = useChat.getState().messages[CONV];
    expect(msgs.at(-1)).toMatchObject({ status: "sent", payload: { k: "voice", voice: { id: "v1", ms: 1500 } } });
  });

  it("marks the message failed when the storage refuses the upload, without switching voice off", async () => {
    stubStorage({ put: () => new Response(null, { status: 403 }) });
    await signedIn(() => ({ voiceId: "v1", upload: { url: "https://store.example/put", method: "PUT", headers: {} } }));
    await sendVoice(CONV, mp3, 1500);
    expect(useChat.getState().messages[CONV].at(-1)?.status).toBe("failed");
    expect(useChat.getState().voiceOff).toBe(false);
  });

  it("does switch voice off when the API itself says forbidden, but not for the read-only official conversation", async () => {
    stubStorage();
    await signedIn(() => {
      throw new ApiError(403, "forbidden");
    });
    await sendVoice(CONV, mp3, 1500);
    expect(useChat.getState().voiceOff).toBe(true);
    useChat.setState({ voiceOff: false, official: "official:me" });
    await expect(sendVoice("official:me", mp3, 1)).rejects.toMatchObject({ extra: { reason: "official_readonly" } });
    expect(useChat.getState().voiceOff).toBe(false);
  });
});

describe("playing a recording", () => {
  it("asks for a download address, fetches the raw bytes with a plain GET, and opens them", async () => {
    stubStorage();
    const { get } = await signedIn(
      (path) => (path === "/voice" ? { voiceId: "v1", upload: { url: "https://store.example/put", method: "PUT", headers: {} } } : {}),
      (path) => (path === "/voice/v1" ? { download: { url: "https://store.example/get?sig=xyz", expiresAt: Date.now() + 60_000 } } : {}),
    );
    await sendVoice(CONV, mp3, 1500);
    const m = useChat.getState().messages[CONV].at(-1)!;
    await playVoiceMessage(CONV, m);

    expect(get).toHaveBeenCalledWith("/voice/v1");
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe("https://store.example/get?sig=xyz");
    expect(init.method).toBe("GET");
    expect(init.headers).toBeUndefined(); // no token, nothing else
    expect(played).toHaveBeenCalledTimes(1);
    expect(Array.from(played.mock.calls[0][1])).toEqual(Array.from(mp3));
  });

  it("a recording that is gone (the storage answers 404, as for an upload that never finished) is shown as destroyed", async () => {
    stubStorage({ get: () => new Response(null, { status: 404 }) });
    await signedIn(
      () => ({ voiceId: "v1", upload: { url: "https://store.example/put", method: "PUT", headers: {} } }),
      (path) => (path === "/voice/v1" ? { download: { url: "https://store.example/get", expiresAt: 1 } } : {}),
    );
    await sendVoice(CONV, mp3, 1500);
    const m = useChat.getState().messages[CONV].at(-1)!;
    await playVoiceMessage(CONV, m);
    expect(played).not.toHaveBeenCalled();
    expect(useChat.getState().messages[CONV].at(-1)).toMatchObject({ payload: null, lost: "destroyed" });
  });
});

describe("the storage transfer", () => {
  it("reports a network failure and a refusal as errors of the client's own kind", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("x"))));
    await expect(uploadBytes({ url: "https://s.example/a", method: "PUT", headers: {} }, Uint8Array.of(1))).rejects.toMatchObject({ code: "network" });
    await expect(downloadBytes("https://s.example/a")).rejects.toMatchObject({ code: "network" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
    await expect(downloadBytes("https://s.example/a")).rejects.toMatchObject({ status: 500, code: "internal" });
  });
});
