import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Word to Markdown Web Interface', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the web interface served by test server
    await page.goto('http://localhost:8080');
  });

  test('should display the main page with upload form', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle('Word to Markdown');

    // Check main heading
    await expect(page.locator('h1')).toHaveText('Word to Markdown');

    // Check that upload form is visible
    await expect(page.locator('#file')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    // Check that results section is hidden initially
    await expect(page.locator('#results')).toHaveClass(/d-none/);
  });

  test('should upload and convert a simple Word document', async ({ page }) => {
    // Path to test fixture
    const fixturePath = path.join(__dirname, '../../__fixtures__/h1.docx');

    // Upload file (this triggers the conversion automatically via change event)
    await page.locator('#file').setInputFiles(fixturePath);

    // Wait for conversion to complete and results to appear
    await expect(page.locator('#results')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#results')).not.toHaveClass(/d-none/);

    // Wait for content to be populated
    await expect(page.locator('#output')).not.toHaveText('', {
      timeout: 10000,
    });

    // Check that input form is now hidden
    await expect(page.locator('#input')).toHaveClass(/d-none/);

    // Check that filename is displayed
    await expect(page.locator('#filename')).toHaveText('h1.docx');

    // Check that markdown output is present
    const markdownOutput = page.locator('#output');
    await expect(markdownOutput).toBeVisible();
    const markdownText = await markdownOutput.textContent();
    expect(markdownText).toContain('# Heading 1');

    // Check that rendered HTML is present
    const renderedOutput = page.locator('#rendered');
    await expect(renderedOutput).toBeVisible();
    const renderedHTML = await renderedOutput.innerHTML();
    expect(renderedHTML).toContain('<h1>Heading 1</h1>');
  });

  test('should convert multiple heading levels document', async ({ page }) => {
    const fixturePath = path.join(
      __dirname,
      '../../__fixtures__/multiple-headings.docx',
    );

    // Upload file (this triggers the conversion automatically)
    await page.locator('#file').setInputFiles(fixturePath);

    // Wait for results
    await expect(page.locator('#results')).toBeVisible({ timeout: 10000 });

    // Wait for markdown content to be populated
    await expect(page.locator('#output')).not.toHaveText('', {
      timeout: 10000,
    });

    // Check markdown output contains multiple heading levels
    const markdownOutput = page.locator('#output');
    const markdownText = await markdownOutput.textContent();
    expect(markdownText).toContain('# H1');
    expect(markdownText).toContain('## H2');
    expect(markdownText).toContain('### H3');

    // Check rendered output has proper HTML headings
    const renderedOutput = page.locator('#rendered');
    const renderedHTML = await renderedOutput.innerHTML();
    expect(renderedHTML).toContain('<h1>H1</h1>');
    expect(renderedHTML).toContain('<h2>H2</h2>');
    expect(renderedHTML).toContain('<h3>H3</h3>');
  });

  test('should convert table document correctly', async ({ page }) => {
    const fixturePath = path.join(__dirname, '../../__fixtures__/table.docx');

    // Upload file (this triggers the conversion automatically)
    await page.locator('#file').setInputFiles(fixturePath);

    // Wait for results
    await expect(page.locator('#results')).toBeVisible({ timeout: 10000 });

    // Wait for markdown content to be populated
    await expect(page.locator('#output')).not.toHaveText('', {
      timeout: 10000,
    });

    // Check markdown output contains table syntax
    const markdownOutput = page.locator('#output');
    const markdownText = await markdownOutput.textContent();
    expect(markdownText).toContain('|');
    expect(markdownText).toMatch(/\|.*\|/); // Should contain pipe-separated content

    // Check rendered output has table HTML
    const renderedOutput = page.locator('#rendered');
    const renderedHTML = await renderedOutput.innerHTML();
    expect(renderedHTML).toContain('<table>');
    expect(renderedHTML).toContain('<tr>');
    expect(renderedHTML).toContain('<td>');
  });

  test('should show error for unsupported .doc files', async ({ page }) => {
    // Note: We'll simulate the file upload with a .doc extension
    // The actual file content doesn't matter since validation happens on extension
    await page.evaluate(() => {
      // Create a file input with .doc extension to trigger validation
      const fileInput = document.getElementById('file') as HTMLInputElement;
      const dt = new DataTransfer();
      const file = new File(['fake content'], 'document.doc', {
        type: 'application/msword',
      });
      dt.items.add(file);
      fileInput.files = dt.files;

      // Trigger the change event
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Should show error message and not proceed with conversion
    // Wait for any error handling to complete by checking that results remain hidden
    await expect(page.locator('#results')).toHaveClass(/d-none/, {
      timeout: 5000,
    });

    // Verify no conversion occurred by checking the input is still visible
    await expect(page.locator('#input')).not.toHaveClass(/d-none/);
  });

  test('should handle copy to clipboard functionality', async ({ page }) => {
    const fixturePath = path.join(__dirname, '../../__fixtures__/p.docx');

    // Upload file (this triggers the conversion automatically)
    await page.locator('#file').setInputFiles(fixturePath);

    // Wait for results
    await expect(page.locator('#results')).toBeVisible({ timeout: 10000 });

    // Wait for content to be populated
    await expect(page.locator('#output')).not.toHaveText('', {
      timeout: 10000,
    });

    // Check that copy button is visible
    const copyButton = page.locator('#copy-button');
    await expect(copyButton).toBeVisible();
    await expect(copyButton).toHaveText('Copy markdown to clipboard');

    // Click copy button (clipboard functionality requires user interaction)
    await copyButton.click();

    // Note: Actually testing clipboard content requires special permissions
    // For now we just ensure the button works without errors
    await expect(copyButton).toBeVisible(); // Button should still be there after click
  });

  test('should have working navigation links', async ({ page }) => {
    // Check that navigation links are present and have correct hrefs
    await expect(page.locator('a[href*="CONTRIBUTING.md"]')).toBeVisible();
    await expect(
      page.locator(
        'a[href="https://github.com/benbalter/word-to-markdown-js"]',
      ),
    ).toBeVisible();
    await expect(
      page.locator('a[href*="patreon.com/benbalter"]'),
    ).toBeVisible();
    await expect(page.locator('a[href="/terms/"]')).toBeVisible();
    await expect(page.locator('a[href="/privacy/"]')).toBeVisible();
    await expect(page.locator('a[href*="ben.balter.com"]')).toBeVisible();
  });

  test('should be responsive and work on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Check that main elements are still visible and functional
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('#file')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    // Upload a file to test mobile conversion flow
    const fixturePath = path.join(__dirname, '../../__fixtures__/p.docx');
    await page.locator('#file').setInputFiles(fixturePath);

    // Wait for results and check they're visible on mobile
    await expect(page.locator('#results')).toBeVisible({ timeout: 10000 });

    // Wait for content to be populated
    await expect(page.locator('#output')).not.toHaveText('', {
      timeout: 10000,
    });

    await expect(page.locator('#output')).toBeVisible();
    await expect(page.locator('#rendered')).toBeVisible();
  });
});
