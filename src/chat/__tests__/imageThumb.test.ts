import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Api } from "../net/api";
import { downloadBytes } from "../net/blob";
import { generateIdentity } from "../crypto/keys";
import { STORED_MAX_BYTES, decryptMessage, encryptMessage, type Binding, type Payload } from "../crypto/message";
import { toEpochs } from "../crypto/keys";
import { acceptRequest, configure, deleteMessages, fullImageUrl, imageKey, imageUrl, lock, refreshEpochs, sendImage } from "../client";
import { initialState, useChat } from "../store";

// No master key in this test (no sign-in): the vault records the client writes are not sealed, the server mock just takes them.
vi.mock("../crypto/vault", async (orig) => ({ ...(await orig<typeof import("../crypto/vault")>()), sealRecord: vi.fn(async () => "sealed") }));
// The browser's canvas is not here: the compressed picture and its preview are fixed sets of bytes.
const compressed = vi.hoisted(() => ({ bytes: new Uint8Array(0) as Uint8Array, thumb: undefined as Uint8Array | undefined, w: 1600, h: 1200, type: "image/jpeg" }));
vi.mock("../image", async (orig) => ({ ...(await orig<typeof import("../image")>()), compressImage: vi.fn(async () => ({ ...compressed })) }));

const ME = "me";
const CONV = "conv1";
const jpeg = (n: number, seed: number): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i === 0 ? 0xff : i === 1 ? 0xd8 : (i * seed) % 256));

let object: Uint8Array | null;
let requests: { method: string; range: string | null }[];
let created: { blob: Blob; url: string }[];
let status206 = true;

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

const server = (path: string, body?: unknown) =>
  path === "/files" ? { fileId: "img1", upload: { url: "https://store.example/put", method: "PUT", headers: {} }, size: (body as { size: number }).size } : path === "/messages/delete" ? { deleted: [1], fileDeleted: ["img1"] } : {};
const download = (path: string) => (path === "/files/img1" ? { download: { url: "https://store.example/get?sig=1", expiresAt: Date.now() + 60_000 } } : {});

beforeEach(() => {
  lock(null);
  object = null;
  requests = [];
  created = [];
  status206 = true;
  compressed.bytes = jpeg(6000, 13);
  compressed.thumb = jpeg(900, 7);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === "PUT") {
        object = init.body as Uint8Array;
        requests.push({ method: "PUT", range: null });
        return new Response(null, { status: 200 });
      }
      const range = (init.headers as Record<string, string> | undefined)?.Range ?? null;
      requests.push({ method: "GET", range });
      const m = range ? /^bytes=(\d+)-(\d*)$/.exec(range) : null;
      if (!m || !status206) return new Response(object as BodyInit, { status: 200 });
      return new Response(object!.slice(Number(m[1]), m[2] === "" ? undefined : Number(m[2]) + 1) as BodyInit, { status: 206 });
    }),
  );
  let n = 0;
  vi.stubGlobal("URL", Object.assign(URL, {
    createObjectURL: vi.fn((b: Blob) => {
      const url = `blob:local/${++n}`;
      created.push({ blob: b, url });
      return url;
    }),
    revokeObjectURL: vi.fn(),
  }));
});
afterEach(() => vi.unstubAllGlobals());

/** The picture I sent, and then forgotten as if it had come from the other person: the next read has to fetch it. */
async function sentThenForgotten() {
  await signedIn(server, download);
  await sendImage(CONV, new Blob(["picked"]));
  const m = useChat.getState().messages[CONV].at(-1)!;
  await deleteMessages(CONV, [m.seq]);
  created.length = 0;
  requests.length = 0;
  return m;
}

describe("sending a picture that has a preview", () => {
  it("seals the preview and the picture on their own, preview first, into one object, and tells the preview's length", async () => {
    const { post } = await signedIn(server, download);
    await sendImage(CONV, new Blob(["picked"]));
    const m = useChat.getState().messages[CONV].at(-1)!;
    const t = (m.payload as Extract<Payload, { k: "image" }>).image.t!;
    // 12 bytes of nonce, 16 of salt, 3 of header and 16 of tag around the bytes
    expect(t).toBe(compressed.thumb!.length + 47);
    expect(object!.length).toBe(t + compressed.bytes.length + 47);
    expect(post.mock.calls.find(([p]) => p === "/files")![1]).toEqual({ conv: CONV, size: object!.length });
    expect(m.payload).toMatchObject({ k: "image", image: { id: "img1", w: 1600, h: 1200, t } });
    // one object, one PUT
    expect(requests.filter((r) => r.method === "PUT")).toHaveLength(1);
  });

  it("shows my own picture from the local copy with no download", async () => {
    await signedIn(server, download);
    await sendImage(CONV, new Blob(["picked"]));
    const m = useChat.getState().messages[CONV].at(-1)!;
    requests.length = 0;
    expect(await imageUrl(CONV, m)).toBe("blob:local/1");
    expect(await fullImageUrl(CONV, m)).toBe("blob:local/1");
    expect(requests).toEqual([]);
  });

  it("sends a picture without a preview as before: no t, the object is the picture", async () => {
    compressed.thumb = undefined;
    await signedIn(server, download);
    await sendImage(CONV, new Blob(["picked"]));
    const m = useChat.getState().messages[CONV].at(-1)!;
    expect((m.payload as Extract<Payload, { k: "image" }>).image).toEqual({ id: "img1", w: 1600, h: 1200 });
    expect(object!.length).toBe(compressed.bytes.length + 47);
  });
});

