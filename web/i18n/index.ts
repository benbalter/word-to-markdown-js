import type { UIStrings } from './types';
import { en } from './en';
import { id } from './id';
import { vi } from './vi';
import { pt } from './pt';
import { es } from './es';
import { de } from './de';
import { fr } from './fr';

export type { UIStrings, FaqEntry, Step } from './types';

// Locales that have a full translation. Keep in sync with astro.config.mjs
// (both the top-level `i18n` block and the sitemap `i18n` block).
export const locales = ['en', 'id', 'vi', 'pt', 'es', 'de', 'fr'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

// Per-locale metadata used in <head>. `name` is the endonym (the language's
// own name) — used for the language switcher; never use flags for languages.
// `htmlLang` doubles as the hreflang value; the locale key is the URL segment
// (e.g. key `pt` → /pt/ with htmlLang/hreflang `pt-BR`).
export const localeMeta: Record<
  Locale,
  { htmlLang: string; ogLocale: string; name: string }
> = {
  en: { htmlLang: 'en', ogLocale: 'en_US', name: 'English' },
  id: { htmlLang: 'id', ogLocale: 'id_ID', name: 'Bahasa Indonesia' },
  vi: { htmlLang: 'vi', ogLocale: 'vi_VN', name: 'Tiếng Việt' },
  pt: { htmlLang: 'pt-BR', ogLocale: 'pt_BR', name: 'Português' },
  es: { htmlLang: 'es', ogLocale: 'es_ES', name: 'Español' },
  de: { htmlLang: 'de', ogLocale: 'de_DE', name: 'Deutsch' },
  fr: { htmlLang: 'fr', ogLocale: 'fr_FR', name: 'Français' },
};

const dictionaries: Record<Locale, UIStrings> = {
  en,
  id,
  vi,
  pt,
  es,
  de,
  fr,
};

/** Narrow an arbitrary string (e.g. Astro.currentLocale) to a known Locale. */
export function asLocale(value: string | undefined): Locale {
  return (locales as readonly string[]).includes(value ?? '')
    ? (value as Locale)
    : defaultLocale;
}

/** Return the string set for a locale, falling back to English. */
export function useTranslations(locale: string | undefined): UIStrings {
  return dictionaries[asLocale(locale)];
}

// Root-relative path to a page in a given locale. The default locale lives at
// the root (prefixDefaultLocale: false); others are prefixed with `/<locale>`.
function localizedPath(locale: Locale, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return locale === defaultLocale ? clean : `/${locale}${clean}`;
}

export interface Alternate {
  /** hreflang value, e.g. "en", "id", or "x-default". */
  hreflang: string;
  /** Root-relative path; the Layout resolves it against `site` for an absolute URL. */
  path: string;
}

// hreflang cluster for a page that exists in every locale. MUST be
// self-referential — each localized page lists every locale plus x-default,
// not just the *other* languages (the most common hreflang mistake). One
// broken/404 alternate makes search engines discard the whole cluster, so only
// call this for pages that genuinely have a version in every listed locale.
export function getAlternates(path = '/'): Alternate[] {
  const alternates: Alternate[] = locales.map((locale) => ({
    hreflang: localeMeta[locale].htmlLang,
    path: localizedPath(locale, path),
  }));
  alternates.push({
    hreflang: 'x-default',
    path: localizedPath(defaultLocale, path),
  });
  return alternates;
}
