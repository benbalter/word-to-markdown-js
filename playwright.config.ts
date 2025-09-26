import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './src/__tests__/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use system Chrome instead of downloading Playwright's version.
        // Note: This requires Google Chrome to be installed on the system and available in the PATH.
        // If Chrome is not installed or not found, Playwright will fail to launch the browser and tests will not run.
        channel: 'chrome',
      },
    },

    // Disable other browsers for now to simplify setup
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: [
    {
      command: 'node src/__tests__/e2e/test-server.js',
      port: 8080,
      reuseExistingServer: !process.env.CI,
      stderr: 'pipe',
      stdout: 'pipe',
    },
    {
      command: 'npm run server',
      port: 3000,
      reuseExistingServer: !process.env.CI,
      stderr: 'pipe',
      stdout: 'pipe',
    },
  ],
});
