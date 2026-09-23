import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  defaultLocale,
  locales,
  prefixedLocales,
} from '../../web/i18n/locales.ts';
import { LOCALES, SUPPORTED_LOCALES } from '../../worker/index.js';

// Every consumer derives its locale list from web/i18n/locales.ts, so the lists
// can't drift. What's left to guard is the per-locale files that the module
// can't create for you: the dictionary and the social-card image.

const repoRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

describe('i18n locale wiring', () => {
  it('has English as the default and first locale', () => {
    expect(defaultLocale).toBe('en');
    expect(locales[0]).toBe('en');
    expect(prefixedLocales).not.toContain('en');
  });

  it('the worker uses the shared locale list', () => {
    expect(LOCALES).toEqual(locales);
    expect(SUPPORTED_LOCALES).toEqual(prefixedLocales);
  });

  it.each(locales)('locale "%s" has a dictionary and an OG image', (locale) => {
    expect(existsSync(path.join(repoRoot, `web/i18n/${locale}.json`))).toBe(
      true,
    );
    expect(existsSync(path.join(repoRoot, `public/og/${locale}.png`))).toBe(
      true,
    );
  });
});
