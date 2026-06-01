import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' so we can show a "New version — Reload" toast instead of
      // silently swapping the bundle (which left users stuck on stale code).
      registerType: 'prompt',
      injectRegister: false, // we register via the useRegisterSW React hook
      includeAssets: ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Coffee ERP',
        short_name: 'Coffee ERP',
        description: 'Coffee supply-chain ERP — purchase, warehouse, processing & export',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#2E1A12',
        theme_color: '#2E1A12',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // Precache the built app shell so it opens with no network.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // The main bundle is ~2.6 MB; raise the precache ceiling so it's cached.
        // (Code-splitting later would shrink this — tracked as a perf follow-up.)
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Don't let the SW try to serve API/auth calls from cache.
        navigateFallbackDenylist: [/^\/auth/, /^\/rest/],
        runtimeCaching: [
          {
            // Google Fonts stylesheets — stale-while-revalidate.
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            // Google Fonts files — cache-first, long-lived.
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      // Dev: keep SW off by default so HMR isn't cached. Enable manually to test.
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
