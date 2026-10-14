import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages servíruje projekt pod /<repo>/. Workflow nastaví BASE_PATH,
// lokálně se jede z kořene.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Sosáč TV (neoficiální)',
        short_name: 'Sosáč TV',
        description: 'Neoficiální klient pro Sosáč a Streamuj.tv',
        lang: 'cs',
        // Telefon je hlavní zařízení: standalone (se stavovým řádkem), libovolná orientace.
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // Do cache jen shell aplikace. Diagnostická stránka v ní být nemusí.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/diagnostics*'],
        navigateFallbackDenylist: [/diagnostics/],
        runtimeCaching: [
          {
            // Plakáty a fanarty: cache-first, nemění se.
            urlPattern: /^https:\/\/kodi-api\.sosac\.to\/obrazky\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'sosac-images',
              expiration: { maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // API a streamy záměrně necachujeme: data jsou osobní a odkazy na video
          // jsou časově a IP omezené.
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        diagnostics: resolve(import.meta.dirname, 'diagnostics.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
