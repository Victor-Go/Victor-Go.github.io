// @vitest-environment node
/// <reference types="node" />
import { describe, it, expect, beforeAll } from 'vitest';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findForbidden } from './forbidden';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const outDir = resolve(root, 'node_modules/.tmp/cipher-guard-dist');

/** Distinctive fake epoch constant; must appear only in assets/cipher-epochs.js. */
const MARKER = 'ZZmarkerZZ';
const EPOCHS_FILE = 'assets/cipher-epochs.js';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const REQUIRED_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "worker-src 'self'",
  "connect-src 'none'",
  "img-src 'self' blob:",
  "media-src blob:",
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
      { cwd: root, stdio: 'pipe', env: { ...process.env, NODE_ENV: 'production', VITE_CIPHER_EPOCHS: `0,2:${MARKER}`, VITE_CIPHER_EPOCH_CURRENT: '2', GITHUB_ACTIONS: 'true' } },
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

  it('allows browser zoom while keeping safe-area viewport, manifest and standalone meta tags', () => {
    expect(html).not.toMatch(/user-scalable=no/);
    expect(html).not.toMatch(/maximum-scale=1/);
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

  it('ships the epoch table only as a separate script, loaded before the module script', () => {
    const file = readFileSync(join(outDir, EPOCHS_FILE), 'utf8');
    expect(file).toContain(MARKER);
    const leaks = walk(outDir).filter((p) => p !== join(outDir, EPOCHS_FILE) && readFileSync(p).includes(MARKER));
    expect(leaks).toEqual([]);
    const epochsAt = html.indexOf('src="/assets/cipher-epochs.js"');
    const moduleAt = html.search(/<script[^>]*type="module"/);
    expect(epochsAt).toBeGreaterThan(-1);
    expect(moduleAt).toBeGreaterThan(epochsAt);
    // Only the cipher page loads it.
    for (const other of ['index.html', 'btc/index.html', 'scan/index.html', 'hash/index.html']) {
      expect(readFileSync(join(outDir, other), 'utf8')).not.toContain('cipher-epochs');
    }
    expect(html).toContain("connect-src 'none'");
  });

  it('defines the epoch global only on allow-listed hosts', () => {
    const file = readFileSync(join(outDir, EPOCHS_FILE), 'utf8');
    const run = (hostname: string) => {
      const ctx: Record<string, unknown> = { location: { hostname } };
      ctx.self = ctx;
      vm.runInNewContext(file, ctx);
      return ctx.__cipherEpochs;
    };
    expect(run('victor-go.github.io')).toEqual([`0,2:${MARKER}`, '2']);
    for (const h of ['localhost', '127.0.0.1', 'evil.example', 'victor-go.github.io.evil.example']) expect(run(h)).toBeUndefined();
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
