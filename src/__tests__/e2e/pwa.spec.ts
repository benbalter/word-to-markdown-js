import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

    await page
      .locator('#file')
      .setInputFiles(path.join(__dirname, '../../__fixtures__/h1.docx'));
    await expect(page.locator('#output')).toContainText('# Heading 1', {
      timeout: 15000,
    });
  });
});
