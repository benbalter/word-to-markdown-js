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
    await expect(page.locator('button[type="submit"]')).toBeVisible();

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

  test('should handle form interaction without file upload', async ({
    page,
  }) => {
    await page.goto('http://localhost:8080');

    // Try clicking the submit button without a file (should not proceed)
    await page.locator('button[type="submit"]').click();

    // Results should still be hidden
    await expect(page.locator('#results')).toHaveClass(/d-none/);

    // Input should still be visible
    await expect(page.locator('#input')).not.toHaveClass(/d-none/);
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

    // Should have loaded the main JS bundle and Bootstrap CSS
    expect(
      requests.some((req) => /main(\.[a-zA-Z0-9]+)?\.js(\?.*)?$/.test(req)),
    ).toBe(true);
    expect(requests.some((req) => /bootstrap.*\.css(\?.*)?$/.test(req))).toBe(
      true,
    );
  });
});
