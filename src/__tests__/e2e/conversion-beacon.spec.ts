import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';

// The anonymous conversion counter's beacon (web/scripts/converter/
// analytics.ts). It only fires on word2md.com, so these tests serve this
// build at https://word2md.com through page.route() and stub
// navigator.sendBeacon to record what would be sent. Nothing reaches the real
// site: the routes answer every request, and the host resolver rule sends
// anything that slips past them to a closed local port instead.

const fixtures = fileURLToPath(new URL('../../__fixtures__/', import.meta.url));
const fixtureBase64 = (name: string): string =>
  readFileSync(path.join(fixtures, name)).toString('base64');

const PROD = 'https://word2md.com';

test.use({
  launchOptions: { args: ['--host-resolver-rules=MAP word2md.com 127.0.0.1'] },
});

// Serve the local build as word2md.com, record beacons, and stub WebMCP so
// the agent tool can be called.
async function openAsProduction(page: Page, baseURL: string): Promise<void> {
  await page.context().route(`${PROD}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/event') {
      await route.fulfill({ status: 204 });
      return;
    }
    const response = await route.fetch({
      url: `${baseURL}${url.pathname}${url.search}`,
    });
    await route.fulfill({ response });
  });
  await page.addInitScript(() => {
    const sent: string[] = [];
    (window as unknown as { __beacons: string[] }).__beacons = sent;
    navigator.sendBeacon = (url: string | URL) => {
      sent.push(String(url));
      return true;
    };
    const tools: Record<string, { execute: (i: unknown) => unknown }> = {};
    Object.defineProperty(document, 'modelContext', {
      value: {
        registerTool: (tool: { name: string; execute: () => unknown }) => {
          tools[tool.name] = tool;
        },
      },
    });
    (window as unknown as { __tools: typeof tools }).__tools = tools;
  });
  await page.goto(`${PROD}/`);
}

// The beacons sent so far, as parsed query parameters.
async function beacons(page: Page): Promise<Record<string, string>[]> {
  const urls = await page.evaluate(
    () => (window as unknown as { __beacons: string[] }).__beacons,
  );
  return urls.map((url) => {
    const parsed = new URL(url, PROD);
    expect(parsed.pathname).toBe('/api/event');
    return Object.fromEntries(parsed.searchParams);
  });
}

async function dispatchFiles(
  page: Page,
  kind: 'drop' | 'paste',
  names: string[],
): Promise<void> {
  const files = names.map((name) => ({ name, base64: fixtureBase64(name) }));
  await page.evaluate(
    ({ kind, files }) => {
      const data = new DataTransfer();
      for (const { name, base64 } of files) {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        data.items.add(new File([bytes], name));
      }
      const init = { bubbles: true, cancelable: true };
      document.body.dispatchEvent(
        kind === 'drop'
          ? new DragEvent('drop', { ...init, dataTransfer: data })
          : new ClipboardEvent('paste', { ...init, clipboardData: data }),
      );
    },
    { kind, files },
  );
}

test.describe('conversion beacon', () => {
  // A prefetch can still be proxying a chunk when a test ends; drop it
  // instead of failing on the closed context.
  test.afterEach(async ({ page }) => {
    await page.context().unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('a chosen file sends s=drop, and nothing else', async ({
    page,
    baseURL,
  }) => {
    await openAsProduction(page, baseURL!);
    await page.locator('#file').setInputFiles(path.join(fixtures, 'h1.docx'));
    await expect(page.locator('#output')).toContainText('#');
    await expect.poll(() => beacons(page)).toHaveLength(1);
    // Exactly these keys: no content, filename, size, or identifier.
    expect(await beacons(page)).toEqual([{ o: 'success', l: 'en', s: 'drop' }]);
  });

  test('a dropped file sends s=drop', async ({ page, baseURL }) => {
    await openAsProduction(page, baseURL!);
    await dispatchFiles(page, 'drop', ['h1.docx']);
    await expect(page.locator('#filename')).toHaveText('h1.docx');
    await expect
      .poll(() => beacons(page))
      .toEqual([{ o: 'success', l: 'en', s: 'drop' }]);
  });

  test('a pasted .docx and pasted rich text send s=paste', async ({
    page,
    baseURL,
  }) => {
    await openAsProduction(page, baseURL!);
    await dispatchFiles(page, 'paste', ['h1.docx']);
    await expect(page.locator('#filename')).toHaveText('h1.docx');
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData('text/html', '<h1>Pasted</h1><p>Hello</p>');
      document.body.dispatchEvent(
        new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: data,
        }),
      );
    });
    await expect(page.locator('#filename')).toHaveText('pasted.md');
    await expect
      .poll(() => beacons(page))
      .toEqual([
        { o: 'success', l: 'en', s: 'paste' },
        { o: 'success', l: 'en', s: 'paste' },
      ]);
  });

  test('a batch sends s=batch once per file', async ({ page, baseURL }) => {
    await openAsProduction(page, baseURL!);
    await dispatchFiles(page, 'drop', ['h1.docx', 'h2.docx']);
    await expect(page.locator('#batch-list li')).toHaveCount(2);
    await expect
      .poll(() => beacons(page))
      .toEqual([
        { o: 'success', l: 'en', s: 'batch' },
        { o: 'success', l: 'en', s: 'batch' },
      ]);
  });

  test('a WebMCP conversion sends s=webmcp', async ({ page, baseURL }) => {
    await openAsProduction(page, baseURL!);
    const result = await page.evaluate(
      (docx) =>
        (
          window as unknown as {
            __tools: Record<string, { execute: (i: unknown) => unknown }>;
          }
        ).__tools.convert_docx_to_markdown.execute({
          docx_base64: docx,
          filename: 'h1.docx',
        }) as Promise<{ isError?: boolean }>,
      fixtureBase64('h1.docx'),
    );
    expect(result.isError).toBeFalsy();
    await expect
      .poll(() => beacons(page))
      .toEqual([{ o: 'success', l: 'en', s: 'webmcp' }]);
  });

  test('a failed conversion sends o=error with its source', async ({
    page,
    baseURL,
  }) => {
    await openAsProduction(page, baseURL!);
    await page.locator('#file').setInputFiles({
      name: 'broken.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('not a docx'),
    });
    await expect(page.locator('#error-alert')).toBeVisible();
    await expect
      .poll(() => beacons(page))
      .toEqual([{ o: 'error', l: 'en', s: 'drop' }]);
  });

  test('sends nothing off word2md.com', async ({ page }) => {
    await page.addInitScript(() => {
      const sent: string[] = [];
      (window as unknown as { __beacons: string[] }).__beacons = sent;
      navigator.sendBeacon = (url: string | URL) => {
        sent.push(String(url));
        return true;
      };
    });
    const posts: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/event')) posts.push(request.url());
    });
    await page.goto('/');
    await page.locator('#file').setInputFiles(path.join(fixtures, 'h1.docx'));
    await expect(page.locator('#output')).toContainText('#');
    expect(await beacons(page)).toEqual([]);
    expect(posts).toEqual([]);
  });
});
