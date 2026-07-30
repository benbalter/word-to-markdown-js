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
    // Check page title (starts with the brand; may carry an SEO suffix)
    await expect(page).toHaveTitle(/^Word to Markdown/);

    // Check main heading
    await expect(page.locator('h1')).toHaveText('Word to Markdown');

    // Check that upload form is visible
    await expect(page.locator('#file')).toBeVisible();
    await expect(page.locator('label[for="file"]')).toBeVisible();

    // Check that results section is hidden initially
    await expect(page.locator('#results')).not.toBeVisible();
  });

  test('should upload and convert a simple Word document', async ({ page }) => {
    // Path to test fixture
    const fixturePath = path.join(__dirname, '../../__fixtures__/h1.docx');

    // Upload file (this triggers the conversion automatically via change event)
    await page.locator('#file').setInputFiles(fixturePath);

    // Wait for conversion to complete and results to appear
    await expect(page.locator('#results')).toBeVisible({ timeout: 10000 });

    // Wait for content to be populated
    await expect(page.locator('#output')).not.toHaveText('', {
      timeout: 10000,
    });

    // Check that input form is now hidden
    await expect(page.locator('#input')).not.toBeVisible();

    // Check that filename is displayed
    await expect(page.locator('#filename')).toHaveText('h1.docx');

    // Check that markdown output is present
    const markdownOutput = page.locator('#output');
    await expect(markdownOutput).toBeVisible();
    const markdownText = await markdownOutput.textContent();
    expect(markdownText).toContain('# Heading 1');

    // Check that rendered HTML is present. The preview renders off the critical
    // path (after the results reveal), so poll rather than read innerHTML once.
    const renderedOutput = page.locator('#rendered');
    await expect(renderedOutput).toBeVisible();
    await expect
      .poll(() => renderedOutput.innerHTML())
      .toContain('<h1>Heading 1</h1>');
  });

  test('runs the conversion in a Web Worker (off the main thread)', async ({
    page,
  }) => {
    // The worker bundles browser builds of turndown/markdownlint/domino that
    // assume a DOM; a worker has none, so a regression there throws
    // "window/document/require is not defined" at load. That crash is caught as a
    // WorkerInfraError and the app silently falls back to the main thread — the
    // output still looks right, so asserting only on output would hide the
    // regression (that was the old false-positive). Instead, tap the worker's
    // messages to prove the *worker* produced the result, and fail on any
    // worker/page error. (The tap must be installed before the worker is
    // created, so add the init script then re-navigate — beforeEach already
    // loaded the page, so the script needs a fresh load to take effect.)
    await page.addInitScript(() => {
      (window as unknown as { __workerConverted: boolean }).__workerConverted =
        false;
      const OriginalWorker = window.Worker;
      window.Worker = class extends OriginalWorker {
        constructor(scriptURL: string | URL, options?: WorkerOptions) {
          super(scriptURL, options);
          this.addEventListener('message', (event: MessageEvent) => {
            if (event.data?.id != null && event.data?.ok === true) {
              (
                window as unknown as { __workerConverted: boolean }
              ).__workerConverted = true;
            }
          });
        }
      } as typeof Worker;
    });

    const workerErrors: string[] = [];
    page.on('pageerror', (error) => workerErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') workerErrors.push(message.text());
    });

    // Fresh load so the init script (and thus the Worker tap) is in place before
    // the app lazily creates the converter worker.
    await page.goto('http://localhost:8080');

    const fixturePath = path.join(__dirname, '../../__fixtures__/h1.docx');
    await page.locator('#file').setInputFiles(fixturePath);
    await expect(page.locator('#results')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#output')).toContainText('# Heading 1');

    // A dedicated converter Worker should exist once the result is in.
    const workers = page.workers();
    expect(workers.some((w) => w.url().includes('converter.worker'))).toBe(
      true,
    );

    // The worker — not the main-thread fallback — must have produced the result,
    // and it must have loaded without throwing.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __workerConverted: boolean })
              .__workerConverted,
        ),
      )
      .toBe(true);
    expect(workerErrors).toEqual([]);
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

    // Check rendered output has proper HTML headings. The preview renders off
    // the critical path, so wait for it to populate before asserting.
    const renderedOutput = page.locator('#rendered');
    await expect
      .poll(() => renderedOutput.innerHTML())
      .toContain('<h1>H1</h1>');
    const renderedHTML = await renderedOutput.innerHTML();
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

    // Check rendered output has table HTML. The preview renders off the
    // critical path, so wait for it to populate before asserting.
    const renderedOutput = page.locator('#rendered');
    await expect.poll(() => renderedOutput.innerHTML()).toContain('<table>');
    const renderedHTML = await renderedOutput.innerHTML();
    expect(renderedHTML).toContain('<tr>');
    expect(renderedHTML).toContain('<td>');
  });

  test('should show error for unsupported .doc files', async ({ page }) => {
    // Note: We'll simulate the file upload with a .doc extension
    // The actual file content doesn't matter since validation happens on extension
    await page.locator('#file').setInputFiles({
      name: 'document.doc',
      mimeType: 'application/msword',
      buffer: Buffer.from('fake content'),
    });

    // Should surface the friendly "save as .docx" guidance, not proceed
    const error = page.locator('#error-message');
    await expect(error).toBeVisible({ timeout: 5000 });
    await expect(error).toContainText('Save As');
    await expect(error).toContainText('.docx');

    // Verify no conversion occurred: results hidden, input still visible
    await expect(page.locator('#results')).not.toBeVisible();
    await expect(page.locator('#input')).toBeVisible();
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
    await expect(copyButton).toHaveText('Copy Markdown');

    // Click copy button (clipboard functionality requires user interaction)
    await copyButton.click();

    // The label flips to a transient "Copied!" confirmation, then restores.
    await expect(page.locator('#copy-label')).toHaveText('Copied!');
    await expect(page.locator('#copy-label')).toHaveText('Copy Markdown', {
      timeout: 5000,
    });
  });

  test('should reset to accept another file via "Convert another"', async ({
    page,
  }) => {
    const fixturePath = path.join(__dirname, '../../__fixtures__/h1.docx');
    await page.locator('#file').setInputFiles(fixturePath);
    await expect(page.locator('#results')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#input')).not.toBeVisible();

    // Reset returns to the initial state without a page reload.
    await page.locator('#convert-another').click();
    await expect(page.locator('#results')).not.toBeVisible();
    await expect(page.locator('#input')).toBeVisible();

    // A second document converts as if it were the first.
    const secondPath = path.join(
      __dirname,
      '../../__fixtures__/multiple-headings.docx',
    );
    await page.locator('#file').setInputFiles(secondPath);
    await expect(page.locator('#results')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#filename')).toHaveText(
      'multiple-headings.docx',
    );
  });

  test('should reject a file larger than the size limit', async ({ page }) => {
    // 21 MB of zeros with a .docx name — rejected on size before any parsing.
    await page.locator('#file').setInputFiles({
      name: 'huge.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.alloc(21 * 1024 * 1024),
    });

    const error = page.locator('#error-message');
    await expect(error).toBeVisible({ timeout: 5000 });
    await expect(error).toContainText('too large');
    await expect(page.locator('#results')).not.toBeVisible();
  });

  test('should download the converted markdown as a .md file', async ({
    page,
  }) => {
    const fixturePath = path.join(__dirname, '../../__fixtures__/h1.docx');
    await page.locator('#file').setInputFiles(fixturePath);
    await expect(page.locator('#results')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#output')).not.toHaveText('', {
      timeout: 10000,
    });

    const downloadButton = page.locator('#download-button');
    await expect(downloadButton).toBeVisible();

    // The download is named after the source document, with a .md extension.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      downloadButton.click(),
    ]);
    expect(download.suggestedFilename()).toBe('h1.md');
  });

  test('should accept a file via drag-and-drop', async ({ page }) => {
    // Drag-over highlight toggles on enter/leave (no file needed).
    const highlight = await page.evaluate(() => {
      const dz = document.getElementById('dropzone')!;
      dz.dispatchEvent(new DragEvent('dragenter', { bubbles: true }));
      const onEnter = dz.classList.contains('is-dragover');
      dz.dispatchEvent(new DragEvent('dragleave', { bubbles: true }));
      const onLeave = dz.classList.contains('is-dragover');
      return { onEnter, onLeave };
    });
    expect(highlight.onEnter).toBe(true);
    expect(highlight.onLeave).toBe(false);

    // Dropping a file routes through the converter. An unsupported extension is
    // the cheapest proof the drop handler reaches processFile (valid .docx
    // conversion is already covered via the file input above).
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['x'], 'note.txt', { type: 'text/plain' }));
      document
        .getElementById('dropzone')!
        .dispatchEvent(
          new DragEvent('drop', { bubbles: true, dataTransfer: dt }),
        );
    });
    await expect(page.locator('#error-alert')).toBeVisible();
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
    await expect(page.locator('label[for="file"]')).toBeVisible();

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
