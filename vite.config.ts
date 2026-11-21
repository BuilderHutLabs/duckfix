/// <reference types="vitest/config" />
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { namespaceHtml } from './scripts/html-ns.mjs';

// Test link (duckfix-v2): base path, app name and storage namespace come from the environment.
const BASE = process.env.VITE_BASE || '/duckfix/';
const APP_NAME = process.env.VITE_APP_NAME || 'DuckFix';
const STORAGE_NS = process.env.VITE_STORAGE_NS ?? '';

function namespaceInlineScript(): Plugin {
  return { name: 'duckfix:namespace-inline-script', transformIndexHtml: (html) => namespaceHtml(html, STORAGE_NS).replaceAll('__APP_NAME__', APP_NAME) };
}

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
  base: BASE,
  plugins: [
    react(),
    dropDevOnlyPages(),
    namespaceInlineScript(),
    VitePWA({
      registerType: 'prompt',
      // own service worker (src/sw.ts): it also receives files shared from other apps
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: APP_NAME,
        short_name: APP_NAME,
        description: 'Automatyczne obracanie i prostowanie skanów PDF',
        lang: 'pl',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        theme_color: THEME_COLOR,
        background_color: THEME_COLOR,
        // "Udostępnij do DuckFix" from other apps (Android) and "Otwórz za pomocą" (installed app)
        share_target: {
          action: `${BASE}share-target`,
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { files: [{ name: 'files', accept: ['application/pdf', '.pdf', 'image/*'] }] },
        },
        file_handlers: [
          {
            action: BASE,
            accept: { 'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] },
          },
        ],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        // pdf.js worker is a .mjs; tesseract core loaders are *.wasm.js; traineddata must be cached for offline OSD
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,wasm,traineddata}'],
        // deu/spa (searchable text in German/Spanish) are cached on first use, not at install (see src/sw.ts)
        globIgnores: ['calibrate.html', 'tessdata/deu.traineddata', 'tessdata/spa.traineddata'],
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
