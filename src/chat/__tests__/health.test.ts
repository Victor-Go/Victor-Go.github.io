import { describe, it, expect, vi } from "vitest";
import { checkHealth, parseHealth, probePool, PROTOCOL_VERSION, SLOW_RTT_MS } from "../net/health";

const good = (minClient = PROTOCOL_VERSION) => ({
  server: { version: "0.1.0", commit: "abc1234", builtAt: 1, region: "ap-east-1" },
  protocol: { current: PROTOCOL_VERSION, minClient },
  features: { inviteRequired: true, retentionDays: 30 },
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

  it("asks a list of addresses as a pool, and an empty list is unconfigured", async () => {
    expect(await checkHealth([])).toEqual({ kind: "unconfigured" });
    const fetchImpl = reply(good());
    expect((await checkHealth(["https://a.example.com"], { fetchImpl })).kind).toBe("ok");
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe("https://a.example.com/health");
  });
});

describe("probePool", () => {
  const A = "https://a.example.com";
  const B = "https://b.example.com";
  const C = "https://c.example.com";
  /** Each address answers as scripted: "ok", "fail" (refused at once) or "hang" (until the request is aborted). */
  const script = (plan: Record<string, "ok" | "fail" | "hang">) => {
    const calls: string[] = [];
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      const base = url.replace(/\/health$/, "");
      calls.push(base);
      if (plan[base] === "ok") return Promise.resolve({ ok: true, json: async () => good() } as Response);
      if (plan[base] === "fail") return Promise.reject(new TypeError("Failed to fetch"));
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
  };

  it("uses the first address when it answers, and asks no other", async () => {
    const { fetchImpl, calls } = script({ [A]: "ok", [B]: "ok" });
    const r = await probePool([A, B], { fetchImpl, staggerMs: 1000 });
    expect(r.index).toBe(0);
    expect(r.state.kind).toBe("ok");
    expect(calls).toEqual([A]);
  });

  it("hands over at once from an address that fails, without waiting out the stagger", async () => {
    const { fetchImpl, calls } = script({ [A]: "fail", [B]: "ok", [C]: "ok" });
    const r = await probePool([A, B, C], { fetchImpl, staggerMs: 60_000 });
    expect(r.index).toBe(1);
    expect(calls).toEqual([A, B]);
  });

  it("asks the next address alongside one that stays silent, and the first answer wins", async () => {
    const { fetchImpl } = script({ [A]: "hang", [B]: "ok" });
    const r = await probePool([A, B], { fetchImpl, staggerMs: 20, timeoutMs: 5000 });
    expect(r.index).toBe(1);
  });

  it("is the first address's failure when none answers", async () => {
    const { fetchImpl } = script({ [A]: "fail", [B]: "fail" });
    expect(await probePool([A, B], { fetchImpl })).toEqual({ index: 0, state: { kind: "down", reason: "network" } });
  });

  it("counts a server on a newer protocol as answering (it is our server), not as down", async () => {
    const r = await probePool([A, B], { fetchImpl: reply(good(PROTOCOL_VERSION + 1)), staggerMs: 1000 });
    expect(r.index).toBe(0);
    expect(r.state.kind).toBe("incompatible");
  });
});
