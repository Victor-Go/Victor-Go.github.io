import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { epochHosts } from './src/cipher/epochsHosts.ts'
import { DEFAULT_EPOCH_CURRENT, DEFAULT_EPOCH_TABLE, parseEpochs } from './src/cipher/crypto/epochs.ts'
import { connectSrc } from './src/chat/csp.ts'

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
    if (['/cipher', '/btc', '/scan', '/hash', '/pdf', '/chat', '/chat/account', '/chat/management'].includes(path)) {
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

// The chat pages may talk only to the server given at build time (VITE_CHAT_API / VITE_CHAT_WS);
// without them connect-src stays 'none'. Nothing about the server is hard-coded in the sources.
const chatConnectSrc = (): Plugin => {
  let value = "'none'"
  return {
    name: 'chat-connect-src',
    apply: 'build',
    configResolved(config) {
      const env = loadEnv(config.mode, config.envDir || config.root, 'VITE_CHAT_')
      value = connectSrc(env.VITE_CHAT_API, env.VITE_CHAT_WS)
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
  plugins: [react(), cipherDevWithoutCsp(), cipherTrailingSlash(), cipherEpochsFile(), chatConnectSrc()],
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
        chatAccount: fileURLToPath(new URL('./chat/account/index.html', import.meta.url)),
        chatManagement: fileURLToPath(new URL('./chat/management/index.html', import.meta.url)),
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
