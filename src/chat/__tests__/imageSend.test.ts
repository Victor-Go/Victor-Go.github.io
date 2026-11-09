import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Api } from "../net/api";
import { generateIdentity } from "../crypto/keys";
import { acceptRequest, configure, imageKey, imageUrl, lock, refreshEpochs, sendImage } from "../client";
import { initialState, useChat } from "../store";

// No master key in this test (no sign-in): the vault records the client writes are not sealed, the server mock just takes them.
vi.mock("../crypto/vault", async (orig) => ({ ...(await orig<typeof import("../crypto/vault")>()), sealRecord: vi.fn(async () => "sealed") }));
// The browser's canvas is not here: the compressed picture is a fixed set of bytes.
const compressed = vi.hoisted(() => ({ bytes: new Uint8Array(0), w: 800, h: 600 }));
vi.mock("../image", async (orig) => ({ ...(await orig<typeof import("../image")>()), compressImage: vi.fn(async () => compressed) }));

const ME = "me";
const CONV = "conv1";

let stored: { url: string; init: RequestInit } | null;
let fetchMock: ReturnType<typeof vi.fn>;
let created: Blob[];
const revoked: string[] = [];

async function signedIn(post: (path: string, body?: unknown) => unknown) {
  const peer = generateIdentity();
  const g = vi.fn(async (path: string) => {
    if (path === "/epochs") return { current: 3, next: 4, epochs: [{ id: 3, constant: "week_three" }], favorite: { current: 1, epochs: [] } };
    if (path === "/contacts/requests") {
      return { requests: [{ id: "r1", status: "pending", createdAt: 1, from: { userId: "peer", handle: "peer", publicKey: peer.publicKey }, to: { userId: ME, handle: "me", publicKey: "" }, kx: null }] };
    }
    if (path === "/contacts") return { contacts: [{ userId: "peer", handle: "peer", role: "user", convId: CONV }] };
    return {};
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
  return { post: p };
}

const grant = (path: string) =>
  path === "/files" ? { fileId: "img1", upload: { url: "https://store.example/put?sig=abc", method: "PUT", headers: { "content-length": "9", "content-type": "application/octet-stream" } } } : {};

beforeEach(() => {
  lock(null);
  stored = null;
  created = [];
  revoked.length = 0;
  compressed.bytes = Uint8Array.from({ length: 5000 }, (_, i) => (i * 13) % 256);
  fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    stored = { url, init };
    return new Response(null, { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  let n = 0;
  vi.stubGlobal("URL", Object.assign(URL, {
    createObjectURL: vi.fn((b: Blob) => (created.push(b), `blob:local/${++n}`)),
    revokeObjectURL: vi.fn((u: string) => void revoked.push(u)),
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("sending a picture", () => {
  it("uploads the sealed bytes through the voice storage, then sends a message that tells the stored id and the pixels", async () => {
    const { post } = await signedIn(grant);
    await sendImage(CONV, new Blob(["picked"], { type: "image/heic" }));

    const asked = post.mock.calls.find(([path]) => path === "/files")!;
    const size = (asked[1] as { size: number }).size;
    expect(asked[1]).toEqual({ conv: CONV, size });
    expect(size).toBeGreaterThan(compressed.bytes.length); // header and tag
    expect(size).toBeLessThanOrEqual(512 * 1024);
    expect(stored!.url).toBe("https://store.example/put?sig=abc");
    expect((stored!.init.body as Uint8Array).length).toBe(size);

    const m = useChat.getState().messages[CONV].at(-1)!;
    expect(m).toMatchObject({ status: "sent", mine: true, payload: { k: "image", image: { id: "img1", w: 800, h: 600 } } });
  });

  it("shows the picture at once from the local copy, with no download, as image/jpeg", async () => {
    await signedIn(grant);
    await sendImage(CONV, new Blob(["picked"]));
    expect(created).toHaveLength(1);
    expect(created[0].type).toBe("image/jpeg");
    const m = useChat.getState().messages[CONV].at(-1)!;
    expect(await imageUrl(CONV, m)).toBe("blob:local/1");
    expect(fetchMock).toHaveBeenCalledTimes(1); // the upload only
  });

  it("keeps the picture under the key of the message, so the unsent and the sent message share it", async () => {
    await signedIn(grant);
    await sendImage(CONV, new Blob(["picked"]));
    const m = useChat.getState().messages[CONV].at(-1)!;
    expect(imageKey(m)).toBe(`${ME}.${m.id}`);
  });

  it("marks the message failed when the storage refuses, and still shows the local copy", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 500 }));
    await signedIn(grant);
    await sendImage(CONV, new Blob(["picked"]));
    const m = useChat.getState().messages[CONV].at(-1)!;
    expect(m.status).toBe("failed");
    expect(await imageUrl(CONV, m)).toBe("blob:local/1");
  });

  it("revokes the local pictures when the chat locks", async () => {
    await signedIn(grant);
    await sendImage(CONV, new Blob(["picked"]));
    lock(null);
    expect(revoked).toEqual(["blob:local/1"]);
  });

  it("is not allowed in the official conversation", async () => {
    await signedIn(grant);
    useChat.setState({ official: CONV });
    await expect(sendImage(CONV, new Blob(["picked"]))).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
