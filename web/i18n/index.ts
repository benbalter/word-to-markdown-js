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
import zhHant from './zh-hant.json';
import ar from './ar.json';
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

import { defaultLocale, locales, type Locale } from './locales';

export type { UIStrings, FaqEntry, Step } from './types';

export { localeMeta, locales, defaultLocale, prefixedLocales } from './locales';
export type { Locale, LocaleMeta } from './locales';

// Record<Locale, …> makes a locale without a dictionary a type error, so a new
// entry in ./locales.ts can't ship half-wired.
const dictionaries: Record<Locale, UIStrings> = {
  en,
  id,
  vi,
  pt,
  es,
  ar,
  de,
  fr,
  zh,
  'zh-hant': zhHant,
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
