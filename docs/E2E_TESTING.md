# End-to-End Testing with Playwright

The E2E suite uses [Playwright](https://playwright.dev/) to test the built
static site (`dist/`) in a real browser. There is no server-side API: all
conversion happens client-side, so every test drives the web UI.

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
- Serves `dist/` with `npm run preview -- --port 8080` and reuses an
  already-running server outside CI.
- Retries twice and runs one worker in CI.

The config does **not** build the site. Build it first.

## Running Tests

```bash
npm run build          # produce dist/
npm run test:e2e       # all specs, headless
npm run test:e2e:headed
npm run test:e2e:debug
npx playwright test src/__tests__/e2e/i18n.spec.ts   # one spec
npx playwright show-report                            # HTML report
```

## Prerequisites

- Node.js 24 (pinned in `.nvmrc`)
- Google Chrome. If it's missing, install it or run
  `npx playwright install chrome`.

## Test Data

Tests upload Word fixtures from `src/__fixtures__/`, for example `h1.docx`,
`multiple-headings.docx`, `table.docx` and `strong.docx`.

## Troubleshooting

**Port 8080 in use:** stop the other process (`lsof -i :8080`), or leave a
preview of the current build running and Playwright will reuse it.

**`Process from config.webServer exited early`:** some environments make
`astro preview` detach into the background. Start `npm run preview -- --port
8080` yourself, then rerun the tests.

## Writing New Tests

```typescript
test('does the new thing', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#file', 'src/__fixtures__/h1.docx');
  await expect(page.locator('#output')).toContainText('# Heading 1');
});
```

Check selectors against the existing specs. Don't use fixed timeouts; wait
with `await expect(...).toBeVisible()` and similar.
