// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { connectSrc, parseEndpoint, parseEndpoints, unusableEndpoints } from "../csp";

describe("parseEndpoint", () => {
  it("accepts https and wss without a trailing slash", () => {
    expect(parseEndpoint("https://api.example.com/", "http")).toBe("https://api.example.com");
    expect(parseEndpoint("wss://x.execute-api.ap-east-1.amazonaws.com/prod/", "ws")).toBe(
      "wss://x.execute-api.ap-east-1.amazonaws.com/prod",
    );
  });

  it("allows plain http / ws only for localhost", () => {
    expect(parseEndpoint("http://localhost:8787", "http")).toBe("http://localhost:8787");
    expect(parseEndpoint("ws://127.0.0.1:8787", "ws")).toBe("ws://127.0.0.1:8787");
    expect(parseEndpoint("http://api.example.com", "http")).toBeNull();
    expect(parseEndpoint("ws://api.example.com", "ws")).toBeNull();
  });

  it("rejects the wrong scheme, credentials, queries and junk", () => {
    expect(parseEndpoint("wss://api.example.com", "http")).toBeNull();
    expect(parseEndpoint("https://api.example.com", "ws")).toBeNull();
    expect(parseEndpoint("https://u:p@api.example.com", "http")).toBeNull();
    expect(parseEndpoint("https://api.example.com/?a=1", "http")).toBeNull();
    expect(parseEndpoint("not a url", "http")).toBeNull();
    expect(parseEndpoint("", "http")).toBeNull();
    expect(parseEndpoint(undefined, "http")).toBeNull();
  });
});

describe("parseEndpoints (a pool: a, b, c)", () => {
  it("keeps the order, which is the order of preference", () => {
    expect(
      parseEndpoints("https://b9t6xrjet5.execute-api.ap-east-1.amazonaws.com,https://api.cubicinnovative.com,https://api.waterwoodgames.com", "http"),
    ).toEqual(["https://b9t6xrjet5.execute-api.ap-east-1.amazonaws.com", "https://api.cubicinnovative.com", "https://api.waterwoodgames.com"]);
  });

  it("accepts spaces and new lines around the commas, trailing slashes, and counts a repeat once", () => {
    expect(parseEndpoints(" https://a.example.com/ ,\n https://b.example.com,https://a.example.com ", "http")).toEqual([
      "https://a.example.com",
      "https://b.example.com",
    ]);
  });

  it("leaves out what is not usable, and one plain address is a pool of one", () => {
    expect(parseEndpoints("https://a.example.com,http://evil.example,not a url,https://u:p@x.example", "http")).toEqual(["https://a.example.com"]);
    expect(parseEndpoints("wss://ws.example.com", "ws")).toEqual(["wss://ws.example.com"]);
    expect(parseEndpoints("https://a.example.com", "ws")).toEqual([]);
    expect(parseEndpoints("", "http")).toEqual([]);
    expect(parseEndpoints(undefined, "http")).toEqual([]);
  });

  it("names the entries it leaves out, so the build can warn", () => {
    expect(unusableEndpoints("https://a.example.com, http://b.example.com,,typo", "http")).toEqual(["http://b.example.com", "typo"]);
    expect(unusableEndpoints("https://a.example.com", "http")).toEqual([]);
    expect(unusableEndpoints(undefined, "ws")).toEqual([]);
  });
});

describe("connectSrc", () => {
  it("lists every address of both pools", () => {
    expect(connectSrc("https://a.example.com,https://b.example.com", "wss://x.example.com/prod,wss://y.example.com")).toBe(
      "https://a.example.com https://b.example.com wss://x.example.com wss://y.example.com",
    );
    expect(connectSrc("https://a.example.com,http://evil.example", undefined)).toBe("https://a.example.com");
  });

  it("is 'none' without a usable endpoint", () => {
    expect(connectSrc(undefined, undefined)).toBe("'none'");
    expect(connectSrc("http://evil.example", "ws://evil.example")).toBe("'none'");
  });

  it("lists only the server origins, once each", () => {
    expect(connectSrc("https://a.example.com/x", "wss://b.example.com/prod")).toBe("https://a.example.com wss://b.example.com");
    expect(connectSrc("https://a.example.com", undefined)).toBe("https://a.example.com");
  });

  it("adds the voice storage origin, once, and ignores one that is not usable", () => {
    expect(connectSrc("https://a.example.com", "wss://b.example.com/prod", "https://voice-bucket.s3.ap-east-1.amazonaws.com/")).toBe(
      "https://a.example.com wss://b.example.com https://voice-bucket.s3.ap-east-1.amazonaws.com",
    );
    expect(connectSrc("https://a.example.com", undefined, "https://a.example.com")).toBe("https://a.example.com");
    expect(connectSrc("https://a.example.com", undefined, "http://voice.example.com")).toBe("https://a.example.com");
    expect(connectSrc(undefined, undefined, "https://voice.example.com")).toBe("https://voice.example.com");
    expect(connectSrc(undefined, undefined, "")).toBe("'none'");
  });
});

describe("script-src of the chat pages", () => {
  // OPAQUE runs as WebAssembly (compiled from the bundle, same origin). 'wasm-unsafe-eval' allows WebAssembly.compile and nothing else:
  // no eval, no inline scripts, no 'unsafe-eval', no other origin. It is the only addition to 'self'.
  for (const page of ["chat/index.html"]) {
    it(`${page} allows WebAssembly and nothing broader`, () => {
      const html = readFileSync(resolve(__dirname, "../../..", page), "utf8");
      const policy = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? "";
      const scripts = policy.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src "));
      expect(scripts).toBe("script-src 'self' 'wasm-unsafe-eval'");
      expect(policy).not.toContain("'unsafe-eval'");
      expect(policy).not.toContain("'unsafe-inline'");
    });
  }
});
