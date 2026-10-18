// @vitest-environment node
/// <reference types="node" />
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findForbidden } from '../../cipher/__tests__/forbidden';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const outDir = resolve(root, 'node_modules/.tmp/btc-guard-dist');

const REQUIRED_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'none'",
  "img-src 'self'",
  "form-action 'none'",
  "base-uri 'none'",
];

function collectArtifacts(): Map<string, string> {
  const files = new Map<string, string>();
  const queue = ['btc/index.html'];
  const refRe = /[`"'(]((?:[./]*(?:assets\/)?)[A-Za-z0-9_.-]+\.(?:js|css))[`"')]/g;
  while (queue.length) {
    const rel = queue.pop()!;
    if (files.has(rel)) continue;
    const p = join(outDir, rel);
    if (!existsSync(p)) continue;
    const text = readFileSync(p, 'utf8');
    files.set(rel, text);
    if (rel.endsWith('.css')) continue;
    for (const m of text.matchAll(refRe)) {
      const base = m[1].split('/').pop()!;
      if (existsSync(join(outDir, 'assets', base))) queue.push(`assets/${base}`);
    }
  }
  return files;
}

describe('build guard for dist/btc', () => {
  let html = '';
  let artifacts: Map<string, string>;

  beforeAll(() => {
    mkdirSync(outDir, { recursive: true });
    execFileSync(
      process.execPath,
      [resolve(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'],
      { cwd: root, stdio: 'pipe', env: { ...process.env, NODE_ENV: 'production' } },
    );
    html = readFileSync(join(outDir, 'btc/index.html'), 'utf8');
    artifacts = collectArtifacts();
  }, 180_000);

  it('ships btc/index.html with the strict CSP and a manifest scoped to /btc/', () => {
    const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? '';
    for (const d of REQUIRED_CSP) expect(csp).toContain(d);
    expect(html).toContain('<meta name="referrer" content="no-referrer"');
    const manifest = JSON.parse(readFileSync(join(outDir, 'btc/manifest.webmanifest'), 'utf8'));
    expect(manifest.scope).toBe('/btc/');
    expect(manifest.start_url).toBe('/btc/');
  });

  it('has no inline scripts or external resources', () => {
    for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      expect(attrs).toMatch(/\bsrc="\/assets\//);
      expect(body.trim()).toBe('');
    }
    expect(html).not.toMatch(/<style\b/i);
    expect(html).not.toMatch(/(?:src|href)="https?:/i);
  });

  it('contains none of the forbidden APIs in any loaded artifact', () => {
    const reactInternalKey = /Math\.random\(\)\.toString\(36\)\.slice\(2\)/g;
    const wordlistLiteral = /`abandon\n[a-z\n]*?\nzoo`/g;
    expect(artifacts.size).toBeGreaterThanOrEqual(2);
    const hits = [...artifacts].flatMap(([name, text]) =>
      findForbidden(text.replace(wordlistLiteral, '').replace(reactInternalKey, '')).map((h) => `${name}: ${h}`),
    );
    expect(hits).toEqual([]);
  });
});
