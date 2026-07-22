import { test, expect } from '@playwright/test';

// Verifies the i18n foundation: the localized route renders, the page advertises
// the correct language + a complete self-referential hreflang cluster, and the
// converter still works in the localized page. Mirrors the Layout invariants
// (single <h1>, footer hrefs present once).

test.describe('Internationalization', () => {
  test('English home advertises a self-referential hreflang cluster', async ({
    page,
  }) => {
    await page.goto('http://localhost:8080/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://word2md.com/',
    );

    // Cluster must list en, id, AND x-default (self-referential).
    for (const [hreflang, href] of [
      ['en', 'https://word2md.com/'],
      ['id', 'https://word2md.com/id/'],
      ['x-default', 'https://word2md.com/'],
    ]) {
      await expect(
        page.locator(`link[rel="alternate"][hreflang="${hreflang}"]`),
      ).toHaveAttribute('href', href);
    }
  });

  test('Indonesian home renders translated content at /id/', async ({
    page,
  }) => {
    await page.goto('http://localhost:8080/id/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'id');

    // Canonical is self-referential to /id/, not the English root.
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://word2md.com/id/',
    );
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute(
      'content',
      'id_ID',
    );

    // Translated copy is present (FAQ heading is a stable, visible string).
    await expect(
      page.getByText('Pertanyaan yang sering diajukan'),
    ).toBeVisible();

    // Exactly one <h1> (Layout invariant), still the brand wordmark.
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText('Word to Markdown');
  });

  test('converter works on the Indonesian page', async ({ page }) => {
    await page.goto('http://localhost:8080/id/');

    await page
      .locator('#file')
      .setInputFiles(
        new URL('../../__fixtures__/h1.docx', import.meta.url).pathname,
      );

    await expect(page.locator('#results')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#output')).toContainText('# Heading 1', {
      timeout: 10000,
    });
  });

  test('legal pages carry no hreflang (English-only)', async ({ page }) => {
    await page.goto('http://localhost:8080/privacy/');
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(
      0,
    );
  });

  test('Vietnamese home renders translated content at /vi/', async ({
    page,
  }) => {
    await page.goto('http://localhost:8080/vi/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://word2md.com/vi/',
    );
    await expect(page.getByText('Câu hỏi thường gặp')).toBeVisible();
  });

  test('language switcher lists every locale by endonym and marks the current one', async ({
    page,
  }) => {
    await page.goto('http://localhost:8080/');
    const switcher = page.locator('nav[aria-label="Language"]');
    await expect(switcher).toBeVisible();

    // Endonyms, no flags. The current locale is a non-link with aria-current.
    await expect(switcher.locator('[aria-current="page"]')).toHaveText(
      'English',
    );
    for (const endonym of [
      'Bahasa Indonesia',
      'Tiếng Việt',
      'Português',
      'Español',
      'Deutsch',
      'Français',
    ]) {
      await expect(switcher.getByRole('link', { name: endonym })).toBeVisible();
    }

    // Switching navigates to the localized home.
    await switcher.getByRole('link', { name: 'Tiếng Việt' }).click();
    await expect(page).toHaveURL('http://localhost:8080/vi/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  });
});
