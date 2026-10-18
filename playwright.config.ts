import { defineConfig, devices } from '@playwright/test';

/* Port for the preview server the tests run against. Override it (e.g.
   `E2E_PORT=8090 npm run test:e2e`) to run several checkouts' suites at once
   without one testing another's build. */
const port = Number(process.env.E2E_PORT ?? 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(
    `E2E_PORT must be a port number, got "${process.env.E2E_PORT}"`,
  );
}

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
  /* Use half the runner's cores on CI; retries absorb the odd flake. */
  workers: process.env.CI ? '50%' : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters.
     In CI, `github` also annotates failures inline on the PR. */
  reporter: process.env.CI ? [['github'], ['html']] : 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: `http://localhost:${port}`,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* The offline service worker would take over requests and bypass
       page.route() mocks; pwa.spec.ts opts back in. */
    serviceWorkers: 'block',
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

    // Firefox/WebKit left disabled: cross-browser runs stall in this
    // environment, so they can't be verified here. Re-enabling Firefox is a
    // one-line addition plus `npx playwright install firefox` in CI, once it
    // can be validated with a real run.
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  /* Before any test, check that the server on the port is serving this
     checkout's dist/: a reused server could be another checkout's build. */
  globalSetup: './src/__tests__/e2e/global-setup.ts',

  /* Serve the built Astro site (dist/) before starting the tests.
     Assumes `npm run build` has produced dist/ (CI runs it first). Outside CI
     a server already on the port is reused, since `astro preview` sometimes
     has to be started by hand (see docs/E2E_TESTING.md); globalSetup makes
     sure it's this build. */
  webServer: {
    command: `npm run preview -- --port ${port}`,
    port,
    reuseExistingServer: !process.env.CI,
    stderr: 'pipe',
    stdout: 'pipe',
  },
});
