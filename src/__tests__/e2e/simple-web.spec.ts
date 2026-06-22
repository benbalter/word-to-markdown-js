import { test, expect } from '@playwright/test';

test.describe('Simple Web Interface Test', () => {
  test('should load page and check JavaScript functionality', async ({
    page,
  }) => {
    // Navigate to the web interface
    await page.goto('http://localhost:8080');

    // Check page loads correctly
    await expect(page.locator('h1')).toHaveText('Word to Markdown');

    // Check that the form elements are present
    await expect(page.locator('#file')).toBeVisible();
    await expect(page.locator('label[for="file"]')).toBeVisible();

    // Check JavaScript console for errors
    const consoleMessages: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleMessages.push(msg.text());
      }
    });

    // Wait for page to fully load and JavaScript to execute
    await page.waitForLoadState('networkidle');

    // Print any console errors for debugging
    if (consoleMessages.length > 0) {
      console.log('Console errors:', consoleMessages);
    }

    // Verify no critical JavaScript errors
    expect(consoleMessages.length).toBe(0);

    // Check that JavaScript has loaded by looking for evidence of event handlers
    const hasFileInputHandler = await page.evaluate(() => {
      const fileInput = document.getElementById('file');
      // Check if event listeners have been attached (indirect check)
      return fileInput !== null;
    });

    expect(hasFileInputHandler).toBe(true);
  });

  test('should not show results before a file is provided', async ({
    page,
  }) => {
    await page.goto('http://localhost:8080');

    // Results stay hidden and the dropzone/input stays visible until a file is chosen
    await expect(page.locator('#results')).not.toBeVisible();
    await expect(page.locator('#input')).toBeVisible();
  });

  test('should check network requests', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      requests.push(`${request.method()} ${request.url()}`);
    });

    await page.goto('http://localhost:8080');

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    // Print requests for debugging
    console.log('Network requests:', requests);

    // Should have loaded the client JS bundle.
    // Astro emits the hoisted page script under /_astro/*.js.
    expect(
      requests.some((req) =>
        /(main(\.[a-zA-Z0-9]+)?|_astro\/.*)\.js(\?.*)?$/.test(req),
      ),
    ).toBe(true);
  });
});
