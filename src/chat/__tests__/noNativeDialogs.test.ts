// @vitest-environment node
/// <reference types="node" />
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const chatDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe("the chat uses its own dialogs", () => {
  it("never calls the browser's alert, confirm or prompt", () => {
    const found: string[] = [];
    for (const file of walk(chatDir)) {
      const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      if (/(^|[^.\w])(window\.)?(alert|confirm|prompt)\s*\(/.test(code)) found.push(file.slice(chatDir.length));
    }
    expect(found).toEqual([]);
  });
});
