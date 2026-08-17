import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  resolve: {
    // "@/..." import alias used by the vendored shadcn/ui components.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true },
      manifest: {
        name: 'Fisac',
        short_name: 'Fisac',
        description: 'Track flows and project account balances over time',
        display: 'standalone',
        theme_color: '#2a78d6',
        background_color: '#fcfcfb',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    // Reached over plain http://localhost:5173 in development. Serving this
    // from a remote dev workspace behind a proxy additionally needs `host`
    // (vite's default bind is IPv6-only), `allowedHosts` for the proxied
    // hostname, and an `hmr` override so the websocket dials the proxy rather
    // than :5173.
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})
