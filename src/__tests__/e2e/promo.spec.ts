import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Behavior of the Open & Async reader funnel (Promo.astro + the results-pane
// pitch in Converter.astro, toggled by src/index.ts). The two placements are
// mutually exclusive by funnel stage: the standalone card is for visitors who
// have not converted; once a conversion succeeds the card is hidden and the
// lighter, contextual results CTA takes over — never two asks at once.
//
// Assertions deliberately target the durable contract (visibility transitions
// and the utm_campaign tags that drive attribution), NOT the marketing copy,
// which changes often. Both placements link to open-and-async.com, so every
// locator is scoped by container (#promo-card vs #results) to avoid matching
// two elements.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, '../../__fixtures__/h1.docx');

test.describe('Open & Async promo funnel', () => {
  test('shows the sponsor card before conversion, tagged utm_campaign=card', async ({
    page,
  }) => {
    await page.goto('http://localhost:8080/');

    const card = page.locator('#promo-card');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute(
      'href',
      /open-and-async\.com.*utm_campaign=card/,
    );

    // The results-pane CTA lives inside the still-hidden results block.
    await expect(page.locator('#results')).toBeHidden();
  });

  test('hides the card and reveals the results CTA after a conversion', async ({
    page,
  }) => {
    await page.goto('http://localhost:8080/');
    await page.locator('#file').setInputFiles(fixture);

    await expect(page.locator('#results')).toBeVisible({ timeout: 10000 });

    // The card is hidden via an inline display style (its scoped CSS sets
    // display:flex, which a utility class wouldn't reliably override). Asserting
    // the user-visible outcome rather than the style string also guards against
    // a regression to a class-based toggle that loses the cascade.
    await expect(page.locator('#promo-card')).toBeHidden();

    const cta = page.locator('#results a[href*="utm_campaign=results"]');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute(
      'href',
      /open-and-async\.com.*utm_campaign=results/,
    );
  });

  test('localizes the card copy per locale', async ({ page }) => {
    await page.goto('http://localhost:8080/');
    const enLabel = (
      await page.locator('#promo-card .promo-label').textContent()
    )?.trim();

    await page.goto('http://localhost:8080/de/');
    const deLabel = (
      await page.locator('#promo-card .promo-label').textContent()
    )?.trim();

    // Don't pin the exact strings (copy churns and i18n-completeness already
    // guards that they exist and are non-blank); assert the card is present in
    // both locales and that the German copy is actually a different string.
    expect(enLabel).toBeTruthy();
    expect(deLabel).toBeTruthy();
    expect(deLabel).not.toBe(enLabel);
  });
});
