import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// The locale list is duplicated across four sources that MUST stay in sync when
// a language is added (see CLAUDE.md). i18n-completeness.test.ts checks that the
// JSON dictionaries have matching keys, but nothing checks that these four
// declarations agree. This test parses each source and fails if they diverge.

const repoRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

function read(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

// Extract the single-quoted tokens from the first regex capture group.
function quotedTokens(source: string, pattern: RegExp): string[] {
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`Could not locate locale list with ${pattern}`);
  }
  return (match[1].match(/'([^']+)'/g) ?? []).map((t) => t.replace(/'/g, ''));
}

const astroConfig = read('astro.config.mjs');
const i18nIndex = read('web/i18n/index.ts');
const worker = read('worker/index.js');

// astro.config.mjs top-level i18n block: `locales: ['en', 'id', ...]`
const astroTopLevel = quotedTokens(
  astroConfig,
  /locales:\s*\[([^\]]+)\]/,
).sort();

// astro.config.mjs sitemap block: `locales: { en: 'en-US', id: 'id-ID', ... }`
const sitemapBlock = astroConfig.match(/locales:\s*\{([^}]+)\}/);
if (!sitemapBlock) throw new Error('Could not locate sitemap locales object');
const astroSitemap = (sitemapBlock[1].match(/(\w+):/g) ?? [])
  .map((k) => k.replace(':', ''))
  .sort();

// web/i18n/index.ts: `export const locales = ['en', 'id', ...]`
const indexLocales = quotedTokens(
  i18nIndex,
  /export const locales = \[([^\]]+)\]/,
).sort();

// worker/index.js: `export const SUPPORTED_LOCALES = ['id', 'vi', ...]` (no 'en')
const workerLocales = quotedTokens(
  worker,
  /export const SUPPORTED_LOCALES = \[([^\]]+)\]/,
).sort();

describe('i18n locale list sync', () => {
  it('astro.config.mjs top-level i18n matches web/i18n/index.ts', () => {
    expect(astroTopLevel).toEqual(indexLocales);
  });

  it('astro.config.mjs sitemap block matches web/i18n/index.ts', () => {
    expect(astroSitemap).toEqual(indexLocales);
  });

  it('worker SUPPORTED_LOCALES matches web/i18n/index.ts minus the default', () => {
    const nonDefault = indexLocales.filter((l) => l !== 'en');
    expect(workerLocales).toEqual(nonDefault);
  });

  it.each(indexLocales)('locale "%s" has a page and a dictionary', (locale) => {
    const pagePath =
      locale === 'en'
        ? 'web/pages/index.astro'
        : `web/pages/${locale}/index.astro`;
    expect(existsSync(path.join(repoRoot, pagePath))).toBe(true);
    expect(existsSync(path.join(repoRoot, `web/i18n/${locale}.json`))).toBe(
      true,
    );
  });
});
