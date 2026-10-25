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
// `failConverter` makes both the Web Worker and the main-thread fallback
// chunk fail to download, as after a deploy replaces them mid-session.
async function openAsProduction(
  page: Page,
  baseURL: string,
  { failConverter = false } = {},
): Promise<void> {
  await page.context().route(`${PROD}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/event') {
      await route.fulfill({ status: 204 });
      return;
    }
    if (
      failConverter &&
      /^\/_astro\/(converter\.worker-|main\.)/.test(url.pathname)
    ) {
      await route.abort();
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

  // Each kind the page can tell apart, with the file that causes it and the
  // message the visitor sees, which the kind must match.
  const DOCX =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  // The OLE compound-file signature: a legacy .doc (or a password-protected
  // .docx) renamed to .docx.
  const OLE = Buffer.concat([
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    Buffer.alloc(504),
  ]);
  // A zip bomb: h1.docx with its central directory claiming
  // word/document.xml unpacks to 300 MB (error-messages.test.ts has more).
  const bomb = readFileSync(path.join(fixtures, 'h1.docx'));
  for (let i = bomb.indexOf('PK\x01\x02'); i !== -1;) {
    const nameLength = bomb.readUInt16LE(i + 28);
    if (
      bomb.toString('latin1', i + 46, i + 46 + nameLength) ===
      'word/document.xml'
    ) {
      bomb.writeUInt32LE(300 * 1024 * 1024, i + 24);
    }
    i = bomb.indexOf('PK\x01\x02', i + 46 + nameLength);
  }
  for (const { kind, name, buffer, message } of [
    {
      kind: 'invalid',
      name: 'broken.docx',
      buffer: Buffer.from('not a docx'),
      message: /couldn.t be read as a Word document/i,
    },
    {
      kind: 'protected',
      name: 'renamed.docx',
      buffer: OLE,
      message: /password/i,
    },
    {
      kind: 'not-docx',
      name: 'notes.pdf',
      buffer: Buffer.from('%PDF-1.7'),
      message: /isn.t a Word document/i,
    },
    {
      kind: 'too-large',
      name: 'bomb.docx',
      buffer: bomb,
      message: /unpacks to more than 200 MB/i,
    },
  ]) {
    test(`a failed conversion sends o=error, its source, and e=${kind}`, async ({
      page,
      baseURL,
    }) => {
      await openAsProduction(page, baseURL!);
      await page
        .locator('#file')
        .setInputFiles({ name, mimeType: DOCX, buffer });
      await expect(page.locator('#error-alert')).toContainText(message);
      await expect
        .poll(() => beacons(page))
        .toEqual([{ o: 'error', l: 'en', s: 'drop', e: kind }]);
    });
  }

  test('a converter that fails to load sends e=load', async ({
    page,
    baseURL,
  }) => {
    await openAsProduction(page, baseURL!, { failConverter: true });
    await page.locator('#file').setInputFiles(path.join(fixtures, 'h1.docx'));
    await expect(page.locator('#error-alert')).toBeVisible({ timeout: 15000 });
    await expect
      .poll(() => beacons(page))
      .toEqual([{ o: 'error', l: 'en', s: 'drop', e: 'load' }]);
  });

  test('a failed file in a batch sends its kind', async ({ page, baseURL }) => {
    await openAsProduction(page, baseURL!);
    await page.locator('#file').setInputFiles([
      {
        name: 'h1.docx',
        mimeType: DOCX,
        buffer: readFileSync(path.join(fixtures, 'h1.docx')),
      },
      { name: 'broken.docx', mimeType: DOCX, buffer: Buffer.from('nope') },
    ]);
    await expect(page.locator('#batch-list li')).toHaveCount(2);
    await expect
      .poll(() => beacons(page))
      .toEqual([
        { o: 'success', l: 'en', s: 'batch' },
        { o: 'error', l: 'en', s: 'batch', e: 'invalid' },
      ]);
  });

  test('a file refused before converting sends nothing', async ({
    page,
    baseURL,
  }) => {
    // Only attempted conversions count, so a legacy .doc, which the page
    // turns away up front, isn't one.
    await openAsProduction(page, baseURL!);
    await page.locator('#file').setInputFiles({
      name: 'old.doc',
      mimeType: 'application/msword',
      buffer: OLE,
    });
    await expect(page.locator('#error-alert')).toBeVisible();
    expect(await beacons(page)).toEqual([]);
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
