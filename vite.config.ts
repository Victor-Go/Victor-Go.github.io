import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { epochHosts } from './src/cipher/epochsHosts.ts'
import { DEFAULT_EPOCH_CURRENT, DEFAULT_EPOCH_TABLE, parseEpochs } from './src/cipher/crypto/epochs.ts'
import { connectSrc } from './src/chat/csp.ts'
import { CHAT_PATHS } from './src/chat/paths.ts'

// The dev server injects inline scripts (React refresh preamble) that the strict
// /cipher CSP forbids, so the CSP meta is dropped for `vite dev` only. Built output keeps it.
const cipherDevWithoutCsp = (): Plugin => ({
  name: 'cipher-dev-without-csp',
  apply: 'serve',
  transformIndexHtml(html) {
    return html.replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/, '')
  },
})

// GitHub Pages already redirects /cipher, /btc, /scan, /hash and /pdf to their trailing-slash form; mirror that for dev and preview servers.
const cipherTrailingSlash = (): Plugin => {
  const redirect = (req: { url?: string }, res: { statusCode: number; setHeader(k: string, v: string): void; end(): void }, next: () => void) => {
    const [path, query = ''] = (req.url ?? '').split('?')
    if (['/cipher', '/btc', '/scan', '/hash', '/pdf', '/chat', ...CHAT_PATHS.filter((p) => p !== '/chat/').map((p) => p.slice(0, -1))].includes(path)) {
      res.statusCode = 301
      res.setHeader('Location', path + '/' + (query ? '?' + query : ''))
      res.end()
      return
    }
    next()
  }
  return {
    name: 'cipher-trailing-slash',
    configureServer: (server) => void server.middlewares.use(redirect),
    configurePreviewServer: (server) => void server.middlewares.use(redirect),
  }
}

// Every screen of /chat has its own address, but the host is static (a reload or a shared link at /chat/settings/ must not be a 404):
// each address is served by the one app page. Dev and preview rewrite the request; the build writes a copy of the page into each folder.
const chatScreens = (): Plugin => {
  const rewrite = (req: { url?: string }, _res: unknown, next: () => void) => {
    const [path, query = ''] = (req.url ?? '').split('?')
    if (CHAT_PATHS.includes(path) && path !== '/chat/') req.url = '/chat/' + (query ? '?' + query : '')
    next()
  }
  let outDir = 'dist'
  return {
    name: 'chat-screens',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    configureServer: (server) => void server.middlewares.use(rewrite),
    configurePreviewServer: (server) => void server.middlewares.use(rewrite),
    writeBundle() {
      const page = readFileSync(join(outDir, 'chat', 'index.html'))
      for (const path of CHAT_PATHS) {
        if (path === '/chat/') continue
        const dir = join(outDir, path)
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, 'index.html'), page)
      }
    },
  }
}

// The epoch table is emitted as a separate classic script, loaded by a same-origin <script src>
// (connect-src 'none' stays in place). It defines the global only on the hosts from epochHosts().
const CIPHER_EPOCHS_FILE = 'assets/cipher-epochs.js'

// A malformed epoch table would make every ciphertext undecryptable, so fail the build instead.
const cipherEpochsFile = (): Plugin => {
  let source = ''
  return {
    name: 'cipher-epochs-file',
    apply: 'build',
    configResolved(config) {
      // loadEnv lets process.env (CI) win over .env files (local builds).
      const env = loadEnv(config.mode, config.envDir || config.root, 'VITE_CIPHER_')
      const table = env.VITE_CIPHER_EPOCHS || DEFAULT_EPOCH_TABLE
      const current = env.VITE_CIPHER_EPOCH_CURRENT || DEFAULT_EPOCH_CURRENT
      try {
        parseEpochs(table, current)
      } catch (e) {
        throw new Error(e instanceof Error ? e.message : 'Invalid cipher epoch configuration')
      }
      source =
        `if(${JSON.stringify(epochHosts(process.env.GITHUB_ACTIONS === 'true'))}.indexOf(location.hostname)>=0)` +
        `self.__cipherEpochs=${JSON.stringify([table, current])};\n`
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: CIPHER_EPOCHS_FILE, source })
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!/[\\/]cipher[\\/]index\.html$/.test(ctx.filename)) return
        // Placed right after the CSP meta so it precedes the module script Vite adds to <head>.
        return html.replace(
          /(<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>)/,
          `$1\n    <script src="/${CIPHER_EPOCHS_FILE}"></script>`,
        )
      },
    },
  }
}

// The chat pages may talk only to the server given at build time (VITE_CHAT_API / VITE_CHAT_WS) and to the
// storage origin that holds voice recordings (VITE_CHAT_VOICE_ORIGIN, the server's Terraform output `voice_origin`);
// without them connect-src stays 'none'. Nothing about the server is hard-coded in the sources.
const chatConnectSrc = (): Plugin => {
  let value = "'none'"
  return {
    name: 'chat-connect-src',
    apply: 'build',
    configResolved(config) {
      const env = loadEnv(config.mode, config.envDir || config.root, 'VITE_CHAT_')
      value = connectSrc(env.VITE_CHAT_API, env.VITE_CHAT_WS, env.VITE_CHAT_VOICE_ORIGIN)
    },
    transformIndexHtml: {
      order: 'post',
      handler: (html) => html.replace('__CHAT_CONNECT__', value),
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: { __CHAT_COMMIT__: JSON.stringify((process.env.GITHUB_SHA ?? 'dev').slice(0, 7)) },
  plugins: [react(), cipherDevWithoutCsp(), cipherTrailingSlash(), chatScreens(), cipherEpochsFile(), chatConnectSrc()],
  build: {
    // The polyfill issues network requests for modulepreload links, which /cipher's CSP forbids;
    // every supported browser has native modulepreload.
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        cipher: fileURLToPath(new URL('./cipher/index.html', import.meta.url)),
        btc: fileURLToPath(new URL('./btc/index.html', import.meta.url)),
        scan: fileURLToPath(new URL('./scan/index.html', import.meta.url)),
        hash: fileURLToPath(new URL('./hash/index.html', import.meta.url)),
        pdf: fileURLToPath(new URL('./pdf/index.html', import.meta.url)),
        chat: fileURLToPath(new URL('./chat/index.html', import.meta.url)),
      },
    },
  },
  server: {
    port: 3000,
    headers: {
      'Cross-Origin-Opener-Policy': 'unsafe-none',
    },
  },
  preview: {
    port: 3000,
  },
})
