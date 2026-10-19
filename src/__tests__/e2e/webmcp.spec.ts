import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';

// WebMCP tools (web/scripts/converter/webmcp.ts). No shipping browser exposes
// document.modelContext to Playwright yet, so a stub records registrations
// and the test calls each tool's execute() as an agent's browser would.

const fixtures = fileURLToPath(new URL('../../__fixtures__/', import.meta.url));
const fixture = (name: string): string =>
  readFileSync(path.join(fixtures, name)).toString('base64');

interface ToolResult {
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

async function stubModelContext(page: Page): Promise<void> {
  await page.addInitScript(() => {
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
}

function callTool(page: Page, name: string, input: object = {}) {
  return page.evaluate(
    ([n, i]) =>
      (
        window as unknown as {
          __tools: Record<string, { execute: (i: unknown) => unknown }>;
        }
      ).__tools[n as string].execute(i) as Promise<ToolResult>,
    [name, input] as const,
  );
}

test.describe('WebMCP tools', () => {
  test('registers the converter tools', async ({ page }) => {
    await stubModelContext(page);
    await page.goto('/');
    const names = await page.evaluate(() =>
      Object.keys((window as unknown as { __tools: object }).__tools),
    );
    expect(names).toEqual([
      'convert_docx_to_markdown',
      'get_converted_markdown',
    ]);
  });

  test('converts a .docx for an agent and shows it on the page', async ({
    page,
  }) => {
    await stubModelContext(page);
    await page.goto('/');

    const empty = await callTool(page, 'get_converted_markdown');
    expect(empty.isError).toBe(true);

    const result = await callTool(page, 'convert_docx_to_markdown', {
      docx_base64: fixture('h1.docx'),
      filename: 'h1.docx',
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toMatch(/^# /);
    await expect(page.locator('#output')).toHaveText(result.content[0].text);
    await expect(page.locator('#filename')).toHaveText('h1.docx');

    const current = await callTool(page, 'get_converted_markdown');
    expect(current.structuredContent).toMatchObject({
      filename: 'h1.docx',
      markdown: result.content[0].text,
    });
  });

  test('omits inline images unless asked', async ({ page }) => {
    await stubModelContext(page);
    await page.goto('/');
    const input = { docx_base64: fixture('image.docx') };

    const without = await callTool(page, 'convert_docx_to_markdown', input);
    expect(without.content[0].text).not.toContain('data:image');
    expect(without.content[0].text).toContain('(image-omitted)');
    expect(without.structuredContent?.images_omitted).toBe(1);
    // The page still shows the real image.
    await expect(page.locator('#output')).toContainText('data:image');

    const withImages = await callTool(page, 'convert_docx_to_markdown', {
      ...input,
      include_images: true,
    });
    expect(withImages.content[0].text).toContain('data:image');
  });

  test('reports bad input as a tool error', async ({ page }) => {
    await stubModelContext(page);
    await page.goto('/');
    const result = await callTool(page, 'convert_docx_to_markdown', {
      docx_base64: btoa('not a docx'),
    });
    expect(result.isError).toBe(true);
  });
});
