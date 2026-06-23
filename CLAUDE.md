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
npm run test:e2e     # Playwright end-to-end tests (builds + serves the site)
npm run lint         # eslint + prettier --check
npm run fix          # eslint --fix + prettier --write
npm run all          # fix + test + build + check-builds (run before pushing)
npm run check-builds # Fail if committed build/ output is stale (see below)
```

Run a single unit test: `NODE_OPTIONS=--experimental-vm-modules npx jest src/__tests__/smart-quotes.test.ts`
Run a single e2e spec: `npx playwright test src/__tests__/e2e/i18n.spec.ts`

Node 22.13.0 is pinned (`.nvmrc`, `.tool-versions`, Volta). The `--experimental-vm-modules` flag is required because the project is pure ESM and Jest runs the TS sources via `ts-jest` ESM preset.

## Architecture

One repo produces **three artifacts** from two source directories, and the two directories are owned by two different build tools that must never collide:

- **`src/`** — owned exclusively by `tsc`. Compiles to `build/` (the Node library `build/main.js` and the CLI `build/w2m` → `build/cli.js`). `src/index.ts` is the *browser* entry and is **excluded from tsc** (see `tsconfig.json`) because Astro/Vite bundles it instead; `astro check` type-checks it.
- **`web/`** — owned exclusively by Astro (`srcDir: ./web`). Builds the static site to `dist/`. Astro's `publicDir` is `./public`.

This split is deliberate so the two tool-chains don't fight over the same files. When adding code, put converter/CLI logic in `src/` and site/UI in `web/`.

### Conversion pipeline (`src/main.ts`)

The core converter is environment-agnostic (accepts a file path string in Node, or an `ArrayBuffer` in the browser). The pipeline:

1. **mammoth** — `.docx` → HTML
2. `processHtml` — single-pass DOM fixups: promote a table's first row to `<th>` (Turndown needs a header row), strip Unicode bullets from `<li>`
3. **Turndown** (`@joplin/turndown` + gfm plugin) — HTML → Markdown
4. `convertNumberedListsToBullets` → `normalizeText` (strip non-breaking spaces, smart quotes → ASCII)
5. **markdownlint** `applyFixes` → **prettier** (markdown parser)

`convert()` returns just the markdown string; `convertWithWarnings()` additionally calls `extractDocumentProperties()` (reads the `.docx` zip via JSZip to detect encryption, MIP/sensitivity labels, confidentiality markers, document protection) and returns `{ markdown, warnings }`. The CLI and web UI both use `convertWithWarnings`. Typed error classes (`UnsupportedFileError`, `FileNotFoundError`, `InvalidFileError`, `FilePermissionError`, `ConversionError`) are thrown for user-facing messaging — preserve them when refactoring.

### Browser entry (`src/index.ts`)

Privacy is a core constraint: **all conversion happens client-side; nothing is uploaded.** The heavy deps (mammoth, turndown, jszip, unified/remark/rehype, prettier, markdownlint ~400KB gzipped) are **dynamically `import()`ed** on first file use so the landing page paints without them, and speculatively prefetched on user intent / browser idle. Keep these imports lazy.

### i18n

English lives at the root (`prefixDefaultLocale: false`); other locales under a prefix (`/de/`, `/es/`, …). Each `web/pages/<locale>/index.astro` is a one-liner that renders the shared `web/components/Home.astro` with a `lang` prop. UI strings are per-locale JSON in `web/i18n/`, typed by `web/i18n/types.ts`.

**The locale list is duplicated in four places that MUST stay in sync** when adding a language: the top-level `i18n` block in `astro.config.mjs`, the `sitemap` `i18n` block in the same file, `locales` in `web/i18n/index.ts`, and `SUPPORTED_LOCALES` in `worker/index.js`. `src/__tests__/i18n-completeness.test.ts` enforces that every locale has every key (astro check can't see missing JSON keys).

### Deployment

The site deploys **two ways** from the same `dist/`:
- **GitHub Pages** via `.github/workflows/static.yml` (runs `build:site`).
- **Cloudflare Workers (Static Assets)** via `wrangler deploy` (`wrangler.jsonc`). `worker/index.js` runs **only on `/`** (`run_worker_first: ["/"]`) and 302-redirects first-time visitors to the best `Accept-Language` locale, setting a `lang` cookie so it fires at most once. The Worker is inert on GitHub Pages. Every other path is served straight from assets.

### Committed build artifacts

`build/` (the tsc library + CLI output) **is committed to git** and guarded by `npm run check-builds`, which CI runs — a stale `build/` fails CI. After changing anything in `src/` that affects the library/CLI, run `npm run build` and commit `build/`. `dist/` (the site) is **not** committed; it's built fresh in CI.
