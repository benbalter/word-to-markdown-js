import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Completeness guard for the translation dictionaries. `astro check` only
// reports diagnostics for .astro files, so it does NOT catch a missing/extra
// key inside the imported JSON. This test is the real enforcement: every locale
// must structurally match the English source (same keys, same array lengths,
// no blank strings).

const i18nDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../web/i18n',
);

function load(locale: string): unknown {
  return JSON.parse(readFileSync(path.join(i18nDir, `${locale}.json`), 'utf8'));
}

// Flatten to the set of dotted leaf paths (array indices included), so missing
// keys, extra keys, and differing array lengths all surface as a set mismatch.
function leafPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => leafPaths(v, `${prefix}[${i}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) =>
      leafPaths(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [prefix];
}

const localeFiles = readdirSync(i18nDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));
const otherLocales = localeFiles.filter((l) => l !== 'en');

const en = load('en');
const enPaths = leafPaths(en).sort();

describe('i18n dictionary completeness', () => {
  it('has more than just the English source', () => {
    expect(otherLocales.length).toBeGreaterThan(0);
  });

  it.each(otherLocales)(
    '%s has exactly the same keys/structure as en',
    (locale) => {
      const paths = leafPaths(load(locale)).sort();
      const missing = enPaths.filter((p) => !paths.includes(p));
      const extra = paths.filter((p) => !enPaths.includes(p));
      expect({ locale, missing, extra }).toEqual({
        locale,
        missing: [],
        extra: [],
      });
    },
  );

  it.each(localeFiles)('%s has no blank string values', (locale) => {
    const blanks = leafPaths(load(locale)).filter((p) => {
      // Re-resolve each leaf path to its value and flag empties.
      const value = p
        .split(/\.|\[/)
        .map((s) => s.replace(/\]$/, ''))
        .reduce<unknown>(
          (acc, k) => (acc as Record<string, unknown>)?.[k],
          load(locale),
        );
      return typeof value === 'string' && value.trim() === '';
    });
    expect(blanks).toEqual([]);
  });
});
