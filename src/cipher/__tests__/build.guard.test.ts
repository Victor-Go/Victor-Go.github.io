// @vitest-environment node
/// <reference types="node" />
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findForbidden } from './forbidden';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const outDir = resolve(root, 'node_modules/.tmp/cipher-guard-dist');

const REQUIRED_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "worker-src 'self'",
  "connect-src 'none'",
  "img-src 'self'",
  "font-src 'none'",
  "manifest-src 'self'",
  "form-action 'none'",
  "base-uri 'none'",
];

/** Collects the files the cipher page actually loads: html, scripts, css, workers and chunks. */
function collectArtifacts(): Map<string, string> {
  const files = new Map<string, string>();
  const queue = ['cipher/index.html'];
  // Any string literal that names a built .js/.css file; resolved against dist/assets by basename.
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

describe('build guard for dist/cipher', () => {
  let html = '';
  let artifacts: Map<string, string>;

  beforeAll(() => {
    mkdirSync(outDir, { recursive: true });
    execFileSync(
      process.execPath,
      [resolve(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'],
      { cwd: root, stdio: 'pipe', env: { ...process.env, NODE_ENV: 'production' } },
    );
    html = readFileSync(join(outDir, 'cipher/index.html'), 'utf8');
    artifacts = collectArtifacts();
  }, 180_000);

  it('ships cipher/index.html with the complete CSP and privacy metas', () => {
    const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? '';
    for (const d of REQUIRED_CSP) expect(csp).toContain(d);
    expect(html).toContain('<meta name="referrer" content="no-referrer"');
    expect(html).toContain('<meta name="google" content="notranslate"');
    expect(html).toMatch(/<html[^>]*translate="no"/);
  });

  it('is app-like: no zoom, safe-area viewport, manifest and standalone meta tags', () => {
    expect(html).toMatch(/name="viewport"[^>]*user-scalable=no/);
    expect(html).toMatch(/name="viewport"[^>]*maximum-scale=1/);
    expect(html).toMatch(/name="viewport"[^>]*viewport-fit=cover/);
    expect(html).toContain('rel="manifest" href="/cipher/manifest.webmanifest"');
    expect(html).toContain('name="apple-mobile-web-app-capable"');
    const manifest = JSON.parse(readFileSync(join(outDir, 'cipher/manifest.webmanifest'), 'utf8'));
    expect(manifest.display).toBe('standalone');
    expect(manifest.scope).toBe('/cipher/');
  });

  it('has no inline scripts, inline styles or external resources', () => {
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    expect(scripts.length).toBeGreaterThan(0);
    for (const [, attrs, body] of scripts) {
      expect(attrs).toMatch(/\bsrc="\/assets\//);
      expect(body.trim()).toBe('');
    }
    expect(html).not.toMatch(/<style\b/i);
    expect(html).not.toMatch(/\sstyle=/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).not.toMatch(/(?:src|href)="https?:/i);
    expect(html).not.toContain('<form');
  });

  it('references only same-origin files that exist', () => {
    for (const m of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) {
      expect(existsSync(join(outDir, m[1]))).toBe(true);
    }
  });

  it('bundles the worker and its chunks', () => {
    const names = [...artifacts.keys()].join(' ');
    expect(artifacts.size).toBeGreaterThanOrEqual(4);
    expect(names).toMatch(/kdf\.worker/);
  });

  it('contains none of the forbidden APIs in any loaded artifact', () => {
    // React DOM derives two internal property-name suffixes from Math.random (never a secret and
    // never reaching the crypto path). Allow exactly that pattern and nothing else.
    const reactInternalKey = /Math\.random\(\)\.toString\(36\)\.slice\(2\)/g;
    // The BIP-39 English wordlist is data and contains the word "fetch". Remove exactly that literal
    // (and require it to be the 2048-word list) so the word is not mistaken for the network API.
    const wordlistLiteral = /`abandon\n[a-z\n]*?\nzoo`/g;
    const hits = [...artifacts].flatMap(([name, text]) => {
      for (const m of text.matchAll(wordlistLiteral)) expect(m[0].split('\n')).toHaveLength(2048);
      return findForbidden(text.replace(wordlistLiteral, '').replace(reactInternalKey, '')).map((h) => `${name}: ${h}`);
    });
    expect(hits).toEqual([]);
  });

  it('does not bundle main-site code (analytics, stores, Drive sync)', () => {
    for (const [name, text] of artifacts) {
      expect(text, name).not.toMatch(/googletagmanager|accounts\.google\.com|drive\.appdata|zustand/i);
    }
    expect(readdirSync(join(outDir, 'cipher'))).toContain('favicon.svg');
  });
});
