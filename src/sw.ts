/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { keepSharedFiles } from './share/shared';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

// "Udostępnij do DuckFix": keep the shared files, then open the app, which picks them up
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || !url.pathname.endsWith('/share-target')) return;
  event.respondWith(
    (async () => {
      try {
        await keepSharedFiles(caches, self.registration.scope, await event.request.formData());
      } catch {
        // nothing usable was shared: just open the app
      }
      return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
    })(),
  );
});

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
// the app is one page: every navigation inside the scope gets index.html (offline too)
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// searchable text in German / Spanish: traineddata cached on first use, not at install
registerRoute(
  ({ url }) => /\/tessdata\/(deu|spa)\.traineddata$/.test(url.pathname),
  new CacheFirst({ cacheName: 'duckfix-ocr-langs', plugins: [new ExpirationPlugin({ maxEntries: 4 })] }),
);

// "Odśwież" in the update prompt
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});
