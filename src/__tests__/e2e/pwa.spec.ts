import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const H1_DOCX = path.join(__dirname, '../../__fixtures__/h1.docx');

// The rest of the suite blocks service workers (playwright.config.ts) so they
// can't bypass page.route() mocks; this spec is the one that exercises it.
test.use({ serviceWorkers: 'allow' });

test.describe('Installable, offline-capable site', () => {
  test('links a web app manifest', async ({ page, request }) => {
    await page.goto('/');
    const href = await page
      .locator('link[rel="manifest"]')
      .getAttribute('href');
    expect(href).toBe('/manifest.webmanifest');
    const manifest = await (await request.get(href!)).json();
    expect(manifest.start_url).toBe('/');
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  test('converts a document offline after a first visit', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    // `ready` resolves once the worker is active, i.e. after install finished
    // precaching the converter and caching this page.
    const scope = await page.evaluate(
      async () => (await navigator.serviceWorker.ready).scope,
    );
    expect(new URL(scope).pathname).toBe('/');

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#file')).toBeAttached();
    expect(
      await page.evaluate(() => navigator.serviceWorker.controller !== null),
    ).toBe(true);
    // Really offline: a file the worker passes through can't load.
    expect(
      await page.evaluate(() =>
        fetch('/robots.txt').then(
          () => 'loaded',
          () => 'failed',
        ),
      ),
    ).toBe('failed');

    await page.locator('#file').setInputFiles(H1_DOCX);
    await expect(page.locator('#output')).toContainText('# Heading 1', {
      timeout: 15000,
    });
    // The preview renderer isn't precached (a visitor who never converts
    // shouldn't download it), so a first conversion offline shows the
    // Markdown without the preview.
    await expect(page.locator('#results')).toBeVisible();
    await expect(page.locator('#error-alert')).toHaveCount(0);
    await expect(page.locator('#rendered')).toBeEmpty();
  });

  test('previews offline once a conversion has loaded the renderer', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // The page loaded before the worker controlled it, so its requests
    // bypassed the cache; reload under the worker's control first.
    await page.reload();
    await page.locator('#file').setInputFiles(H1_DOCX);
    await expect(page.locator('#rendered h1')).toHaveText('Heading 1', {
      timeout: 15000,
    });
    // The runtime cache stores the renderer's chunks as they load.
    await expect
      .poll(() =>
        page.evaluate(async () => {
          for (const key of await caches.keys()) {
            const cache = await caches.open(key);
            for (const request of await cache.keys()) {
              if (/\/_astro\/unified\.[\w-]+\.js$/.test(request.url)) {
                return true;
              }
            }
          }
          return false;
        }),
      )
      .toBe(true);

    await context.setOffline(true);
    await page.reload();
    await page.locator('#file').setInputFiles(H1_DOCX);
    await expect(page.locator('#rendered h1')).toHaveText('Heading 1', {
      timeout: 15000,
    });
  });
});
