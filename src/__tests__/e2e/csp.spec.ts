import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// The site ships a Content-Security-Policy (<meta> tag from astro.config.mjs
// `security.csp`). A too-strict policy can fail silently: the converter falls
// back to the main thread if the Web Worker is blocked, and a blocked style
// attribute just renders wrong. So rather than only checking that things work,
// these tests record every CSP violation the page reports and require none.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function trackViolations(page: Page): Promise<string[]> {
  const violations: string[] = [];
  await page.exposeFunction('__reportCspViolation', (v: string) => {
    violations.push(v);
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      (
        window as unknown as { __reportCspViolation: (v: string) => void }
      ).__reportCspViolation(
        `${e.effectiveDirective} blocked ${e.blockedURI || '(inline)'} at ${e.sourceFile}:${e.lineNumber}`,
      );
    });
  });
  // Belt and braces: Chrome also logs refusals to the console.
  page.on('console', (msg) => {
    if (/Content Security Policy/i.test(msg.text())) {
      violations.push(msg.text());
    }
  });
  return violations;
}

test.describe('Content-Security-Policy', () => {
  test('pages ship a CSP that connects only to the same origin', async ({
    page,
  }) => {
    await page.goto('/');
    const csp = await page
      .locator('meta[http-equiv="content-security-policy"]')
      .getAttribute('content');
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("object-src 'none'");
  });

  for (const url of ['/', '/de/', '/ja/', '/privacy/', '/terms/']) {
    test(`${url} loads without CSP violations`, async ({ page }) => {
      const violations = await trackViolations(page);
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      expect(violations).toEqual([]);
    });
  }

  test('a full conversion (worker, preview, images, copy, download) has no violations', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const violations = await trackViolations(page);
    const workers: string[] = [];
    page.on('worker', (w) => workers.push(w.url()));

    await page.goto('/');
    await page
      .locator('#file')
      .setInputFiles(path.join(__dirname, '../../__fixtures__/image.docx'));
    await expect(page.locator('#results')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#output')).not.toHaveText('', {
      timeout: 15000,
    });

    // Conversion ran in the module Web Worker, not the main-thread fallback.
    expect(workers.some((u) => u.includes('converter.worker'))).toBe(true);

    // The image document reveals the .zip button (set via CSSOM, not markup).
    await expect(page.locator('#download-zip-button')).toBeVisible();

    await page.locator('#copy-button').click();
    await expect(page.locator('#copy-label')).toHaveText('Copied!');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#download-button').click(),
    ]);
    expect(download.suggestedFilename()).toBe('image.md');

    expect(violations).toEqual([]);
  });
});
