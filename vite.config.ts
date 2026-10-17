import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// The dev server injects inline scripts (React refresh preamble) that the strict
// /cipher CSP forbids, so the CSP meta is dropped for `vite dev` only. Built output keeps it.
const cipherDevWithoutCsp = (): Plugin => ({
  name: 'cipher-dev-without-csp',
  apply: 'serve',
  transformIndexHtml(html) {
    return html.replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/, '')
  },
})

// GitHub Pages already redirects /cipher to /cipher/; mirror that for dev and preview servers.
const cipherTrailingSlash = (): Plugin => {
  const redirect = (req: { url?: string }, res: { statusCode: number; setHeader(k: string, v: string): void; end(): void }, next: () => void) => {
    const [path, query = ''] = (req.url ?? '').split('?')
    if (path === '/cipher') {
      res.statusCode = 301
      res.setHeader('Location', '/cipher/' + (query ? '?' + query : ''))
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cipherDevWithoutCsp(), cipherTrailingSlash()],
  build: {
    // The polyfill issues network requests for modulepreload links, which /cipher's CSP forbids;
    // every supported browser has native modulepreload.
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        cipher: fileURLToPath(new URL('./cipher/index.html', import.meta.url)),
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
