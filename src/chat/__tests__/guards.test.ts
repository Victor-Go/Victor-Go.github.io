// @vitest-environment node
/// <reference types="node" />
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { FORBIDDEN, findForbidden } from "../../cipher/__tests__/forbidden";

const here = dirname(fileURLToPath(import.meta.url));
const chatDir = resolve(here, "..");
const srcDir = resolve(chatDir, "..");
const netDir = join(chatDir, "net");

/** Network APIs are allowed, but only inside src/chat/net. */
const NETWORK = new Set(["fetch", "WebSocket", "XMLHttpRequest", "sendBeacon", "EventSource"]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : walk(p);
    return /\.(ts|tsx|css|html)$/.test(name) ? [p] : [];
  });
}

describe("static source guard for src/chat", () => {
  const files = walk(chatDir);

  it("finds source files to scan", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("stores nothing: no cookies, web storage, IndexedDB, caches, service workers or history state", () => {
    // route.ts alone may call replaceState to keep the address bar in step (the session lives in memory, so no reload).
    const hits = files.flatMap((f) =>
      findForbidden(readFileSync(f, "utf8"))
        .filter((label) => !NETWORK.has(label) && !(label === "replaceState" && f === join(chatDir, "route.ts")))
        .map((h) => `${relative(srcDir, f)}: ${h}`),
    );
    expect(hits).toEqual([]);
  });

  it("uses the network only from src/chat/net", () => {
    const hits = files
      .filter((f) => !f.startsWith(netDir + sep))
      .flatMap((f) =>
        findForbidden(readFileSync(f, "utf8"))
          .filter((label) => NETWORK.has(label))
          .map((h) => `${relative(srcDir, f)}: ${h}`),
      );
    expect(hits).toEqual([]);
  });

  it("forbids the storage names", () => {
    const labels = FORBIDDEN.map((f) => f.label);
    for (const k of ["document.cookie", "localStorage", "sessionStorage", "indexedDB", "caches", "serviceWorker", "console.log", "Math.random"]) {
      expect(labels).toContain(k);
    }
  });

  it("imports only from itself and the cipher crypto and isolation helpers", () => {
    const importRe = /(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g;
    const offenders: string[] = [];
    for (const f of files.filter((x) => /\.tsx?$/.test(x))) {
      for (const m of readFileSync(f, "utf8").matchAll(importRe)) {
        const spec = m[1];
        if (spec.startsWith("@/") || spec.startsWith("src/")) offenders.push(`${relative(srcDir, f)} -> ${spec}`);
        if (!spec.startsWith(".")) continue;
        const rel = relative(srcDir, resolve(dirname(f), spec.replace(/\?.*$/, "")));
        const inChat = rel === "chat" || rel.startsWith("chat" + sep);
        const okCipher = rel === join("cipher", "isolation") || rel.startsWith(join("cipher", "crypto") + sep);
        if (!inChat && !okCipher) offenders.push(`${relative(srcDir, f)} -> ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
