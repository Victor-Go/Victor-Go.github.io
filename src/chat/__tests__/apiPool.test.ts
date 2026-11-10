import { afterEach, describe, expect, it, vi } from "vitest";
import { Api, ApiError } from "../net/api";
import type { PoolResult } from "../net/health";

const A = "https://a.example.com";
const B = "https://b.example.com";
const ok: PoolResult["state"] = { kind: "unconfigured" }; // the state is not looked at by Api, only the index

/** A probe that answers with the given indexes, one per call. */
const probes = (...indexes: number[]) => {
  const queue = [...indexes];
  return vi.fn(async (): Promise<PoolResult> => ({ index: queue.shift() ?? 0, state: ok }));
};

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

/** `fetch` that answers per address: a function from the full URL, or a thrown network error. */
const net = (handler: (url: string) => Response | "down") => {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      const r = handler(url);
      if (r === "down") throw new TypeError("Failed to fetch");
      return r;
    }),
  );
  return calls;
};

afterEach(() => vi.unstubAllGlobals());

describe("Api with one address", () => {
  it("never probes and calls that address", async () => {
    const probe = probes();
    const calls = net(() => json({ n: 1 }));
    const api = new Api(A, probe);
    await api.get("/x");
    expect(probe).not.toHaveBeenCalled();
    expect(calls).toEqual([`${A}/x`]);
    expect(api.base).toBe(A);
  });
});

describe("Api with a pool", () => {
  it("waits for the first probe and then calls the address that answered", async () => {
    const probe = probes(1);
    const calls = net(() => json({ n: 1 }));
    const api = new Api([A, B], probe);
    await api.get("/x");
    await api.get("/y");
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledWith([A, B]);
    expect(calls).toEqual([`${B}/x`, `${B}/y`]);
    expect(api.base).toBe(B);
  });

  it("requests that start together share one probe", async () => {
    const probe = probes(1);
    net(() => json({}));
    const api = new Api([A, B], probe);
    await Promise.all([api.get("/x"), api.get("/y"), api.post("/z")]);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("repeats a read that reached no server on the address the probe picks next", async () => {
    const probe = probes(0, 1);
    const calls = net((url) => (url.startsWith(A) ? "down" : json({ n: 7 })));
    const api = new Api([A, B], probe);
    expect(await api.get<{ n: number }>("/x")).toEqual({ n: 7 });
    expect(calls).toEqual([`${A}/x`, `${B}/x`]);
    expect(api.base).toBe(B);
  });

  it("never repeats a write on another address, but the next call uses the one that works", async () => {
    const probe = probes(0, 1);
    const calls = net((url) => (url.startsWith(A) ? "down" : json({ ok: true })));
    const api = new Api([A, B], probe);
    await expect(api.post("/send", { t: 1 })).rejects.toMatchObject({ status: 0, code: "network" });
    expect(calls).toEqual([`${A}/send`]);
    await api.post("/send", { t: 2 });
    expect(calls).toEqual([`${A}/send`, `${B}/send`]);
  });

  it("an answer, even an error, is the server's and changes nothing", async () => {
    const probe = probes(0);
    const calls = net(() => json({ error: { code: "forbidden" } }, 403));
    const api = new Api([A, B], probe);
    await expect(api.get("/x")).rejects.toBeInstanceOf(ApiError);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([`${A}/x`]);
  });

  it("a read that fails on the second address too is an error, not a loop", async () => {
    const probe = probes(0, 1);
    const calls = net(() => "down");
    const api = new Api([A, B], probe);
    await expect(api.get("/x")).rejects.toMatchObject({ status: 0, code: "network" });
    expect(calls).toEqual([`${A}/x`, `${B}/x`]);
    expect(probe).toHaveBeenCalledTimes(2);
  });
});
