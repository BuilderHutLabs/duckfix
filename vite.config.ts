/// <reference types="vitest/config" />
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/** public/calibrate.html is a dev-only OSD calibration page: keep it for `vite dev`, drop it from production dist/. */
function dropDevOnlyPages(): Plugin {
  return {
    name: 'wduck:drop-dev-only-pages',
    apply: 'build',
    closeBundle: {
      order: 'pre',
      handler() {
        rmSync(resolve(__dirname, 'dist/calibrate.html'), { force: true });
      },
    },
  };
}

const THEME_COLOR = '#f2f2f7';

export default defineConfig({
  base: '/duckfix/',
  plugins: [
    react(),
    dropDevOnlyPages(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'DuckFix',
        short_name: 'DuckFix',
        description: 'Automatyczne obracanie i prostowanie skanów PDF',
        lang: 'pl',
        start_url: '/duckfix/',
        scope: '/duckfix/',
        display: 'standalone',
        theme_color: THEME_COLOR,
        background_color: THEME_COLOR,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // pdf.js worker is a .mjs; tesseract core loaders are *.wasm.js; traineddata must be cached for offline OSD
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,wasm,traineddata}'],
        globIgnores: ['calibrate.html'],
        maximumFileSizeToCacheInBytes: 40 * 1024 * 1024,
      },
    }),
  ],
  test: {
    // the virtual module only exists in real builds; tests render <App /> without a service worker
    alias: { 'virtual:pwa-register/react': resolve(__dirname, 'tests/helpers/pwa-register-stub.ts') },
    environment: 'jsdom',
    globals: true,
  },
});
