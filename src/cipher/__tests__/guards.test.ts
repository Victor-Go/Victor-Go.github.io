// @vitest-environment node
/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORBIDDEN, findForbidden } from './forbidden';

const here = dirname(fileURLToPath(import.meta.url));
const cipherDir = resolve(here, '..');
const srcDir = resolve(cipherDir, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : walk(p);
    return /\.(ts|tsx|css|html)$/.test(name) ? [p] : [];
  });
}

function resolves(target: string): boolean {
  return (
    existsSync(target) ||
    ['.ts', '.tsx', '.css', '.js'].some((e) => existsSync(target + e)) ||
    existsSync(join(target, 'index.ts')) ||
    existsSync(join(target, 'index.tsx'))
  );
}

describe('static source guard for src/cipher', () => {
  const files = walk(cipherDir);

  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it('contains none of the forbidden APIs', () => {
    const hits = files.flatMap((f) => findForbidden(readFileSync(f, 'utf8')).map((h) => `${relative(srcDir, f)}: ${h}`));
    expect(hits).toEqual([]);
  });

  it('forbidden list covers the required names', () => {
    const labels = FORBIDDEN.map((f) => f.label);
    for (const k of ['document.cookie', 'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'serviceWorker', 'window.name', 'fetch', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'EventSource', 'gtag', 'console.log', 'Math.random']) {
      expect(labels).toContain(k);
    }
  });

  it('never imports from other src/ directories', () => {
    const importRe = /(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g;
    const offenders: string[] = [];
    for (const f of files.filter((x) => /\.tsx?$/.test(x))) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(importRe)) {
        const spec = m[1];
        if (spec.startsWith('@/') || spec.startsWith('src/')) offenders.push(`${relative(srcDir, f)} -> ${spec}`);
        if (!spec.startsWith('.')) continue;
        const target = resolve(dirname(f), spec.replace(/\?.*$/, ''));
        const rel = relative(cipherDir, target);
        if (rel === '..' || rel.startsWith('..' + sep)) offenders.push(`${relative(srcDir, f)} -> ${spec}`);
        else if (!resolves(target)) offenders.push(`${relative(srcDir, f)} -> ${spec} (unresolved)`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
