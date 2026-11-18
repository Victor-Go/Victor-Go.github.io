import { describe, it, expect, vi, afterEach } from "vitest";
import { generateKeyPairSync, sign, webcrypto } from "node:crypto";
import { canonical, fetchSigned, mergePool, verifyEndpoints, type SignedEndpoints } from "../net/endpoints";
import { connectSrc, hostMatches, parseSignedConfig } from "../csp";

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const pair = generateKeyPairSync("ed25519");
const rawKey = (k: typeof pair.publicKey): string => Buffer.from(k.export({ format: "jwk" }).x!, "base64url").toString("base64");
const KEY = rawKey(pair.publicKey);

function signed(list: SignedEndpoints, privateKey = pair.privateKey) {
  return { v: 1, ...list, sig: sign(null, Buffer.from(canonical(list)), privateKey).toString("base64") };
}
const list = (seq: number, api = ["https://api2.example.com"], ws = ["wss://ws2.example.com"]): SignedEndpoints => ({ seq, api, ws });

afterEach(() => vi.restoreAllMocks());

describe("verifyEndpoints", () => {
  it("accepts a list signed with the key", async () => {
    expect(await verifyEndpoints(signed(list(3)), KEY, subtle)).toEqual(list(3));
  });

  it("rejects a list signed with another key", async () => {
    const other = generateKeyPairSync("ed25519");
    expect(await verifyEndpoints(signed(list(3), other.privateKey), KEY, subtle)).toBeNull();
  });

  it("rejects any change to what was signed", async () => {
    const good = signed(list(3));
    expect(await verifyEndpoints({ ...good, seq: 4 }, KEY, subtle)).toBeNull();
    expect(await verifyEndpoints({ ...good, api: ["https://evil.example.net"] }, KEY, subtle)).toBeNull();
    expect(await verifyEndpoints({ ...good, ws: [] }, KEY, subtle)).toBeNull();
  });

  it("rejects one entry made to look like two, and shapes that are not a list", async () => {
    expect(await verifyEndpoints(signed(list(1, ["https://a.example.com,https://b.example.com"])), KEY, subtle)).toBeNull();
    const bad = [
      null,
      [],
      "x",
      {},
      { v: 2, seq: 1, api: [], ws: [], sig: "AA==" },
      { v: 1, seq: -1, api: [], ws: [], sig: "AA==" },
      { v: 1, seq: 1.5, api: [], ws: [], sig: "AA==" },
      { v: 1, seq: 1, api: "x", ws: [], sig: "AA==" },
    ];
    for (const b of bad) expect(await verifyEndpoints(b, KEY, subtle)).toBeNull();
  });

  it("never throws on a damaged key or signature", async () => {
    expect(await verifyEndpoints(signed(list(1)), "not base64!!", subtle)).toBeNull();
    expect(await verifyEndpoints({ ...signed(list(1)), sig: "@@@" }, KEY, subtle)).toBeNull();
    expect(await verifyEndpoints(signed(list(1)), KEY, {} as SubtleCrypto)).toBeNull(); // a browser without Ed25519
  });
});

describe("fetchSigned", () => {
  const files = (map: Record<string, unknown>) =>
    vi.fn(async (url: string) => {
      if (!(url in map)) throw new TypeError("Failed to fetch");
      return { ok: true, json: async () => map[url] } as Response;
    }) as unknown as typeof fetch;

  it("takes the highest verified seq and ignores what does not verify or does not answer", async () => {
    const other = generateKeyPairSync("ed25519");
    const fetchImpl = files({
      "https://a.example.com/chat/endpoints.json": signed(list(5)),
      "https://b.example.com/chat/endpoints.json": signed(list(9, ["https://forged.example.com"]), other.privateKey),
      "https://c.example.com/chat/endpoints.json": signed(list(7, ["https://api3.example.com"])),
    });
    const got = await fetchSigned(
      [
        "https://a.example.com/chat/endpoints.json",
        "https://b.example.com/chat/endpoints.json",
        "https://c.example.com/chat/endpoints.json",
        "https://down.example.com/chat/endpoints.json",
      ],
      KEY,
      { fetchImpl, subtle },
    );
    expect(got?.seq).toBe(7);
    expect(got?.api).toEqual(["https://api3.example.com"]);
  });

  it("resolves a path against the page's own origin and asks without cookies or referrer", async () => {
    const fetchImpl = files({ "https://page.example.com/chat/endpoints.json": signed(list(1)) });
    const got = await fetchSigned(["/chat/endpoints.json"], KEY, { fetchImpl, subtle, origin: "https://page.example.com" });
    expect(got?.seq).toBe(1);
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect(init).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer", method: "GET" });
  });

  it("gives null when nothing verifies", async () => {
    expect(await fetchSigned(["https://a.example.com/x.json"], KEY, { fetchImpl: files({}), subtle })).toBeNull();
  });
});

describe("mergePool", () => {
  const built = ["https://api.example.com", "https://old.example.org"];

  it("puts the signed addresses first and keeps the build's behind them, once each", () => {
    expect(mergePool(["https://api2.example.com", "https://api.example.com"], built, "http", ["*.example.com"])).toEqual([
      "https://api2.example.com",
      "https://api.example.com",
      "https://old.example.org",
    ]);
  });

  it("drops a signed address outside the families the build allows, and one that is not usable", () => {
    expect(mergePool(["https://evil.example.net", "http://api2.example.com", "https://api3.example.com"], built, "http", ["*.example.com"])).toEqual([
      "https://api3.example.com",
      ...built,
    ]);
  });

  it("always allows a host the build already carries", () => {
    expect(mergePool(["https://old.example.org"], built, "http", [])).toEqual(["https://old.example.org", "https://api.example.com"]);
  });
});

describe("name families and the page's connect-src", () => {
  it("matches subdomains and nothing else", () => {
    expect(hostMatches("a.example.com", ["*.example.com"])).toBe(true);
    expect(hostMatches("a.b.example.com", ["*.example.com"])).toBe(true);
    expect(hostMatches("example.com", ["*.example.com"])).toBe(false);
    expect(hostMatches("evilexample.com", ["*.example.com"])).toBe(false);
    expect(hostMatches("a.example.com.evil.net", ["*.example.com"])).toBe(false);
  });

  it("accepts only `*.domain.tld` families and sources that are a file", () => {
    const parsed = parseSignedConfig(
      "/chat/endpoints.json, https://x.example.com/chat/endpoints.json, https://x.example.com, //evil/x, /a/../b, http://x.example.com/e.json",
      "*.example.com, *, *.com, example.com, *.x.io, *.bad_name.io",
    );
    expect(parsed.sources).toEqual(["/chat/endpoints.json", "https://x.example.com/chat/endpoints.json"]);
    expect(parsed.hosts).toEqual(["*.example.com", "*.x.io"]);
  });

  it("adds the sources and the families to connect-src, and stays closed without them", () => {
    expect(
      connectSrc("https://a.example.com", "wss://b.example.com", undefined, {
        sources: "/chat/endpoints.json,https://x.example.org/chat/endpoints.json",
        hosts: "*.example.com",
      }),
    ).toBe("https://a.example.com wss://b.example.com https://b.example.com 'self' https://x.example.org https://*.example.com wss://*.example.com");
    expect(connectSrc(undefined, undefined, undefined, { sources: undefined, hosts: undefined })).toBe("'none'");
  });
});
