# End-to-End Testing with Playwright

The E2E suite uses [Playwright](https://playwright.dev/) to test the built static site (`dist/`) in a real browser. There is no server-side API: all conversion happens client-side, so every test drives the web UI.

## Test Structure

```
src/__tests__/e2e/
├── web-interface.spec.ts        # Upload, conversion, results, errors, copy/download, mobile
├── simple-web.spec.ts           # Minimal smoke test of the converter UI
├── i18n.spec.ts                 # Localized routes, hreflang, language switcher
├── language-suggestion.spec.ts  # "Also available in …" banner on the English root
├── csp.spec.ts                  # Fails on any Content-Security-Policy violation
├── not-found.spec.ts            # Branded 404 page with a real 404 status
└── promo.spec.ts                # Results-pane promo behavior
```

## Configuration

`playwright.config.ts`:

- Runs Chromium via the system Chrome (`channel: 'chrome'`).
- Serves `dist/` with `npm run preview` on port 8080, or on `E2E_PORT` if set, and reuses an already-running server outside CI.
- Before any test, `src/__tests__/e2e/global-setup.ts` checks that the server is serving this checkout's `dist/`: every hashed `/_astro/` file the home page references must exist locally. A reused server from another checkout or a stale build fails fast instead of quietly testing the wrong site.
- Specs use relative URLs (`page.goto('/de/')`), resolved against `baseURL`, so they follow the port.
- In CI, retries twice and runs workers on half the runner's cores (`workers: '50%'`).

The config does **not** build the site. Build it first.

## Running Tests

```bash
npm run build          # produce dist/
npm run test:e2e       # all specs, headless
npm run test:e2e:headed
npm run test:e2e:debug
npx playwright test src/__tests__/e2e/i18n.spec.ts   # one spec
npx playwright show-report                            # HTML report
E2E_PORT=8090 npm run test:e2e                         # another port, e.g. alongside a second checkout
```

## Prerequisites

- Node.js 24 (pinned in `.nvmrc`)
- Google Chrome. If it's missing, install it or run `npx playwright install chrome`.

## Test Data

Tests upload Word fixtures from `src/__fixtures__/`, for example `h1.docx`, `multiple-headings.docx`, `table.docx` and `strong.docx`.

## Troubleshooting

**Port 8080 in use:** stop the other process (`lsof -i :8080`), run on a free port with `E2E_PORT=<port>`, or leave a preview of the current build running and Playwright will reuse it.

**`The server at … isn't serving this checkout's dist/`:** the server on the port is another checkout's preview, or this one's from before the last build. Stop it (`npx astro preview stop`), or pick a free port with `E2E_PORT=<port>`.

**`Process from config.webServer exited early`:** some environments make `astro preview` detach into the background. Start `npm run preview -- --port 8080` yourself (use the same port as `E2E_PORT` if you set one), then rerun the tests.

## Writing New Tests

```typescript
test('does the new thing', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#file', 'src/__fixtures__/h1.docx');
  await expect(page.locator('#output')).toContainText('# Heading 1');
});
```

Check selectors against the existing specs. Don't use fixed timeouts; wait with `await expect(...).toBeVisible()` and similar.
