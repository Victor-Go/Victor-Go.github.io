import { describe, it, expect, vi } from "vitest";
import { checkHealth, parseHealth, PROTOCOL_VERSION, SLOW_RTT_MS } from "../net/health";

const good = (minClient = PROTOCOL_VERSION) => ({
  server: { version: "0.1.0", commit: "abc1234", builtAt: 1, region: "ap-east-1" },
  protocol: { current: PROTOCOL_VERSION, minClient },
  features: { inviteRequired: true, groupMax: 32, retentionDays: 30, messageMaxChars: 1024, voiceMaxSec: 60 },
  serverTime: 1700000000000,
});

const reply = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body }) as Response);

describe("protocol", () => {
  it("is protocol 2, which the server reports as current and minimum", () => {
    expect(PROTOCOL_VERSION).toBe(2);
  });
});

describe("parseHealth", () => {
  it("accepts the contract shape", () => {
    expect(parseHealth(good())?.features.inviteRequired).toBe(true);
  });

  it("rejects anything else", () => {
    expect(parseHealth(null)).toBeNull();
    expect(parseHealth({})).toBeNull();
    expect(parseHealth({ ...good(), serverTime: "now" })).toBeNull();
    expect(parseHealth({ ...good(), features: { ...good().features, inviteRequired: "yes" } })).toBeNull();
  });
});

describe("checkHealth", () => {
  it("reports unconfigured without an address", async () => {
    expect(await checkHealth(null)).toEqual({ kind: "unconfigured" });
  });

  it("measures the round trip and sends a plain request", async () => {
    const fetchImpl = reply(good());
    let t = 0;
    const state = await checkHealth("https://api.example.com", { fetchImpl, now: () => (t += 120) });
    expect(state.kind).toBe("ok");
    expect(state.kind === "ok" && state.rttMs).toBe(120);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.com/health");
    expect(init).toMatchObject({ method: "GET", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
  });

  it("marks slow connections", async () => {
    let t = 0;
    const state = await checkHealth("https://api.example.com", { fetchImpl: reply(good()), now: () => (t += SLOW_RTT_MS) });
    expect(state.kind).toBe("slow");
  });

  it("asks for a reload when the page is too old for the server", async () => {
    const state = await checkHealth("https://api.example.com", { fetchImpl: reply(good(PROTOCOL_VERSION + 1)) });
    expect(state.kind).toBe("incompatible");
  });

  it("classifies failures", async () => {
    expect(await checkHealth("https://api.example.com", { fetchImpl: reply({}, false) })).toEqual({ kind: "down", reason: "bad_response" });
    expect(await checkHealth("https://api.example.com", { fetchImpl: reply({ nope: 1 }) })).toEqual({ kind: "down", reason: "bad_response" });
    const broken = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await checkHealth("https://api.example.com", { fetchImpl: broken })).toEqual({ kind: "down", reason: "network" });
  });

  it("times out", async () => {
    const hang = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    ) as unknown as typeof fetch;
    expect(await checkHealth("https://api.example.com", { fetchImpl: hang, timeoutMs: 20 })).toEqual({ kind: "down", reason: "timeout" });
  });
});
