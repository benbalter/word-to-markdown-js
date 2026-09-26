import { jest } from '@jest/globals';
import worker from '../../worker/index.js';

// Tests for the Cloudflare Worker fetch handler (worker/index.js): the anonymous
// conversion counter at /api/event, asset passthrough, and the (unchanged) root
// locale redirect. pickLocale's matching logic is covered separately in
// i18n-redirect.test.ts. Request/Response/URL are Node globals here. `jest` is
// imported explicitly because it is not injected as a global under ESM.

interface MockEnv {
  EVENTS?: { writeDataPoint: ReturnType<typeof jest.fn> };
  ASSETS: { fetch: ReturnType<typeof jest.fn> };
}

function makeEnv(overrides: Partial<MockEnv> = {}): MockEnv {
  return {
    EVENTS: { writeDataPoint: jest.fn() },
    ASSETS: {
      fetch: jest.fn(async () => new Response('asset', { status: 200 })),
    },
    ...overrides,
  };
}

// A beacon as the browser sends it from one of our pages
const SAME_ORIGIN_POST = {
  method: 'POST',
  headers: { Origin: 'https://word2md.com', 'Sec-Fetch-Site': 'same-origin' },
};

describe('worker fetch handler', () => {
  describe('POST /api/event (conversion counter)', () => {
    it('records one data point with outcome + locale and returns 204', async () => {
      const env = makeEnv();
      const res = await worker.fetch(
        new Request(
          'https://word2md.com/api/event?o=success&l=de',
          SAME_ORIGIN_POST,
        ),
        env,
      );

      expect(res.status).toBe(204);
      expect(env.EVENTS!.writeDataPoint).toHaveBeenCalledTimes(1);
      // No content, filename, size, or identifier — just outcome + page language.
      expect(env.EVENTS!.writeDataPoint).toHaveBeenCalledWith({
        blobs: ['convert', 'success', 'de'],
        doubles: [1],
      });
      // The counter must not fall through to asset serving.
      expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    });

    it('records the error outcome when o=error', async () => {
      const env = makeEnv();
      await worker.fetch(
        new Request(
          'https://word2md.com/api/event?o=error&l=en',
          SAME_ORIGIN_POST,
        ),
        env,
      );
      expect(env.EVENTS!.writeDataPoint).toHaveBeenCalledWith({
        blobs: ['convert', 'error', 'en'],
        doubles: [1],
      });
    });

    it('bounds caller-supplied dimensions: bad outcome → success, unknown locale → other', async () => {
      const env = makeEnv();
      await worker.fetch(
        new Request(
          'https://word2md.com/api/event?o=garbage&l=zz',
          SAME_ORIGIN_POST,
        ),
        env,
      );
      expect(env.EVENTS!.writeDataPoint).toHaveBeenCalledWith({
        blobs: ['convert', 'success', 'other'],
        doubles: [1],
      });
    });

    it('defaults missing params to success/other', async () => {
      const env = makeEnv();
      await worker.fetch(
        new Request('https://word2md.com/api/event', SAME_ORIGIN_POST),
        env,
      );
      expect(env.EVENTS!.writeDataPoint).toHaveBeenCalledWith({
        blobs: ['convert', 'success', 'other'],
        doubles: [1],
      });
    });

    it('rejects non-POST methods without recording anything', async () => {
      const env = makeEnv();
      const res = await worker.fetch(
        new Request('https://word2md.com/api/event', { method: 'GET' }),
        env,
      );

      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe('POST');
      expect(env.EVENTS!.writeDataPoint).not.toHaveBeenCalled();
      expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    });

    it.each([
      ['no Origin', {}],
      ['a foreign Origin', { Origin: 'https://evil.example' }],
      [
        'a cross-site fetch',
        { Origin: 'https://word2md.com', 'Sec-Fetch-Site': 'cross-site' },
      ],
    ])('rejects a beacon with %s without recording it', async (_, headers) => {
      const env = makeEnv();
      const res = await worker.fetch(
        new Request('https://word2md.com/api/event', {
          method: 'POST',
          headers,
        }),
        env,
      );
      expect(res.status).toBe(403);
      expect(env.EVENTS!.writeDataPoint).not.toHaveBeenCalled();
    });

    it('still returns 204 when the Analytics Engine binding is absent', async () => {
      // e.g. a deploy without the binding; the endpoint degrades to a no-op.
      const env = makeEnv({ EVENTS: undefined });
      const res = await worker.fetch(
        new Request('https://word2md.com/api/event', SAME_ORIGIN_POST),
        env,
      );
      expect(res.status).toBe(204);
    });
  });

  describe('asset passthrough', () => {
    it('delegates non-event, non-root paths to the ASSETS binding', async () => {
      const env = makeEnv();
      const req = new Request('https://word2md.com/privacy/');
      const res = await worker.fetch(req, env);

      expect(env.ASSETS.fetch).toHaveBeenCalledWith(req);
      expect(env.EVENTS!.writeDataPoint).not.toHaveBeenCalled();
      expect(res.status).toBe(200);
    });
  });

  describe('root locale redirect (unchanged by the counter)', () => {
    it('302-redirects a first-time non-English visitor and counts nothing', async () => {
      const env = makeEnv();
      const req = new Request('https://word2md.com/', {
        headers: { 'Accept-Language': 'de-DE,de;q=0.9' },
      });
      const res = await worker.fetch(req, env);

      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('https://word2md.com/de/');
      expect(res.headers.get('Set-Cookie')).toBe(
        'lang=de; Path=/; Max-Age=31536000; SameSite=Lax; Secure',
      );
      expect(res.headers.get('Vary')).toBe('Accept-Language, Cookie');
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(env.ASSETS.fetch).not.toHaveBeenCalled();
      expect(env.EVENTS!.writeDataPoint).not.toHaveBeenCalled();
    });

    it('keeps the query string on the redirect', async () => {
      const res = await worker.fetch(
        new Request('https://word2md.com/?utm_source=x', {
          headers: { 'Accept-Language': 'fr' },
        }),
        makeEnv(),
      );
      expect(res.headers.get('Location')).toBe(
        'https://word2md.com/fr/?utm_source=x',
      );
    });

    it('serves the root from assets when a lang cookie is already set', async () => {
      const env = makeEnv();
      const req = new Request('https://word2md.com/', {
        headers: { 'Accept-Language': 'de-DE', Cookie: 'lang=de' },
      });
      await worker.fetch(req, env);

      expect(env.ASSETS.fetch).toHaveBeenCalledWith(req);
    });
  });

  describe('root language suggestion', () => {
    // HTMLRewriter is a Workers runtime global; stand in a minimal version that
    // applies the `html` element handler's setAttribute to the serialized body.
    beforeAll(() => {
      (globalThis as Record<string, unknown>).HTMLRewriter = class {
        private attrs: [string, string][] = [];
        on(
          _selector: string,
          handler: {
            element(el: { setAttribute(k: string, v: string): void }): void;
          },
        ) {
          handler.element({ setAttribute: (k, v) => this.attrs.push([k, v]) });
          return this;
        }
        transform(res: Response) {
          const attrs = this.attrs;
          const body = res
            .text()
            .then((html) =>
              html.replace(
                '<html',
                `<html ${attrs.map(([k, v]) => `${k}="${v}"`).join(' ')}`,
              ),
            );
          return {
            headers: res.headers,
            status: res.status,
            body: new ReadableStream({
              async start(c) {
                c.enqueue(new TextEncoder().encode(await body));
                c.close();
              },
            }),
          };
        }
      };
    });
    afterAll(() => {
      delete (globalThis as Record<string, unknown>).HTMLRewriter;
    });

    function htmlEnv() {
      return makeEnv({
        ASSETS: {
          fetch: jest.fn(
            async () =>
              new Response('<html lang="en"><body></body></html>', {
                status: 200,
                headers: {
                  ETag: '"abc"',
                  'Cache-Control': 'public, max-age=0',
                },
              }),
          ),
        },
      });
    }

    function rootRequest(headers: Record<string, string>, country?: string) {
      const req = new Request('https://word2md.com/', { headers });
      if (country) Object.defineProperty(req, 'cf', { value: { country } });
      return req;
    }

    it('tags <html> for an English browser in a mapped country', async () => {
      const env = htmlEnv();
      const res = await worker.fetch(
        rootRequest(
          {
            'Accept-Language': 'en-US,en;q=0.9',
            Cookie: 'lang=en',
            'If-None-Match': '"abc"',
          },
          'ID',
        ),
        env,
      );

      expect(await res.text()).toContain('data-suggest-locale="id"');
      // Per-visitor response: never cached, no validators.
      expect(res.headers.get('Cache-Control')).toBe('private, no-store');
      expect(res.headers.get('ETag')).toBeNull();
      // Fetched unconditionally, so a stale untagged copy can't be reused.
      const [assetReq] = env.ASSETS.fetch.mock.calls[0] as [Request];
      expect(assetReq.headers.get('If-None-Match')).toBeNull();
    });

    it('serves the plain asset once the suggestion is turned off', async () => {
      const env = htmlEnv();
      const req = rootRequest(
        { 'Accept-Language': 'en-US', Cookie: 'lang=en; hint=off' },
        'ID',
      );
      const res = await worker.fetch(req, env);

      expect(env.ASSETS.fetch).toHaveBeenCalledWith(req);
      expect(await res.text()).not.toContain('data-suggest-locale');
    });

    it('serves the plain asset when there is nothing to suggest', async () => {
      const env = htmlEnv();
      const req = rootRequest({ 'Accept-Language': 'en-US' }, 'US');
      await worker.fetch(req, env);

      expect(env.ASSETS.fetch).toHaveBeenCalledWith(req);
    });

    it('only honors an exact hint=off cookie', async () => {
      const res = await worker.fetch(
        rootRequest(
          { 'Accept-Language': 'en-US', Cookie: 'lang=en; hint=offer' },
          'ID',
        ),
        htmlEnv(),
      );
      expect(await res.text()).toContain('data-suggest-locale="id"');
    });

    it('passes a non-OK asset response through untagged', async () => {
      const env = makeEnv({
        ASSETS: {
          fetch: jest.fn(async () => new Response('gone', { status: 503 })),
        },
      });
      const res = await worker.fetch(
        rootRequest({ 'Accept-Language': 'en-US', Cookie: 'lang=en' }, 'ID'),
        env,
      );
      expect(res.status).toBe(503);
      expect(await res.text()).toBe('gone');
    });
  });
});
