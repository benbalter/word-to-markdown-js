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
npm run typecheck    # tsc over the tests (tsconfig.test.json; ts-jest only transpiles) and the browser code (tsconfig.browser.json)
npm run knip         # unused files, exports, and dependencies
npm run fix          # eslint --fix + prettier --write
npm run all          # fix + typecheck + test + build (quick loop; not everything CI runs)
npm run check        # what CI's build job runs: lint + typecheck + knip + build + test + Worker bundle check
```

Run a single unit test: `NODE_OPTIONS=--experimental-vm-modules npx jest src/__tests__/smart-quotes.test.ts`

Run a single e2e spec: `npx playwright test src/__tests__/e2e/i18n.spec.ts`. The preview server uses port 8080; set `E2E_PORT=<port>` to run alongside another checkout's suite (a global setup fails fast if the server on the port isn't serving this checkout's `dist/`).

Node 24.21.0 is pinned (`.nvmrc`, `.tool-versions`, Volta). The `--experimental-vm-modules` flag is required because the project is pure ESM and Jest runs the TS sources via `ts-jest` ESM preset.

## Architecture

One repo produces **three artifacts** from two source directories, and the two directories are owned by two different build tools that must never collide:

- **`src/`** — owned exclusively by `tsc`. Compiles to `build/` (the Node library `build/main.js` and the CLI `build/cli.js`, installed as `w2m` / `word-to-markdown`). `src/index.ts` is the _browser_ entry and, with `src/worker-client.ts` and the worker files, is **excluded from tsc** (see `tsconfig.json`) because Astro/Vite bundles it instead. `astro check` doesn't reach `.ts` modules, so `npm run typecheck` checks the browser code through `tsconfig.browser.json`.
- **`web/`** — owned exclusively by Astro (`srcDir: ./web`). Builds the static site to `dist/`. Astro's `publicDir` is `./public`.

This split is deliberate so the two tool-chains don't fight over the same files. When adding code, put converter/CLI logic in `src/` and site/UI in `web/`.

### Conversion pipeline (`src/main.ts`)

The core converter is environment-agnostic (accepts a file path string in Node, or an `ArrayBuffer` in the browser). The pipeline:

0. `extractEquations` (`src/equations.ts`) — Mammoth drops Office Math, so unless `equations: 'strip'`, each `<m:oMath>`/`<m:oMathPara>` is converted to LaTeX and swapped in the `.docx` for a plain-text placeholder run; `restoreEquations` puts it back as `$…$` (or a `$$` block when alone on its line) after step 5, so Turndown never escapes it
1. **mammoth** — `.docx` → HTML. A `transformDocument` tags wholly-monospace paragraphs (Word's usual code-block encoding) with a synthetic style, which a style map — alongside the real `Preformatted Text`/`HTML Preformatted` styles — maps to `<pre><code>` so code fences verbatim (no Markdown escaping of `[] {} <> * -`)
2. `processHtml` — single-pass DOM fixups: unwrap single-cell `<pre>` code tables (Word wraps code blocks in a shaded 1×1 table), expand merged cells (`colspan`/`rowspan`) into a full grid so every row matches the header, flatten lists and headings in cells into `<br>`-separated lines (so the table stays a GFM table instead of raw HTML), rewrite links to Word bookmarks (`#_Toc…`) to the target heading's GitHub slug (via `github-slugger`) or unwrap them, promote a table's first row to `<th>` (Turndown needs a header row), strip Unicode bullets from `<li>`, and (with `numberedLists: 'bullets'`) rename `<ol>` to `<ul>`, skipping Mammoth's footnote/endnote list
3. **Turndown** (`@joplin/turndown` + gfm plugin) — HTML → Markdown, with `addFootnoteRules` turning Mammoth's footnote/endnote markup into GFM `[^1]` footnotes (unless `footnotes: 'preserve'`)
4. `normalizeText` (strip non-breaking spaces, smart quotes → ASCII)
5. **markdownlint** `applyFixes` → **prettier** (markdown parser)

`convertHtml()` runs steps 2–5 on an HTML string (rich text pasted onto word2md.com; the worker accepts `{ id, html }` messages), after stripping Word and Google Docs clipboard markup. `convert()` returns just the markdown string; `convertWithWarnings()` additionally calls `extractDocumentProperties()` (reads the `.docx` zip via JSZip to detect encryption, MIP/sensitivity labels, confidentiality markers, document protection) and returns a `ConvertResult`: `{ markdown, warnings, warningDetails, images? }`, where `warningDetails` gives each warning a machine-readable `kind` and `images` is set only with `images: 'extract'`. The CLI and web UI both use `convertWithWarnings`. Typed error classes (`UnsupportedFileError`, `FileNotFoundError`, `InvalidFileError`, `FilePermissionError`, `ConversionError`) are thrown for user-facing messaging — preserve them when refactoring.

