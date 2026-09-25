# Translations

UI strings live in one JSON file per locale (`en.json`, `id.json`, `vi.json`,
`pt.json`, `es.json`, `de.json`, `fr.json`). `en.json` is the source of truth;
the others are translations of it.

JSON is used because it's the standard interchange format for translation
management tools (Crowdin, Weblate, Tolgee, etc.), so the project is ready to
wire up crowdsourced translation without further restructuring.

## How it fits together

- `types.ts` — the `UIStrings` interface every locale must satisfy.
- `*.json` — the translated strings.
- `locales.ts` — the single source of truth for locale codes and metadata
  (endonyms, `html lang`, `og:locale`, sitemap tags). The Astro config, the
  Cloudflare Worker, and the tests all derive their lists from it.
- `index.ts` — imports the JSON files into a `Record<Locale, UIStrings>` (so a
  locale without a dictionary is a type error), re-exports `locales.ts`, and
  exports `useTranslations(locale)` and `asLocale()`.
- `src/__tests__/i18n-completeness.test.ts` — fails `npm test` if any locale is
  missing/extra keys, has mismatched array lengths, or contains blank strings.
  (`astro check` only validates `.astro` files, so this test is the real guard.)

## Adding or editing a translation

1. Edit the relevant `*.json`. When adding a **new key**, add it to `en.json`
   first, then to every other locale (the completeness test enforces parity).
2. Adding a **new locale**: create `<locale>.json`, add an entry to
   `locales.ts`, and import the JSON into `dictionaries` in `index.ts`. Routing,
   the sitemap, the language switcher, and the edge redirect pick it up from
   there. Then generate its social card: `npm run build:site && npm run gen:og`.
3. Run `npm test` (completeness) and `npm run build` (type-check + validate).

## Right-to-left locales (`ar`)

- Set `dir: 'rtl'` on the entry in `locales.ts`; the layout renders it on
  `<html>`.
- In the JSON, wrap left-to-right tokens (`.docx`, `Word (.docx)`) in the
  isolate characters `⁦…⁩`, or the browser draws `.docx` as `docx.`.
- In markup, use logical utilities (`text-start`, `me-*`) and `rtl:` variants.
  Code stays `dir="ltr"`. Monospace labels with translated text also need
  `rtl:font-sans rtl:tracking-normal`: letter-spacing and the system
  monospace fallback both break Arabic's joined letters.
- Traditional Chinese (`zh-hant`) is the one locale a base-language match
  can't reach; `worker/index.js` maps `zh-TW`/`zh-HK`/`zh-MO`/`zh-Hant` to it.

## Review status

Non-English locales are a **machine-translated first pass and need native
review** before they can be considered final. `en` is authored. Legal pages
(Terms/Privacy) are intentionally English-only.
