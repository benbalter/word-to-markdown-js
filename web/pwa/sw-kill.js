// word2md.com service worker kill switch. Shipped as dist/sw.js instead of
// sw.js when `serviceWorkerKillSwitch` is true in web/pwa/config.ts.
//
// Browsers check /sw.js for updates on navigation (and it's served no-cache),
// and pages ask for an update when the kill switch is on (PwaRegister.astro),
// so once this is deployed, every installed worker is replaced by this one,
// which takes over at once, deletes the site's caches, unregisters itself,
// and reloads open tabs so they're served straight from the network again.
// It has no fetch handler, so it never answers a request.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('w2m-')) await caches.delete(key);
      }
      await self.registration.unregister();
      const windows = await self.clients.matchAll({ type: 'window' });
      for (const client of windows) client.navigate(client.url);
    })(),
  );
});
