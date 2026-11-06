// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { connectSrc, parseEndpoint } from "../csp";

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

describe("connectSrc", () => {
  it("is 'none' without a usable endpoint", () => {
    expect(connectSrc(undefined, undefined)).toBe("'none'");
    expect(connectSrc("http://evil.example", "ws://evil.example")).toBe("'none'");
  });

  it("lists only the server origins, once each", () => {
    expect(connectSrc("https://a.example.com/x", "wss://b.example.com/prod")).toBe("https://a.example.com wss://b.example.com");
    expect(connectSrc("https://a.example.com", undefined)).toBe("https://a.example.com");
  });
});

describe("script-src of the chat pages", () => {
  // OPAQUE runs as WebAssembly (compiled from the bundle, same origin). 'wasm-unsafe-eval' allows WebAssembly.compile and nothing else:
  // no eval, no inline scripts, no 'unsafe-eval', no other origin. It is the only addition to 'self'.
  for (const page of ["chat/index.html", "chat/account/index.html", "chat/management/index.html"]) {
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
