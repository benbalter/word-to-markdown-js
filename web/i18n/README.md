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

## Review status

Non-English locales are a **machine-translated first pass and need native
review** before they can be considered final. `en` is authored. Legal pages
(Terms/Privacy) are intentionally English-only.

## Crowdin (crowdsourced translation)

Native review and community translations are managed in Crowdin, configured by
`crowdin.yml` (repo root) and synced by `.github/workflows/crowdin.yml`:

- The workflow **uploads `en.json`** to Crowdin when it changes on `main`, and
  on a weekly schedule **downloads completed translations** and opens a
  `New Crowdin translations` PR.
- Translations land back in `web/i18n/<code>.json` (Brazilian Portuguese →
  `pt.json`).
- Requires two repo secrets: `CROWDIN_PROJECT_ID` and `CROWDIN_PERSONAL_TOKEN`.

When reviewing a Crowdin PR: run `npm run fix` if its JSON formatting differs
from Prettier, and confirm `npm test` (the completeness test) passes. In the
Crowdin project, keep **"Skip untranslated strings" off** so every key is
exported (untranslated strings fall back to English) — otherwise the
completeness test will fail on missing keys.
