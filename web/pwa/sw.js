// word2md.com service worker: lets the converter work offline after a first
// visit. This is a template: web/pwa/service-worker.ts fills in VERSION and
// PRECACHE at build time and writes the result to dist/sw.js.
//
// Ground rules, since every push to main deploys and a bad service worker is
// hard to recall (see the kill switch in service-worker.ts):
// - Navigations are network-first, so "/" still reaches the Cloudflare
//   Worker's locale redirect and banner tagging. The cached copy is only an
//   offline fallback.
// - Only content-hashed /_astro/ assets are served cache-first.
// - /api/ (the anonymous conversion counter) and anything that isn't a
//   same-origin GET pass straight through. Documents are read locally and never
//   fetched, so they can't end up in a cache.
// - No skipWaiting: a new version waits until every tab on the old one closes,
//   so an open tab keeps the chunks it was built against.
const VERSION = '__SW_VERSION__';
const PRECACHE = /* __SW_PRECACHE__ */ [];

const PREFIX = 'w2m-';
const ASSETS = `${PREFIX}assets-${VERSION}`;
const PAGES = `${PREFIX}pages-${VERSION}`;

// A page worth keeping for offline use: a 200 from this origin that isn't
// the result of a redirect ("/" may 302 to a locale) and is HTML.
function isCacheablePage(response) {
  return (
    response.ok &&
    response.type === 'basic' &&
    !response.redirected &&
    (response.headers.get('content-type') || '').includes('text/html')
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const assets = await caches.open(ASSETS);
      await assets.addAll(PRECACHE);
      // The page that registered this worker loaded before it existed, so its
      // HTML never passed through the fetch handler. Fetch the open pages now so
      // a first visit is enough to work offline.
      const pages = await caches.open(PAGES);
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      await Promise.all(
        windows.map(async ({ url }) => {
          try {
            const response = await fetch(url, { credentials: 'same-origin' });
            if (isCacheablePage(response)) await pages.put(url, response);
          } catch {
            // Offline or blocked: the next online navigation caches the page.
          }
        }),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([ASSETS, PAGES]);
      for (const key of await caches.keys()) {
        if (key.startsWith(PREFIX) && !keep.has(key)) await caches.delete(key);
      }
      // Start the network request for a navigation while the worker boots.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
    })(),
  );
});

// "/" redirects online, so someone who only ever saw /de/ has no cached "/".
// Offline, the closest thing to that redirect is the home page they did see.
async function cachedHomePage(pages) {
  const homes = (await pages.keys()).filter((request) =>
    /^\/(?:[a-z]{2}(?:-[a-z]+)?\/)?$/.test(new URL(request.url).pathname),
  );
  return homes.length > 0 ? pages.match(homes[homes.length - 1]) : undefined;
}

async function networkFirst(event) {
  const { request } = event;
  try {
    const response = (await event.preloadResponse) || (await fetch(request));
    if (isCacheablePage(response)) {
      const copy = response.clone();
      event.waitUntil(
        caches.open(PAGES).then((pages) => pages.put(request.url, copy)),
      );
    }
    return response;
  } catch (error) {
    const pages = await caches.open(PAGES);
    const cached =
      (await pages.match(request.url, { ignoreSearch: true })) ||
      (new URL(request.url).pathname === '/'
        ? await cachedHomePage(pages)
        : undefined);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(event) {
  const { request } = event;
  const assets = await caches.open(ASSETS);
  // Hashed filenames never change, so Vary can't make a stored copy wrong.
  const cached = await assets.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  // Keep chunks loaded on demand (fonts, the main-thread fallback) too.
  if (response.ok && response.type === 'basic') {
    event.waitUntil(assets.put(request, response.clone()));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(event));
  } else if (url.pathname.startsWith('/_astro/')) {
    event.respondWith(cacheFirst(event));
  }
});
