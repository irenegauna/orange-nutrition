import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

// GitHub Pages serves the app from /<repo>/. Override with BASE_PATH=/ for a custom domain.
const base = process.env.BASE_PATH ?? '/orange-nutrition/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],
      manifest: {
        name: 'Orange Nutrition',
        short_name: 'Orange',
        description: 'Un diario de nutrición tranquilo, privado y que funciona sin conexión.',
        lang: 'es',
        theme_color: '#FFF9F3',
        background_color: '#FFF9F3',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // The offline USDA food catalog ships inside the bundle.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  resolve: {
    alias: [
      { find: '@backend', replacement: path.resolve(import.meta.dirname, '../nutrition_app/src/index.ts') },
      { find: '@', replacement: path.resolve(import.meta.dirname, 'src') },
      // The backend is written against the zod 3 API; zod 4 ships it as `zod/v3`.
      { find: /^zod$/, replacement: 'zod/v3' },
    ],
  },
  // The backend source lives next to this folder (../nutrition_app).
  server: { fs: { allow: ['..'] } },
})
