import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true },
      manifest: {
        name: 'fisac',
        short_name: 'fisac',
        description: 'Flux, TVA et projection de solde',
        lang: 'fr',
        display: 'standalone',
        // The one place a literal colour is unavoidable: the manifest can't
        // read CSS tokens. Terracotta --clay-600 and cream --cream-100.
        theme_color: '#B04A2A',
        background_color: '#F9F5ED',
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