describe("reading a picture that has a preview", () => {
  it("fetches only the preview for the bubble, as a range of the object, and the rest only when the picture is opened", async () => {
    const m = await sentThenForgotten();
    const t = (m.payload as Extract<Payload, { k: "image" }>).image.t!;

    const thumb = await imageUrl(CONV, m);
    expect(requests).toEqual([{ method: "GET", range: `bytes=0-${t - 1}` }]);
    expect(Array.from(new Uint8Array(await created[0].blob.arrayBuffer()))).toEqual(Array.from(compressed.thumb!));
    // the same preview again costs nothing
    expect(await imageUrl(CONV, m)).toBe(thumb);
    expect(requests).toHaveLength(1);

    const full = await fullImageUrl(CONV, m);
    expect(full).not.toBe(thumb);
    expect(requests[1]).toEqual({ method: "GET", range: `bytes=${t}-` });
    expect(Array.from(new Uint8Array(await created[1].blob.arrayBuffer()))).toEqual(Array.from(compressed.bytes));
    // from now on the bubble shows the whole picture, and nothing more is fetched
    expect(await imageUrl(CONV, m)).toBe(full);
    expect(await fullImageUrl(CONV, m)).toBe(full);
    expect(requests).toHaveLength(2);
  });

  it("is not fooled by a storage that answers the whole object to a range request", async () => {
    status206 = false;
    const m = await sentThenForgotten();
    await imageUrl(CONV, m);
    await fullImageUrl(CONV, m);
    expect(Array.from(new Uint8Array(await created[0].blob.arrayBuffer()))).toEqual(Array.from(compressed.thumb!));
    expect(Array.from(new Uint8Array(await created[1].blob.arrayBuffer()))).toEqual(Array.from(compressed.bytes));
  });

  it("downloads an old picture (no t) whole, once, whichever way it is asked for", async () => {
    compressed.thumb = undefined;
    const m = await sentThenForgotten();
    const url = await imageUrl(CONV, m);
    expect(requests).toEqual([{ method: "GET", range: null }]);
    expect(await fullImageUrl(CONV, m)).toBe(url);
    expect(requests).toHaveLength(1);
  });

  it("keeps the preview and the picture apart: one cannot be opened as the other", async () => {
    const m = await sentThenForgotten();
    const t = (m.payload as Extract<Payload, { k: "image" }>).image.t!;
    // the same message claiming a different split of the object does not open
    const wrong = { ...m, payload: { ...(m.payload as Extract<Payload, { k: "image" }>), image: { ...(m.payload as Extract<Payload, { k: "image" }>).image, t: t + 1 } } } as typeof m;
    expect(await imageUrl(CONV, wrong)).toBeNull();
    expect(imageKey(m)).toBe(`${ME}.${m.id}`);
  });
});

describe("the preview length in a message", () => {
  const epochs = toEpochs([{ id: 3, constant: "week_three" }], 3);
  const key = new Uint8Array(32).fill(7);
  const binding: Binding = { conv: "c1", senderId: "u1", clientMsgId: "m1", gen: 0 };
  const sealed = (t: unknown) => encryptMessage(key, epochs, { k: "image", image: { id: "f1", w: 800, h: 600, t } as never, sentAt: 1 }, binding);

  it("keeps a sensible length", async () => {
    const { ct } = await sealed(1000);
    expect(await decryptMessage(key, epochs, ct, binding)).toMatchObject({ image: { t: 1000 } });
  });

  it.each([0, -5, 1.5, "9", STORED_MAX_BYTES, null])("drops a length that cannot be right (%s): the picture is then read whole", async (t) => {
    const { ct } = await sealed(t);
    const p = await decryptMessage(key, epochs, ct, binding);
    expect((p as Extract<Payload, { k: "image" }>).image).toEqual({ id: "f1", w: 800, h: 600 });
  });
});

describe("downloading part of an object", () => {
  it("asks for the span with a Range header and returns exactly that part", async () => {
    const body = Uint8Array.from({ length: 100 }, (_, i) => i);
    const calls: (string | undefined)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const range = (init.headers as Record<string, string> | undefined)?.Range;
        calls.push(range);
        return new Response(body.slice(10, 20) as BodyInit, { status: 206 });
      }),
    );
    expect(Array.from(await downloadBytes("https://s.example/a", { from: 10, to: 19 }))).toEqual(Array.from(body.slice(10, 20)));
    expect(calls).toEqual(["bytes=10-19"]);
  });

  it("asks for everything from a byte on when there is no end, and cuts the part out of a whole answer", async () => {
    const body = Uint8Array.from({ length: 50 }, (_, i) => i);
    const calls: (string | undefined)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push((init.headers as Record<string, string> | undefined)?.Range);
        return new Response(body as BodyInit, { status: 200 });
      }),
    );
    expect(Array.from(await downloadBytes("https://s.example/a", { from: 40 }))).toEqual([40, 41, 42, 43, 44, 45, 46, 47, 48, 49]);
    expect(Array.from(await downloadBytes("https://s.example/a", { from: 2, to: 4 }))).toEqual([2, 3, 4]);
    expect(calls).toEqual(["bytes=40-", "bytes=2-4"]);
  });
});