### Browser entry (`src/index.ts`)

Privacy is a core constraint: **all conversion happens client-side; nothing is uploaded.** The heavy deps are **loaded lazily** so the landing page paints without them (its own script is ~8KB gzipped). Keep these imports lazy:

- The converter (mammoth, turndown, jszip, domino, prettier, markdownlint, ~355KB gzipped) runs in a Web Worker (`src/converter.worker.ts`, driven by `src/worker-client.ts`), started on user intent or browser idle. A main-thread copy (`import('./main.js')`) loads only if the worker can't start.
- The preview renderer (unified/remark/rehype, ~52KB gzipped) runs on the main thread and loads when a conversion starts (`web/scripts/converter/preview.ts`).

`src/index.ts` wires the page's events to the conversion; the UI pieces (alerts, warnings, downloads, preview, strings, analytics) live in `web/scripts/converter/`, Astro-owned like the rest of the site and so outside tsc and the npm package.

### i18n

English lives at the root (`prefixDefaultLocale: false`); other locales under a prefix (`/de/`, `/es/`, …). `web/pages/index.astro` (English) and the dynamic `web/pages/[locale]/index.astro` (every other locale, via `getStaticPaths`) render the shared `web/components/Home.astro`; components read the locale from `Astro.currentLocale`, not a prop. UI strings are per-locale JSON in `web/i18n/`, typed by `web/i18n/types.ts`.

**`web/i18n/locales.ts` is the single source of truth for locales** (codes, `htmlLang`, `ogLocale`, sitemap tag, endonym). `astro.config.mjs` (routing + sitemap), `web/i18n/index.ts`, `worker/index.js`, and the tests all derive from it; keep it pure data, since the Astro config, the Worker bundle, and Jest all import it. To add a language: add an entry there, add `web/i18n/<locale>.json` and its import in the `dictionaries` record in `web/i18n/index.ts` (a missing one is a type error), then run `npm run build:site && npm run gen:og` to create `public/og/<locale>.png`. `src/__tests__/i18n-completeness.test.ts` enforces that every locale has every key (astro check can't see missing JSON keys), and `i18n-locale-sync.test.ts` that each locale has its dictionary and OG image (and each guide in `web/content/guides` its `public/og/guides/<id>.png`; after adding a guide, `npm run build:site && npm run gen:og -- guides`). `i18n-redirect.test.ts` uses `fa`/`he`/`el` as "unsupported" languages and asserts they stay that way. To bulk-add locales, `scripts/translate-i18n.mjs` generates structure-preserving `web/i18n/<locale>.json` files (see `scripts/README.md`).

### Deployment

The site deploys to **Cloudflare Workers (Static Assets)** via `wrangler deploy` (`wrangler.jsonc`), serving `dist/`. `worker/index.js` runs **only on `/`, the English pages with a Markdown twin, and `/api/event`** (`run_worker_first`). A request whose `Accept` prefers `text/markdown` gets the page's twin (see _Agents_ below). Otherwise it 302-redirects first-time visitors on `/` to the best `Accept-Language` locale (a `lang` cookie, set by localized pages only, makes it fire at most once) and counts anonymous conversions on `/api/event`. Visitors who stay on the English root can instead get a dismissible "also available in …" banner: `pickSuggestion` picks a supported language listed after English, else one mapped to their `request.cf.country` (`countries` in `locales.ts`), and the Worker tags `<html data-suggest-locale>` via HTMLRewriter for `web/components/home/LanguageSuggestion.astro` to reveal. Location only ever suggests, never redirects; a `hint=off` cookie ends it. Every other path is served straight from assets; unknown paths get `dist/404.html` (`not_found_handling`). Response headers (security headers, immutable caching for `/_astro/*`) live in `public/_headers`.

**Every push to `main` deploys production.** Cloudflare's Git integration (Workers Builds) builds and deploys word2md.com from each commit on `main` without waiting for CI; its build command is `npm run build && npm test`, so a Jest failure stops a deploy but lint, knip, and e2e failures don't. Every other branch gets a Worker Previews build (`npm run build && npm test`, then `npx wrangler preview`) with a preview URL, the only place the Worker runs before production. The `workers.dev` route is off (`workers_dev: false`). The `main` ruleset requires CI on pull requests, but admins bypass it, so a direct push deploys before CI finishes, and a red CI run doesn't stop it. Before pushing or merging to `main`, run `npm run check` (lint, typecheck, knip, build, test, and the Worker bundle check, as CI's `build` job runs them), plus `npm run test:e2e` for site changes. `npm run all` is a quicker fix-and-test loop that skips knip and the Worker bundle check; neither runs e2e or `npm audit`, which CI also runs. Never run `wrangler deploy` yourself.

