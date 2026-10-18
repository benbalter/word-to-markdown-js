import { jest } from '@jest/globals';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';
import { buildServiceWorker } from '../../web/pwa/service-worker.ts';

// The offline service worker (web/pwa/) ships on every push to main, and a bad
// one keeps running on visitors' devices until a fix reaches them. These tests
// pin the rules the e2e suite can't easily see: what's precached, that the
// counter and non-GET requests are never intercepted, that navigations stay
// network-first, and that /sw.js is never cached as immutable.

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

function fakeDist(files: string[]): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'w2m-sw-'));
  mkdirSync(path.join(dir, '_astro/fonts'), { recursive: true });
  for (const file of files) writeFileSync(path.join(dir, '_astro', file), 'x');
  return dir;
}

const CHUNKS = [
  'converter.worker-CofKiGSC.js',
  'Home.astro_astro_type_script_index_0_lang.Cr_dQ0Oq.js',
  'jszip.min.D2ELTzW1.js',
  'main.CcvMD3jf.js',
  'fonts/0869440da2f8178e.woff2',
];

describe('buildServiceWorker', () => {
  it('precaches the hashed chunks except the main-thread fallback', () => {
    const { precache, source, version } = buildServiceWorker(fakeDist(CHUNKS));
    expect(precache).toEqual([
      '/_astro/Home.astro_astro_type_script_index_0_lang.Cr_dQ0Oq.js',
      '/_astro/converter.worker-CofKiGSC.js',
      '/_astro/jszip.min.D2ELTzW1.js',
    ]);
    expect(version).toMatch(/^[0-9a-f]{12}$/);
    expect(source).toContain(`const VERSION = '${version}';`);
    expect(source).toContain(`const PRECACHE = ${JSON.stringify(precache)};`);
    expect(source).not.toContain('__SW_');
  });

  it('changes version when a chunk changes', () => {
    const a = buildServiceWorker(fakeDist(CHUNKS));
    const b = buildServiceWorker(
      fakeDist(CHUNKS.map((f) => f.replace('CofKiGSC', 'Zz9kQ1aB'))),
    );
    expect(a.version).not.toBe(b.version);
  });

  it('kill switch ships a worker that unregisters and never answers fetches', () => {
    const { source, precache } = buildServiceWorker(fakeDist(CHUNKS), {
      killSwitch: true,
    });
    expect(precache).toEqual([]);
    expect(source).toContain('registration.unregister()');
    expect(source).toContain('skipWaiting()');
    expect(source).not.toMatch(/addEventListener\(\s*'fetch'/);
  });
});

// Run the generated worker in a sandbox with fake caches and fetch.
type Listener = (event: unknown) => void;

function asPage(
  body: string,
  { redirected = false, type = 'text/html; charset=utf-8', status = 200 } = {},
): Response {
  const response = new Response(body, {
    status,
    headers: { 'content-type': type },
  });
  Object.defineProperty(response, 'type', { value: 'basic' });
  Object.defineProperty(response, 'redirected', { value: redirected });
  return response;
}

function loadWorker(fetchImpl: (url: string) => Promise<Response>) {
  const listeners: Record<string, Listener> = {};
  const stores = new Map<string, Map<string, Response>>();
  const key = (req: string | Request) =>
    (typeof req === 'string' ? req : req.url).split('?')[0];
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      match: async (req: string | Request) => store.get(key(req))?.clone(),
      put: async (req: string | Request, res: Response) => {
        store.set(key(req), res);
      },
      keys: async () => [...store.keys()].map((url) => new Request(url)),
      addAll: async (urls: string[]) => {
        for (const url of urls)
          store.set(`https://word2md.com${url}`, asPage(url));
      },
    };
  };
  const fetchMock = jest.fn((req: string | Request) =>
    fetchImpl(typeof req === 'string' ? req : req.url),
  );
  const self = {
    addEventListener: (type: string, fn: Listener) => {
      listeners[type] = fn;
    },
    location: { origin: 'https://word2md.com' },
    registration: {},
    clients: { matchAll: async () => [] },
  };
  const { source } = buildServiceWorker(fakeDist(CHUNKS));
  vm.runInNewContext(source, {
    self,
    caches: { open, keys: async () => [...stores.keys()] },
    fetch: fetchMock,
    URL,
    Request,
    Response,
  });

  async function dispatch(
    url: string,
    init: { method?: string; mode?: string } = {},
  ) {
    const request = {
      url,
      method: init.method ?? 'GET',
      mode: init.mode ?? 'cors',
    };
    let responded: Promise<Response> | undefined;
    const waits: Promise<unknown>[] = [];
    listeners.fetch({
      request,
      preloadResponse: Promise.resolve(undefined),
      respondWith: (p: Promise<Response>) => {
        responded = p;
      },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    const response = responded ? await responded : undefined;
    await Promise.all(waits);
    return response;
  }

  return { dispatch, fetchMock, open, stores };
}

describe('service worker fetch handling', () => {
  const offline = () => Promise.reject(new TypeError('Failed to fetch'));

  it('never intercepts the counter, non-GET requests, or other origins', async () => {
    const { dispatch } = loadWorker(offline);
    expect(
      await dispatch('https://word2md.com/api/event?o=success&l=en'),
    ).toBeUndefined();
    expect(
      await dispatch('https://word2md.com/api/event', { mode: 'navigate' }),
    ).toBeUndefined();
    expect(
      await dispatch('https://word2md.com/', {
        method: 'POST',
        mode: 'navigate',
      }),
    ).toBeUndefined();
    expect(
      await dispatch('https://static.cloudflareinsights.com/beacon.min.js'),
    ).toBeUndefined();
    // Not a navigation and not under /_astro/: left to the network.
    expect(await dispatch('https://word2md.com/favicon.svg')).toBeUndefined();
  });

  it('serves navigations from the network and caches only plain HTML pages', async () => {
    const pages: Record<string, Response> = {
      'https://word2md.com/': asPage('<p>de</p>', { redirected: true }),
      'https://word2md.com/de/': asPage('<p>de</p>'),
    };
    const { dispatch, fetchMock, open, stores } = loadWorker(
      async (url) => pages[url],
    );
    expect(
      await (await dispatch('https://word2md.com/', {
        mode: 'navigate',
      }))!.text(),
    ).toBe('<p>de</p>');
    await dispatch('https://word2md.com/de/', { mode: 'navigate' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const pagesCache = [...stores.keys()].find((k) =>
      k.startsWith('w2m-pages-'),
    )!;
    const cached = await (await open(pagesCache)).keys();
    // The redirected "/" isn't stored; /de/ is.
    expect(cached.map((r) => r.url)).toEqual(['https://word2md.com/de/']);
  });

  it('falls back to the cached page offline, and to a cached home page for "/"', async () => {
    let online = true;
    const { dispatch } = loadWorker(async (url) => {
      if (!online) throw new TypeError('Failed to fetch');
      return asPage(`<p>${url}</p>`);
    });
    await dispatch('https://word2md.com/de/', { mode: 'navigate' });
    await dispatch('https://word2md.com/privacy/', { mode: 'navigate' });
    online = false;
    expect(
      await (await dispatch('https://word2md.com/privacy/', {
        mode: 'navigate',
      }))!.text(),
    ).toBe('<p>https://word2md.com/privacy/</p>');
    expect(
      await (await dispatch('https://word2md.com/', {
        mode: 'navigate',
      }))!.text(),
    ).toBe('<p>https://word2md.com/de/</p>');
    await expect(
      dispatch('https://word2md.com/terms/', { mode: 'navigate' }),
    ).rejects.toThrow('Failed to fetch');
  });

  it('does not cache error pages', async () => {
    const { dispatch, open, stores } = loadWorker(async () =>
      asPage('<p>404</p>', { status: 404 }),
    );
    await dispatch('https://word2md.com/nope/', { mode: 'navigate' });
    const pagesCache = [...stores.keys()].find((k) =>
      k.startsWith('w2m-pages-'),
    );
    const stored = pagesCache ? await (await open(pagesCache)).keys() : [];
    expect(stored).toEqual([]);
  });

  it('serves hashed assets from the cache before the network', async () => {
    const { dispatch, fetchMock } = loadWorker(async (url) =>
      asPage(`fetched ${url}`, { type: 'font/woff2' }),
    );
    // A font isn't precached: the first request fills the cache, the second
    // never reaches the network.
    const url = 'https://word2md.com/_astro/fonts/0869440da2f8178e.woff2';
    expect(await (await dispatch(url))!.text()).toBe(`fetched ${url}`);
    expect(await (await dispatch(url))!.text()).toBe(`fetched ${url}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('PWA static files', () => {
  it('serves /sw.js no-cache, never as an immutable asset', () => {
    const headers = readFileSync(path.join(root, 'public/_headers'), 'utf8');
    const block = headers.split(/\n(?=\S)/).find((b) => b.startsWith('/sw.js'));
    expect(block).toMatch(/^\s+Cache-Control: no-cache$/m);
  });

  it('has a manifest whose icons exist at the declared sizes', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(root, 'public/manifest.webmanifest'), 'utf8'),
    );
    expect(manifest).toMatchObject({
      id: '/',
      start_url: '/',
      scope: '/',
      display: 'standalone',
    });
    for (const icon of manifest.icons) {
      const png = readFileSync(path.join(root, 'public', icon.src));
      // PNG IHDR: width and height are big-endian at bytes 16 and 20.
      const size = `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
      expect(size).toBe(icon.sizes);
    }
    expect(
      manifest.icons.some(
        (i: { purpose?: string }) => i.purpose === 'maskable',
      ),
    ).toBe(true);
  });
});
