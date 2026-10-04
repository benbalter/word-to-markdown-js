# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Astro dev server for the site
npm run build        # Full build: tsc (build:js) then Astro (build:site)
npm run build:js     # Compile the Node library + CLI to build/ (tsc)
npm run build:site   # Type-check (.astro) + build the static site to dist/
npm run preview      # Preview the production site build
npm test             # Jest unit/integration tests with coverage
npm run test:e2e     # Playwright end-to-end tests (serves dist/; run `npm run build` first)
npm run lint         # eslint + prettier --check
npm run typecheck    # tsc over the tests (tsconfig.test.json; ts-jest only transpiles)
npm run knip         # unused files, exports, and dependencies
npm run fix          # eslint --fix + prettier --write
npm run all          # fix + typecheck + test + build (not everything CI runs; see Deployment)
```

Run a single unit test: `NODE_OPTIONS=--experimental-vm-modules npx jest src/__tests__/smart-quotes.test.ts`

Run a single e2e spec: `npx playwright test src/__tests__/e2e/i18n.spec.ts`

Node 24.21.0 is pinned (`.nvmrc`, `.tool-versions`, Volta). The `--experimental-vm-modules` flag is required because the project is pure ESM and Jest runs the TS sources via `ts-jest` ESM preset.

## Architecture

One repo produces **three artifacts** from two source directories, and the two directories are owned by two different build tools that must never collide:

- **`src/`** — owned exclusively by `tsc`. Compiles to `build/` (the Node library `build/main.js` and the CLI `build/cli.js`, installed as `w2m` / `word-to-markdown`). `src/index.ts` is the _browser_ entry and is **excluded from tsc** (see `tsconfig.json`) because Astro/Vite bundles it instead; `astro check` type-checks it.
- **`web/`** — owned exclusively by Astro (`srcDir: ./web`). Builds the static site to `dist/`. Astro's `publicDir` is `./public`.

This split is deliberate so the two tool-chains don't fight over the same files. When adding code, put converter/CLI logic in `src/` and site/UI in `web/`.

### Conversion pipeline (`src/main.ts`)

The core converter is environment-agnostic (accepts a file path string in Node, or an `ArrayBuffer` in the browser). The pipeline:

1. **mammoth** — `.docx` → HTML. A `transformDocument` tags wholly-monospace paragraphs (Word's usual code-block encoding) with a synthetic style, which a style map — alongside the real `Preformatted Text`/`HTML Preformatted` styles — maps to `<pre><code>` so code fences verbatim (no Markdown escaping of `[] {} <> * -`)
2. `processHtml` — single-pass DOM fixups: unwrap single-cell `<pre>` code tables (Word wraps code blocks in a shaded 1×1 table), promote a table's first row to `<th>` (Turndown needs a header row), strip Unicode bullets from `<li>`, and (with `numberedLists: 'bullets'`) rename `<ol>` to `<ul>`, skipping Mammoth's footnote/endnote list
3. **Turndown** (`@joplin/turndown` + gfm plugin) — HTML → Markdown, with `addFootnoteRules` turning Mammoth's footnote/endnote markup into GFM `[^1]` footnotes (unless `footnotes: 'preserve'`)
4. `normalizeText` (strip non-breaking spaces, smart quotes → ASCII)
5. **markdownlint** `applyFixes` → **prettier** (markdown parser)

`convert()` returns just the markdown string; `convertWithWarnings()` additionally calls `extractDocumentProperties()` (reads the `.docx` zip via JSZip to detect encryption, MIP/sensitivity labels, confidentiality markers, document protection) and returns `{ markdown, warnings }`. The CLI and web UI both use `convertWithWarnings`. Typed error classes (`UnsupportedFileError`, `FileNotFoundError`, `InvalidFileError`, `FilePermissionError`, `ConversionError`) are thrown for user-facing messaging — preserve them when refactoring.

### Browser entry (`src/index.ts`)

Privacy is a core constraint: **all conversion happens client-side; nothing is uploaded.** The heavy deps (mammoth, turndown, jszip, unified/remark/rehype, prettier, markdownlint ~400KB gzipped) are **dynamically `import()`ed** on first file use so the landing page paints without them, and speculatively prefetched on user intent / browser idle. Keep these imports lazy.

### i18n

English lives at the root (`prefixDefaultLocale: false`); other locales under a prefix (`/de/`, `/es/`, …). `web/pages/index.astro` (English) and the dynamic `web/pages/[locale]/index.astro` (every other locale, via `getStaticPaths`) render the shared `web/components/Home.astro`; components read the locale from `Astro.currentLocale`, not a prop. UI strings are per-locale JSON in `web/i18n/`, typed by `web/i18n/types.ts`.

**`web/i18n/locales.ts` is the single source of truth for locales** (codes, `htmlLang`, `ogLocale`, sitemap tag, endonym). `astro.config.mjs` (routing + sitemap), `web/i18n/index.ts`, `worker/index.js`, and the tests all derive from it; keep it pure data, since the Astro config, the Worker bundle, and Jest all import it. To add a language: add an entry there, add `web/i18n/<locale>.json` and its import in the `dictionaries` record in `web/i18n/index.ts` (a missing one is a type error), then run `npm run build:site && npm run gen:og` to create `public/og/<locale>.png`. `src/__tests__/i18n-completeness.test.ts` enforces that every locale has every key (astro check can't see missing JSON keys), and `i18n-locale-sync.test.ts` that each locale has its dictionary and OG image. `i18n-redirect.test.ts` uses `fa`/`he`/`el` as "unsupported" languages and asserts they stay that way. To bulk-add locales, `scripts/translate-i18n.mjs` generates structure-preserving `web/i18n/<locale>.json` files (see `scripts/README.md`).

### Deployment

The site deploys to **Cloudflare Workers (Static Assets)** via `wrangler deploy` (`wrangler.jsonc`), serving `dist/`. `worker/index.js` runs **only on `/` and `/api/event`** (`run_worker_first`): it 302-redirects first-time visitors on `/` to the best `Accept-Language` locale (a `lang` cookie, set by localized pages only, makes it fire at most once) and counts anonymous conversions on `/api/event`. Visitors who stay on the English root can instead get a dismissible "also available in …" banner: `pickSuggestion` picks a supported language listed after English, else one mapped to their `request.cf.country` (`countries` in `locales.ts`), and the Worker tags `<html data-suggest-locale>` via HTMLRewriter for `web/components/home/LanguageSuggestion.astro` to reveal. Location only ever suggests, never redirects; a `hint=off` cookie ends it. Every other path is served straight from assets; unknown paths get `dist/404.html` (`not_found_handling`). Response headers (security headers, immutable caching for `/_astro/*`) live in `public/_headers`.

**Every push to `main` deploys production.** Cloudflare's Git integration (Workers Builds) builds and deploys word2md.com from each commit on `main` without waiting for CI, and its build command (`npm run build`) runs no tests. Every other branch gets a Worker Previews build (`npm run build && npm test`, then `npx wrangler preview`) with a preview URL, the only place the Worker runs before production. The `workers.dev` route is off (`workers_dev: false`). The `main` ruleset requires CI on pull requests, but admins bypass it, so a direct push deploys before CI finishes, and a red CI run doesn't stop it. Before pushing or merging to `main`, run `npm run all && npm run knip`, plus `npm run test:e2e` for site changes and `npx wrangler deploy --dry-run --outdir "$(mktemp -d)"` for Worker or `wrangler.jsonc` changes. `npm run all` alone skips knip, e2e, the Worker bundle check and `npm audit`, which CI runs. Never run `wrangler deploy` yourself.

**CSP:** every page carries a Content-Security-Policy `<meta>` generated by Astro (`security.csp` in `astro.config.mjs`), with hashes for inline scripts/styles and `connect-src 'self'`. Don't use `style="…"` attributes in markup — they're blocked (set styles via classes, or via `element.style` from JS, which CSP allows). Two traps: Astro only hashes scripts it processes, so **never use `<script is:inline>`** (a server-side condition goes in a `data-*` attribute the processed script reads); and a boolean `data-*` prop renders `{false}` as `"false"`, so pass `undefined` to omit it. `src/__tests__/e2e/csp.spec.ts` fails on any reported violation.

### Build artifacts (`build/`, `dist/`)

Both `build/` (the tsc library + CLI output) and `dist/` (the site) are **gitignored** — neither is committed. CI rebuilds them: the `build` job runs `npm run build` before `npm run test`, so `build/cli.js` exists when the tests run, and uploads `dist/` for the e2e job to serve instead of rebuilding. Tests that need the built CLI (`src/__tests__/cli.test.ts`) rebuild it when it's missing or older than the sources, so a fresh `npm test` works without a prior `npm run build`.

### Releasing

Publishing a GitHub Release runs [`release.yml`](.github/workflows/release.yml), which publishes the package to npm; [CONTRIBUTING](CONTRIBUTING.md#cutting-a-release) has the steps. Neither the `npm` environment nor the `v*` tag ruleset needs anyone's approval when an admin's credentials are used. Releases happen only after the owner explicitly approves that release. Agents may prepare the version-bump pull request (`npm version <x> --no-git-tag-version` updates `package.json` and `package-lock.json` without creating a tag, plus [`CHANGELOG.md`](CHANGELOG.md)), but never push a tag, create a GitHub Release, or run `npm publish`. Push branches with `git push --no-follow-tags`.
