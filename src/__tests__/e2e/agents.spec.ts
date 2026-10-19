import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// What crawlers and AI agents read: robots.txt, llms.txt / llms-full.txt,
// each page's Markdown twin, and the JSON-LD. The generated files come from
// web/agent/markdown.ts; the Worker's Accept negotiation is unit-tested in
// worker.test.ts, since the preview server doesn't run the Worker.

const en = JSON.parse(
  readFileSync(new URL('../../../web/i18n/en.json', import.meta.url), 'utf8'),
) as { faqs: { q: string }[]; steps: { t: string }[] };

test.describe('Agent-readable surfaces', () => {
  test('robots.txt welcomes crawlers and states content signals', async ({
    request,
  }) => {
    const body = await (await request.get('/robots.txt')).text();
    expect(body).toContain('Allow: /');
    expect(body).toMatch(
      /^Content-Signal: search=yes, ai-input=yes, ai-train=yes$/m,
    );
    expect(body).toContain('Sitemap: https://word2md.com/sitemap-index.xml');
  });

  test('llms.txt links a Markdown twin for every page, and each one exists', async ({
    request,
  }) => {
    const llms = await (await request.get('/llms.txt')).text();
    expect(llms).toMatch(/^# Word to Markdown$/m);
    expect(llms).toContain('npx word-to-markdown');
    expect(llms).toContain('npx -y word-to-markdown mcp');
    expect(llms).toContain('https://md2word.app/');

    const twins = [
      ...llms.matchAll(/\(https:\/\/word2md\.com(\/[^)]+\.md)\)/g),
    ].map((m) => m[1]);
    expect(twins).toEqual([
      '/index.md',
      '/google-docs-to-markdown.md',
      '/docx-to-markdown-for-llms.md',
      '/developers.md',
      '/privacy.md',
      '/terms.md',
    ]);
    for (const path of twins) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
      expect(res.headers()['content-type'], path).toContain('text/markdown');
      expect(await res.text(), path).toMatch(/^# /);
    }
  });

  test('the home twin carries the page copy, steps, and every FAQ', async ({
    request,
  }) => {
    const md = await (await request.get('/index.md')).text();
    for (const step of en.steps) expect(md).toContain(`**${step.t}:**`);
    for (const faq of en.faqs) expect(md).toContain(`### ${faq.q}`);
    // Literal Markdown in table cells survives as code, backticks included.
    expect(md).toContain('| Code | `` `code` `` |');
    expect(md).toContain('| Tables | `\\| a \\| b \\|` |');
  });

  test('llms-full.txt includes every page', async ({ request }) => {
    const full = await (await request.get('/llms-full.txt')).text();
    expect(full).toContain('# Word to Markdown');
    expect(full).toContain('# Your privacy');
    expect(full).toContain('# Terms of Use');
  });

  for (const path of [
    '/google-docs-to-markdown/',
    '/docx-to-markdown-for-llms/',
    '/developers/',
  ]) {
    test(`guide ${path} is English-only, linked, and described`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page.locator('h1')).toHaveCount(1);
      // No hreflang cluster: these pages exist only in English.
      await expect(page.locator('link[hreflang]')).toHaveCount(0);
      await expect(
        page.locator('link[rel="alternate"][type="text/markdown"]'),
      ).toHaveAttribute('href', `${path.slice(0, -1)}.md`);
      // Its own social card, not the site default (scripts/gen-og.mjs).
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
        'content',
        `https://word2md.com/og/guides${path.slice(0, -1)}.png`,
      );
      const json = await page
        .locator('script[type="application/ld+json"]')
        .textContent();
      expect(JSON.parse(json!)['@type']).toBe('TechArticle');
      // Every guide is one click from any page's footer.
      await page.goto('/de/');
      await expect(page.locator(`footer a[href="${path}"]`)).toHaveCount(1);
    });
  }

  test('English pages advertise their twin; localized ones do not', async ({
    page,
  }) => {
    const alt = page.locator('link[rel="alternate"][type="text/markdown"]');
    await page.goto('/');
    await expect(alt).toHaveAttribute('href', '/index.md');
    await page.goto('/terms/');
    await expect(alt).toHaveAttribute('href', '/terms.md');
    await page.goto('/de/');
    await expect(alt).toHaveCount(0);
  });

  test('JSON-LD describes the app, the package, the steps, and the FAQ', async ({
    page,
  }) => {
    await page.goto('/');
    const json = await page
      .locator('script[type="application/ld+json"]')
      .textContent();
    const graph = JSON.parse(json!)['@graph'] as Record<string, unknown>[];
    expect(graph.map((n) => n['@type'])).toEqual([
      'WebApplication',
      'WebSite',
      'SoftwareSourceCode',
      'Book',
      'HowTo',
      'FAQPage',
    ]);
    const howTo = graph.find((n) => n['@type'] === 'HowTo')!;
    expect((howTo.step as unknown[]).length).toBe(en.steps.length);
  });
});
