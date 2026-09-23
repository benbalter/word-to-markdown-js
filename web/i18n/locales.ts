// Single source of truth for the site's locales. astro.config.mjs (routing +
// sitemap), web/i18n/index.ts (UI), worker/index.js (edge redirect), and the
// tests all derive their lists from here, so adding a language means adding
// one entry below plus its web/i18n/<locale>.json dictionary.
//
// Keep this module pure data: it is imported by the Astro config, the
// Cloudflare Worker bundle, and Jest, none of which share Astro's runtime.

export interface LocaleMeta {
  /** <html lang> and hreflang value. */
  htmlLang: string;
  /** og:locale value. */
  ogLocale: string;
  /** Language tag for the sitemap's hreflang alternates. */
  sitemapLocale: string;
  /** Endonym (the language's own name) for the switcher — never a flag. */
  name: string;
}

// The key is the URL segment (e.g. `pt` → /pt/). Insertion order is the
// switcher order. English is the default and lives at the root.
// prettier-ignore
export const localeMeta = {
  en: { htmlLang: 'en', ogLocale: 'en_US', sitemapLocale: 'en-US', name: 'English' },
  id: { htmlLang: 'id', ogLocale: 'id_ID', sitemapLocale: 'id-ID', name: 'Bahasa Indonesia' },
  vi: { htmlLang: 'vi', ogLocale: 'vi_VN', sitemapLocale: 'vi-VN', name: 'Tiếng Việt' },
  pt: { htmlLang: 'pt-BR', ogLocale: 'pt_BR', sitemapLocale: 'pt-BR', name: 'Português' },
  es: { htmlLang: 'es', ogLocale: 'es_ES', sitemapLocale: 'es-ES', name: 'Español' },
  de: { htmlLang: 'de', ogLocale: 'de_DE', sitemapLocale: 'de-DE', name: 'Deutsch' },
  fr: { htmlLang: 'fr', ogLocale: 'fr_FR', sitemapLocale: 'fr-FR', name: 'Français' },
  zh: { htmlLang: 'zh-Hans', ogLocale: 'zh_CN', sitemapLocale: 'zh-CN', name: '简体中文' },
  ja: { htmlLang: 'ja', ogLocale: 'ja_JP', sitemapLocale: 'ja-JP', name: '日本語' },
  ko: { htmlLang: 'ko', ogLocale: 'ko_KR', sitemapLocale: 'ko-KR', name: '한국어' },
  ru: { htmlLang: 'ru', ogLocale: 'ru_RU', sitemapLocale: 'ru-RU', name: 'Русский' },
  it: { htmlLang: 'it', ogLocale: 'it_IT', sitemapLocale: 'it-IT', name: 'Italiano' },
  nl: { htmlLang: 'nl', ogLocale: 'nl_NL', sitemapLocale: 'nl-NL', name: 'Nederlands' },
  pl: { htmlLang: 'pl', ogLocale: 'pl_PL', sitemapLocale: 'pl-PL', name: 'Polski' },
  tr: { htmlLang: 'tr', ogLocale: 'tr_TR', sitemapLocale: 'tr-TR', name: 'Türkçe' },
  hi: { htmlLang: 'hi', ogLocale: 'hi_IN', sitemapLocale: 'hi-IN', name: 'हिन्दी' },
  th: { htmlLang: 'th', ogLocale: 'th_TH', sitemapLocale: 'th-TH', name: 'ไทย' },
  uk: { htmlLang: 'uk', ogLocale: 'uk_UA', sitemapLocale: 'uk-UA', name: 'Українська' },
  sv: { htmlLang: 'sv', ogLocale: 'sv_SE', sitemapLocale: 'sv-SE', name: 'Svenska' },
} as const satisfies Record<string, LocaleMeta>;

export type Locale = keyof typeof localeMeta;

export const locales = Object.keys(localeMeta) as Locale[];

export const defaultLocale: Locale = 'en';

/** Locales served under a URL prefix (everything but the root default). */
export const prefixedLocales = locales.filter((l) => l !== defaultLocale);