**Offline service worker:** word2md.com is installable (`public/manifest.webmanifest`) and works offline after a first visit. The `serviceWorker()` integration in `web/pwa/service-worker.ts` writes `dist/sw.js` after each build from the `web/pwa/sw.js` template, precaching the hashed `/_astro/*.js` chunks except the main-thread fallback `main.*.js` and the preview renderer's chunks, which it finds from the build's module graph (the dynamic imports of `web/scripts/converter/preview.ts`; the build fails if it can't) and leaves to the runtime cache; `web/components/PwaRegister.astro` registers it. Navigations stay network-first so `/` still reaches the Worker; only `/_astro/` is cache-first; `/api/` and non-GET requests pass through. A new version waits for old tabs to close (no `skipWaiting`). `/sw.js` is served `no-cache` (`public/_headers`). To retire it everywhere, set `serviceWorkerKillSwitch = true` in `web/pwa/config.ts` and push: the build then ships `web/pwa/sw-kill.js`, which clears the caches and unregisters itself on every device. The e2e config blocks service workers (they'd bypass `page.route()` mocks); `pwa.spec.ts` opts back in.

**CSP:** every page carries a Content-Security-Policy `<meta>` generated by Astro (`security.csp` in `astro.config.mjs`), with hashes for inline scripts/styles and `connect-src 'self'`. Don't use `style="…"` attributes in markup — they're blocked (set styles via classes, or via `element.style` from JS, which CSP allows). Two traps: Astro only hashes scripts it processes, so **never use `<script is:inline>`** (a server-side condition goes in a `data-*` attribute the processed script reads); and a boolean `data-*` prop renders `{false}` as `"false"`, so pass `undefined` to omit it. `src/__tests__/e2e/csp.spec.ts` fails on any reported violation.

### Agents and crawlers

`web/agent/markdown.ts` builds Markdown for machines from the same sources the HTML renders (`web/i18n/en.json`, the `legal` and `guides` collections): `/llms.txt` and `/llms-full.txt` (`web/pages/llms*.txt.ts`) and a Markdown twin of every English page (`web/pages/[page].md.ts`: `/index.md`, `/privacy.md`, …). Layout advertises a page's twin with `<link rel="alternate" type="text/markdown">` (the `markdownPath` prop), and the Worker serves it for `Accept: text/markdown`. The English-only task pages (`/google-docs-to-markdown/`, `/docx-to-markdown-for-llms/`, `/developers/`) are Markdown in `web/content/guides/`, rendered by `web/layouts/Prose.astro` with TechArticle JSON-LD, linked from the footer, and given no hreflang. A new English page with a twin goes in `agentPages()` and in `run_worker_first` in `wrangler.jsonc`; `src/__tests__/agent-markdown.test.ts` checks the two agree. `public/robots.txt` sets `Content-Signal: search=yes, ai-input=yes, ai-train=yes`, a deliberate choice to welcome AI use.

Agents can also _convert_, always locally, so "nothing is uploaded" stays true: `w2m mcp` (`src/mcp.ts`, loaded by a dynamic import in `src/cli.ts` so conversions never load the MCP SDK) is a stdio MCP server with a `convert_docx_to_markdown` tool, tested end to end by `src/__tests__/mcp.test.ts`. In the browser, `web/scripts/converter/webmcp.ts` registers WebMCP tools (`convert_docx_to_markdown`, `get_converted_markdown`) that run through the same worker as a drop and show the result on the page. `e2e/webmcp.spec.ts` stubs `document.modelContext` to test them. Neither ever adds a server-side conversion endpoint.

### Build artifacts (`build/`, `dist/`)

Both `build/` (the tsc library + CLI output) and `dist/` (the site) are **gitignored** — neither is committed. CI rebuilds them: the `build` job runs `npm run build` before `npm run test`, so `build/cli.js` exists when the tests run, and uploads `dist/` for the e2e job to serve instead of rebuilding. Tests that need the built CLI (`src/__tests__/cli.test.ts`) rebuild it when it's missing or older than the sources, so a fresh `npm test` works without a prior `npm run build`.

### Releasing

Publishing a GitHub Release runs [`release.yml`](.github/workflows/release.yml), which publishes the package to npm; [CONTRIBUTING](CONTRIBUTING.md#cutting-a-release) has the steps. Neither the `npm` environment nor the `v*` tag ruleset needs anyone's approval when an admin's credentials are used. Releases happen only after the owner explicitly approves that release. Agents may prepare the version-bump pull request (`npm version <x> --no-git-tag-version` updates `package.json` and `package-lock.json` without creating a tag, plus [`CHANGELOG.md`](CHANGELOG.md)), but never push a tag, create a GitHub Release, or run `npm publish`. Push branches with `git push --no-follow-tags`.
