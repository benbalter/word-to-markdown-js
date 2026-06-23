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

describe('worker fetch handler', () => {
  describe('POST /api/event (conversion counter)', () => {
    it('records one data point with outcome + locale and returns 204', async () => {
      const env = makeEnv();
      const res = await worker.fetch(
        new Request('https://word2md.com/api/event?o=success&l=de', {
          method: 'POST',
        }),
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
        new Request('https://word2md.com/api/event?o=error&l=en', {
          method: 'POST',
        }),
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
        new Request('https://word2md.com/api/event?o=garbage&l=zz', {
          method: 'POST',
        }),
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
        new Request('https://word2md.com/api/event', { method: 'POST' }),
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
      expect(env.EVENTS!.writeDataPoint).not.toHaveBeenCalled();
      expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    });

    it('still returns 204 when the Analytics Engine binding is absent', async () => {
      // e.g. a deploy without the binding; the endpoint degrades to a no-op.
      const env = makeEnv({ EVENTS: undefined });
      const res = await worker.fetch(
        new Request('https://word2md.com/api/event', { method: 'POST' }),
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
      expect(env.ASSETS.fetch).not.toHaveBeenCalled();
      expect(env.EVENTS!.writeDataPoint).not.toHaveBeenCalled();
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
});
