import { describe, it, expect, vi } from "vitest";
import { checkHealth, parseHealth, probePool, probeWsPool, PROTOCOL_VERSION, SLOW_RTT_MS, summarize, wsReachUrl, type HealthState, type WsState } from "../net/health";

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

describe("the live channel check", () => {
  it("asks the host with one plain HTTPS request and never opens a WebSocket", () => {
    expect(wsReachUrl("wss://ws.example.com")).toBe("https://ws.example.com/");
    expect(wsReachUrl("wss://abc.execute-api.ap-east-1.amazonaws.com/prod")).toBe("https://abc.execute-api.ap-east-1.amazonaws.com/prod");
    expect(wsReachUrl("ws://localhost:8788")).toBe("http://localhost:8788/");
  });

  it("counts any answer, even an opaque one, and reads nothing", async () => {
    const fetchImpl = vi.fn(async () => ({ type: "opaque" }) as unknown as Response);
    let t = 0;
    const r = await probeWsPool(["wss://ws.example.com"], { fetchImpl, now: () => (t += 80) });
    expect(r).toEqual({ index: 0, state: { kind: "ok", rttMs: 80 } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ws.example.com/");
    expect(init).toMatchObject({ method: "GET", mode: "no-cors", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
  });

  it("is unconfigured without an address", async () => {
    expect(await probeWsPool([])).toEqual({ index: 0, state: { kind: "unconfigured" } });
  });

  it("moves on at once from an address that fails, and says which one answered", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.startsWith("https://blocked.")) throw new TypeError("Failed to fetch");
      return { type: "opaque" } as unknown as Response;
    });
    const r = await probeWsPool(["wss://blocked.example.com", "wss://ok.example.com"], { fetchImpl: fetchImpl as unknown as typeof fetch, staggerMs: 60_000 });
    expect(r.index).toBe(1);
    expect(r.state.kind).toBe("ok");
  });

  it("reports a down state when every address fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const r = await probeWsPool(["wss://a.example.com", "wss://b.example.com"], { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.state).toEqual({ kind: "down", reason: "network" });
  });

  it("tells a timeout from a refusal", async () => {
    const fetchImpl = vi.fn((_u: string, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("a", "AbortError")))));
    const r = await probeWsPool(["wss://a.example.com"], { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 5 });
    expect(r.state).toEqual({ kind: "down", reason: "timeout" });
  });
});

describe("summarize: what the person is told", () => {
  const httpOk = (rttMs: number): HealthState => ({ kind: rttMs >= SLOW_RTT_MS ? "slow" : "ok", rttMs, health: parseHealth(good())! });
  const wsOk = (rttMs: number): WsState => ({ kind: rttMs >= SLOW_RTT_MS ? "slow" : "ok", rttMs });
  const down: HealthState = { kind: "down", reason: "network" };
  const wsDown: WsState = { kind: "down", reason: "network" };

  it("shows the average of the two when both answer", () => {
    expect(summarize(httpOk(100), wsOk(200))).toEqual({ kind: "ok", rttMs: 150, httpMs: 100, wsMs: 200 });
  });

  it("is slow when either one is slow, whatever the average is", () => {
    const s = summarize(httpOk(100), wsOk(SLOW_RTT_MS));
    expect(s.kind).toBe("slow");
    expect(summarize(httpOk(SLOW_RTT_MS), wsOk(10)).kind).toBe("slow");
  });

  it("names the channel that fails and never averages a failure in", () => {
    expect(summarize(httpOk(120), wsDown)).toEqual({ kind: "wsDown", httpMs: 120 });
    expect(summarize(down, wsOk(90))).toEqual({ kind: "httpDown", reason: "network", wsMs: 90 });
  });

  it("says the server cannot be reached when both fail", () => {
    expect(summarize(down, wsDown)).toEqual({ kind: "allDown" });
  });

  it("waits until both have settled", () => {
    expect(summarize(httpOk(100), { kind: "checking" })).toEqual({ kind: "checking" });
    expect(summarize({ kind: "checking" }, wsOk(100))).toEqual({ kind: "checking" });
  });

  it("uses the sign-in interface alone when the build has no live channel address", () => {
    expect(summarize(httpOk(100), { kind: "unconfigured" })).toEqual({ kind: "ok", rttMs: 100, httpMs: 100, wsMs: null });
    expect(summarize(down, { kind: "unconfigured" })).toEqual({ kind: "httpDown", reason: "network", wsMs: null });
  });

  it("passes unconfigured and incompatible through", () => {
    expect(summarize({ kind: "unconfigured" }, { kind: "unconfigured" })).toEqual({ kind: "unconfigured" });
    const old: HealthState = { kind: "incompatible", rttMs: 10, health: parseHealth(good())! };
    expect(summarize(old, wsOk(10))).toEqual({ kind: "incompatible" });
  });
});
