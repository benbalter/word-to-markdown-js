import { jest } from '@jest/globals';
import worker, { ERROR_KINDS, SOURCES } from '../../worker/index.js';
import { CONVERSION_ERROR_KINDS } from '../../web/scripts/converter/conversion-errors.ts';
import { CONVERSION_SOURCES } from '../../web/scripts/converter/conversion-sources.ts';

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
    it('records one data point with outcome + locale + source and returns 204', async () => {
      const env = makeEnv();
      const res = await worker.fetch(
        new Request(
          'https://word2md.com/api/event?o=success&l=de&s=drop',
          SAME_ORIGIN_POST,
        ),
        env,
      );

      expect(res.status).toBe(204);
      expect(env.EVENTS!.writeDataPoint).toHaveBeenCalledTimes(1);
      // No content, filename, size, or identifier — just outcome, page language,
      // and how the conversion started, with the source appended as blob4.
      expect(env.EVENTS!.writeDataPoint).toHaveBeenCalledWith({
        blobs: ['convert', 'success', 'de', 'drop', 'none'],
        doubles: [1],
      });
      // The counter must not fall through to asset serving.
      expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    });

    it('records the error outcome when o=error', async () => {
      const env = makeEnv();
      await worker.fetch(
        new Request(
          'https://word2md.com/api/event?o=error&l=en&s=webmcp&e=protected',
          SAME_ORIGIN_POST,
        ),
        env,
      );
      expect(env.EVENTS!.writeDataPoint).toHaveBeenCalledWith({
        blobs: ['convert', 'error', 'en', 'webmcp', 'protected'],
        doubles: [1],
      });
    });

    it('bounds caller-supplied dimensions: bad outcome → success, unknown locale and source → other', async () => {
      const env = makeEnv();
      await worker.fetch(
        new Request(
          'https://word2md.com/api/event?o=garbage&l=zz&s=upload',
          SAME_ORIGIN_POST,
        ),
        env,
      );
      expect(env.EVENTS!.writeDataPoint).toHaveBeenCalledWith({
        blobs: ['convert', 'success', 'other', 'other', 'none'],
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
        blobs: ['convert', 'success', 'other', 'other', 'none'],
        doubles: [1],
      });
    });

    it.each(['drop', 'paste', 'batch', 'webmcp'])(
      'records source %s as blob4, after the existing dimensions',
      async (source) => {
        const env = makeEnv();
        await worker.fetch(
          new Request(
            `https://word2md.com/api/event?o=success&l=en&s=${source}`,
            SAME_ORIGIN_POST,
          ),
          env,
        );
        expect(env.EVENTS!.writeDataPoint).toHaveBeenCalledWith({
          blobs: ['convert', 'success', 'en', source, 'none'],
          doubles: [1],
        });
      },
    );

    it.each([
      ['an unknown source', 'other'],
      ['a source in the wrong case', 'WebMCP'],
      ['a long caller-supplied string', 'x'.repeat(500)],
    ])('records %s as other', async (_, source) => {
      const env = makeEnv();
      await worker.fetch(
        new Request(
          `https://word2md.com/api/event?o=success&l=en&s=${encodeURIComponent(source)}`,
          SAME_ORIGIN_POST,
        ),
        env,
      );
      expect(env.EVENTS!.writeDataPoint).toHaveBeenCalledWith({
        blobs: ['convert', 'success', 'en', 'other', 'none'],
        doubles: [1],
      });
    });

    it.each([
      'not-docx',
      'protected',
      'invalid',
      'timeout',
      'load',
      'conversion',
    ])('records error kind %s as blob5, after the source', async (kind) => {
      const env = makeEnv();
      await worker.fetch(
        new Request(
          `https://word2md.com/api/event?o=error&l=en&s=drop&e=${kind}`,
          SAME_ORIGIN_POST,
        ),
        env,
      );
      expect(env.EVENTS!.writeDataPoint).toHaveBeenCalledWith({
        blobs: ['convert', 'error', 'en', 'drop', kind],
        doubles: [1],
      });
    });

    it.each([
      ['an unknown kind', '&e=legacy-doc'],
      ['a long caller-supplied string', `&e=${'x'.repeat(500)}`],
      ['no kind', ''],
    ])('records an error with %s as other', async (_, param) => {
      const env = makeEnv();
      await worker.fetch(
        new Request(
          `https://word2md.com/api/event?o=error&l=en&s=paste${param}`,
          SAME_ORIGIN_POST,
        ),
        env,
      );
      expect(env.EVENTS!.writeDataPoint).toHaveBeenCalledWith({
        blobs: ['convert', 'error', 'en', 'paste', 'other'],
        doubles: [1],
      });
    });

    it('records none as the error kind of a success, whatever e says', async () => {
      const env = makeEnv();
      await worker.fetch(
        new Request(
          'https://word2md.com/api/event?o=success&l=en&s=drop&e=invalid',
          SAME_ORIGIN_POST,
        ),
        env,
      );
      expect(env.EVENTS!.writeDataPoint).toHaveBeenCalledWith({
        blobs: ['convert', 'success', 'en', 'drop', 'none'],
        doubles: [1],
      });
    });

    it('bounds error kinds to the list the browser maps errors to', () => {
      expect(ERROR_KINDS).toBe(CONVERSION_ERROR_KINDS);
    });

    it('bounds sources to the list the browser beacon sends', () => {
      // One source of truth: the Worker bounds to the same list the client
      // types its beacon against.
      expect(SOURCES).toBe(CONVERSION_SOURCES);
      expect([...SOURCES]).toEqual(['drop', 'paste', 'batch', 'webmcp']);
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

  describe('Markdown negotiation', () => {
    const MARKDOWN = { headers: { Accept: 'text/markdown, text/html;q=0.9' } };

    function markdownEnv() {
      return makeEnv({
        ASSETS: {
          fetch: jest.fn(async (req: Request) =>
            new URL(req.url).pathname.endsWith('.md')
              ? new Response('# twin', {
                  headers: { 'Content-Type': 'text/markdown' },
                })
              : new Response('<html>', { status: 200 }),
          ),
        },
      });
    }

    it("serves the root's Markdown twin to agents, ahead of the locale redirect", async () => {
      const env = markdownEnv();
      const res = await worker.fetch(
        new Request('https://word2md.com/', {
          headers: { ...MARKDOWN.headers, 'Accept-Language': 'de' },
        }),
        env,
      );

      expect(res.status).toBe(200);
      expect(await res.text()).toBe('# twin');
      expect(res.headers.get('Vary')).toContain('Accept');
      const fetched = env.ASSETS.fetch.mock.calls[0][0] as Request;
      expect(new URL(fetched.url).pathname).toBe('/index.md');
    });

    it("serves a legal page's twin", async () => {
      const env = markdownEnv();
      const res = await worker.fetch(
        new Request('https://word2md.com/privacy/', MARKDOWN),
        env,
      );

      expect(await res.text()).toBe('# twin');
      const fetched = env.ASSETS.fetch.mock.calls[0][0] as Request;
      expect(new URL(fetched.url).pathname).toBe('/privacy.md');
    });

    it('serves browsers HTML that varies on Accept', async () => {
      const env = markdownEnv();
      const res = await worker.fetch(
        new Request('https://word2md.com/privacy/', {
          headers: { Accept: 'text/html,*/*;q=0.8' },
        }),
        env,
      );

      expect(await res.text()).toBe('<html>');
      expect(res.headers.get('Vary')).toContain('Accept');
    });

    it('falls back to HTML when a page has no twin', async () => {
      const env = makeEnv();
      env.ASSETS.fetch
        .mockImplementationOnce(async () => new Response('nf', { status: 404 }))
        .mockImplementationOnce(async () => new Response('<html>'));
      const res = await worker.fetch(
        new Request('https://word2md.com/privacy/', MARKDOWN),
        env,
      );

      expect(await res.text()).toBe('<html>');
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
      expect(res.headers.get('Vary')).toBe('Accept-Language, Cookie, Accept');
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
      const res = await worker.fetch(req, env);

      expect(env.ASSETS.fetch).toHaveBeenCalledWith(req);
      // "/" can also be a redirect or a tagged page, so caches must key on
      // the headers that decide which.
      expect(res.headers.get('Vary')).toBe('Accept-Language, Cookie, Accept');
      expect(await res.text()).toBe('asset');
    });

    it('leaves Vary off other asset paths', async () => {
      const res = await worker.fetch(
        new Request('https://word2md.com/de/', {
          headers: { 'Accept-Language': 'de-DE' },
        }),
        makeEnv(),
      );
      expect(res.headers.get('Vary')).toBeNull();
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
