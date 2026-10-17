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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cipherDevWithoutCsp()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        cipher: fileURLToPath(new URL('./cipher/index.html', import.meta.url)),
      },
    },
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'unsafe-none',
    },
  },
})
