import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import JSZip from 'jszip';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string =>
  path.join(__dirname, '../../__fixtures__', name);

// The "Confluence wiki markup" checkbox switches the result between Markdown
// and wiki markup (web/scripts/converter/format.ts) without converting again.
test.describe('Confluence wiki markup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('switches the output, labels, copy, and download', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('#file').setInputFiles(fixture('h1.docx'));
    const output = page.locator('#output');
    await expect(output).toContainText('# Heading 1', { timeout: 10000 });
    await expect(page.locator('#confluence-hint')).toBeHidden();

    await page.getByLabel('Confluence wiki markup').check();
    await expect(output).toContainText('h1. Heading 1');
    await expect(output).not.toContainText('# Heading 1');
    await expect(page.locator('#output-label')).toHaveText('Confluence wiki');
    await expect(page.locator('#copy-label')).toHaveText('Copy wiki markup');
    await expect(page.locator('#download-label')).toHaveText('Download .txt');
    await expect(page.locator('#confluence-hint')).toBeVisible();

    await page.locator('#copy-button').click();
    await expect(page.locator('#copy-label')).toHaveText('Copied!');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(await output.textContent());
    // The confirmation gives way to the Confluence label, not the Markdown one.
    await expect(page.locator('#copy-label')).toHaveText('Copy wiki markup', {
      timeout: 5000,
    });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#download-button').click(),
    ]);
    expect(download.suggestedFilename()).toBe('h1.txt');
    expect(readFileSync(await download.path(), 'utf8')).toBe(
      await output.textContent(),
    );

    await page.getByLabel('Confluence wiki markup').uncheck();
    await expect(output).toContainText('# Heading 1');
    await expect(page.locator('#copy-label')).toHaveText('Copy Markdown');
  });

  test('is remembered, and applies to the next conversion', async ({
    page,
  }) => {
    await page.locator('#file').setInputFiles(fixture('h1.docx'));
    await expect(page.locator('#output')).toContainText('# Heading 1', {
      timeout: 10000,
    });
    await page.getByLabel('Confluence wiki markup').check();
    await page.reload();
    await expect(page.locator('#confluence-toggle')).toBeChecked();

    await page.locator('#file').setInputFiles(fixture('h1.docx'));
    await expect(page.locator('#output')).toContainText('h1. Heading 1', {
      timeout: 10000,
    });
  });

  test('the .zip carries wiki markup that names the images it holds', async ({
    page,
  }) => {
    await page.locator('#file').setInputFiles(fixture('image.docx'));
    await expect(page.locator('#download-zip-button')).toBeVisible({
      timeout: 15000,
    });
    await page.getByLabel('Confluence wiki markup').check();
    await expect(page.locator('#output')).toContainText('!image1.png');
    await expect(page.locator('#images-note')).toContainText(
      'attach the files',
    );

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#download-zip-button').click(),
    ]);
    const zip = await JSZip.loadAsync(readFileSync(await download.path()));
    expect(Object.keys(zip.files)).toContain('images/image1.png');
    const text = await zip.file('image.txt')?.async('string');
    expect(text).toContain('!image1.png');
  });
});
