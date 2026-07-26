# Copilot instructions for word-to-markdown-js

`CLAUDE.md` in the repo root is the authoritative guide to this codebase
(architecture, commands, build artifacts, i18n, deployment). Read it first — the
notes below are a quick orientation; defer to `CLAUDE.md` on any conflict.

## What this is

A privacy-first converter that turns Word `.docx` files into clean,
GitHub-flavored Markdown. One repo produces **three artifacts** from two source
directories owned by two different build tools:

- **`src/`** — owned by `tsc`. Compiles to `build/`: the Node library
  (`build/main.js`) and the CLI (`w2m` → `build/cli.js`). `src/index.ts` is the
  _browser_ entry, excluded from `tsc` and bundled by Astro/Vite instead.
- **`web/`** — owned by Astro (`srcDir`). Builds the static site to `dist/`.

Put converter/CLI logic in `src/`; site/UI in `web/`. There is no HTTP server —
all conversion runs locally (CLI/library) or client-side in the browser; nothing
is ever uploaded.

## Conversion pipeline (`src/main.ts`)

1. **mammoth** — `.docx` → HTML
2. `processHtml` — promote a table's first row to `<th>`, strip Unicode bullets
3. **Turndown** (`@joplin/turndown` + gfm) — HTML → Markdown
4. `convertNumberedListsToBullets` → `normalizeText` (nbsp/smart-quote cleanup)
5. **markdownlint** `applyFixes` → **prettier** (markdown)

`convert()` returns the Markdown string; `convertWithWarnings()` also returns
`warnings` (encryption/sensitivity flags plus content-loss notices from
mammoth). Preserve the typed error classes (`UnsupportedFileError`,
`FileNotFoundError`, `InvalidFileError`, `FilePermissionError`,
`ConversionError`).

## Commands

- `npm test` — Jest (ESM via `ts-jest`; needs `--experimental-vm-modules`, set
  by the script)
- `npm run test:e2e` — Playwright against the built site
- `npm run build` — `build:js` (tsc) then `build:site` (astro)
- `npm run lint` / `npm run fix` — eslint + prettier
- `npm run all` — fix + test + build + check-builds (run before pushing)

Node 22.13.0 is pinned (`.nvmrc`, `.tool-versions`, Volta).

## Testing

Add cases to `src/__tests__/`; `.docx` fixtures live in `src/__fixtures__/`.
When adding a locale, keep the four locale lists in sync (see `CLAUDE.md`);
`src/__tests__/i18n-completeness.test.ts` and `i18n-locale-sync.test.ts` enforce
this.
