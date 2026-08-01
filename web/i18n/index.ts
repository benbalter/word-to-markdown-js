import type { UIStrings } from './types';
// Translation content lives in per-locale JSON dictionaries (the standard format
// for translation-management tools like Crowdin/Weblate). The `Record` typing
// below documents the expected shape; completeness across locales is enforced at
// test time by src/__tests__/i18n-completeness.test.ts (astro check only reports
// diagnostics for .astro files, so it can't catch a missing JSON key). See
// web/i18n/README.md.
import en from './en.json';
import id from './id.json';
import vi from './vi.json';
import pt from './pt.json';
import es from './es.json';
import de from './de.json';
import fr from './fr.json';
import zh from './zh.json';
import ja from './ja.json';
import ko from './ko.json';
import ru from './ru.json';
import it from './it.json';
import nl from './nl.json';
import pl from './pl.json';
import tr from './tr.json';
import hi from './hi.json';
import th from './th.json';
import uk from './uk.json';
import sv from './sv.json';

export type { UIStrings, FaqEntry, Step } from './types';

// Locales that have a full translation. Keep in sync with astro.config.mjs
// (both the top-level `i18n` block and the sitemap `i18n` block).
export const locales = [
  'en',
  'id',
  'vi',
  'pt',
  'es',
  'de',
  'fr',
  'zh',
  'ja',
  'ko',
  'ru',
  'it',
  'nl',
  'pl',
  'tr',
  'hi',
  'th',
  'uk',
  'sv',
] as const;
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
  zh: { htmlLang: 'zh-Hans', ogLocale: 'zh_CN', name: '简体中文' },
  ja: { htmlLang: 'ja', ogLocale: 'ja_JP', name: '日本語' },
  ko: { htmlLang: 'ko', ogLocale: 'ko_KR', name: '한국어' },
  ru: { htmlLang: 'ru', ogLocale: 'ru_RU', name: 'Русский' },
  it: { htmlLang: 'it', ogLocale: 'it_IT', name: 'Italiano' },
  nl: { htmlLang: 'nl', ogLocale: 'nl_NL', name: 'Nederlands' },
  pl: { htmlLang: 'pl', ogLocale: 'pl_PL', name: 'Polski' },
  tr: { htmlLang: 'tr', ogLocale: 'tr_TR', name: 'Türkçe' },
  hi: { htmlLang: 'hi', ogLocale: 'hi_IN', name: 'हिन्दी' },
  th: { htmlLang: 'th', ogLocale: 'th_TH', name: 'ไทย' },
  uk: { htmlLang: 'uk', ogLocale: 'uk_UA', name: 'Українська' },
  sv: { htmlLang: 'sv', ogLocale: 'sv_SE', name: 'Svenska' },
};

const dictionaries: Record<Locale, UIStrings> = {
  en,
  id,
  vi,
  pt,
  es,
  de,
  fr,
  zh,
  ja,
  ko,
  ru,
  it,
  nl,
  pl,
  tr,
  hi,
  th,
  uk,
  sv,
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

// Localized URL generation is handled by the `astro:i18n` helpers
// (getRelativeLocaleUrl / getAbsoluteLocaleUrl) directly in the .astro layout,
// so it always respects `base`, `trailingSlash`, and the routing config rather
// than re-deriving paths here. The hreflang *cluster* is built in Layout.astro:
// it MUST stay self-referential (every localized page lists all locales plus
// x-default), so only flag a page as localized if it exists in every locale.
