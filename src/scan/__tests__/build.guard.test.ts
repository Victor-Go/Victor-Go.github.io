// @vitest-environment node
/// <reference types="node" />
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORBIDDEN } from '../../cipher/__tests__/forbidden';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const scanDir = resolve(root, 'src/scan');
const outDir = resolve(root, 'node_modules/.tmp/scan-guard-dist');

// /scan must talk to exactly these hosts and nothing else; it may use fetch (only in api.ts)
// and write public lookups to the address bar (pushState/replaceState, see Scanner.tsx `inUrl`),
// but every storage, tracking and logging API stays forbidden.
const HOSTS = ['https://mempool.space', 'https://blockstream.info'];
const ALLOWED_HERE = new Set(['fetch', 'pushState', 'replaceState']);
const STILL_FORBIDDEN = FORBIDDEN.filter((f) => !ALLOWED_HERE.has(f.label));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : walk(p);
    return /\.(ts|tsx|css|html)$/.test(name) ? [p] : [];
  });
}

describe('static source guard for src/scan', () => {
  const files = walk(scanDir);

  it('uses no storage, tracking, logging or other network APIs', () => {
    const hits = files.flatMap((f) =>
      STILL_FORBIDDEN.filter((x) => x.re.test(readFileSync(f, 'utf8'))).map((x) => `${relative(scanDir, f)}: ${x.label}`),
    );
    expect(hits).toEqual([]);
  });

  it('calls fetch only from api.ts', () => {
    const users = files.filter((f) => /\bfetch\b/.test(readFileSync(f, 'utf8'))).map((f) => relative(scanDir, f));
    expect(users).toEqual(['api.ts']);
  });

  it('names no host other than the allowed providers', () => {
    const urls = files.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/https?:\/\/[^\s"'`)/]+/g)].map((m) => m[0]));
    expect(urls.filter((u) => !HOSTS.includes(u))).toEqual([]);
  });
});

describe('build guard for dist/scan', () => {
  let html = '';

  beforeAll(() => {
    mkdirSync(outDir, { recursive: true });
    execFileSync(
      process.execPath,
      [resolve(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'],
      { cwd: root, stdio: 'pipe', env: { ...process.env, NODE_ENV: 'production' } },
    );
    html = readFileSync(join(outDir, 'scan/index.html'), 'utf8');
  }, 180_000);

  it('ships a CSP that only lets the page talk to the two providers', () => {
    const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? '';
    for (const d of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self'", "form-action 'none'", "base-uri 'none'"]) {
      expect(csp).toContain(d);
    }
    const connect = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith('connect-src')) ?? '';
    expect(connect.split(/\s+/).slice(1).sort()).toEqual([...HOSTS].sort());
    expect(html).toContain('<meta name="referrer" content="no-referrer"');
  });

  it('has no inline scripts or external resources, and no forbidden API in its bundle', () => {
    for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      expect(attrs).toMatch(/\bsrc="\/assets\//);
      expect(body.trim()).toBe('');
    }
    expect(html).not.toMatch(/<style\b/i);
    expect(html).not.toMatch(/(?:src|href)="https?:/i);
    const entry = html.match(/src="\/(assets\/[^"]+\.js)"/)?.[1];
    expect(entry && existsSync(join(outDir, entry))).toBeTruthy();
  });
});
