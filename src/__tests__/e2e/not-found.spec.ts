import { test, expect } from '@playwright/test';

// Unknown paths get the branded 404 page (dist/404.html) with a real 404
// status — Cloudflare via `not_found_handling`, `astro preview` by convention.

test.describe('404 page', () => {
  test('unknown paths return the branded not-found page', async ({ page }) => {
    const response = await page.goto('/definitely-not-a-page/');
    expect(response?.status()).toBe(404);

    await expect(page.locator('h1')).toHaveText('Page not found');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex',
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);

    // Visitors can get back to the converter, in any language.
    await expect(
      page.getByRole('link', { name: 'Convert a Word document' }),
    ).toHaveAttribute('href', '/');
    await expect(
      page.locator('nav[aria-label="Language"]').getByRole('link', {
        name: 'Deutsch',
      }),
    ).toHaveAttribute('href', '/de/');
  });
});
