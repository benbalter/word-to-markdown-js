# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: docs-as-code folks. Developers, technical writers, and open-source maintainers who have a Word document or Google Doc and need it as Markdown in a GitHub repo, static site, wiki, or docs pipeline. They know what Markdown is, care whether the output is clean (headings, lists, tables, footnotes, code fences), and will notice and judge sloppy output. They often arrive mid-task, convert, copy or download, and leave; some come back for the CLI or library for batch work.

Secondary audiences the site also serves, but which don't win tradeoffs against the primary user: people preparing documents for LLMs or RAG pipelines, non-technical one-off converters arriving from search, and people with sensitive documents who need the "nothing is uploaded" guarantee.

## Product Purpose

Word to Markdown converts Word (.docx) files, and Google Docs downloaded as .docx, into clean GitHub-flavored Markdown. It ships as three things from one repo: the web app at [word2md.com](https://word2md.com), the `w2m` / `word-to-markdown` CLI, and a Node library on npm. It's a free, open-source (Apache-2.0) rewrite of the original Ruby `word-to-markdown` (2014).

Success on the web is a completed conversion: a file dropped, Markdown copied or downloaded, with output good enough that the user doesn't have to hand-fix it.

## Positioning

- Conversion runs entirely in the browser. Documents are never uploaded, stored, or logged; this is an architectural fact, not a policy promise.
- Zero setup, unlike Pandoc: drop a .docx and get Markdown instantly, with a CLI and library for scripted work.
- Output is opinionated toward clean, lint-fixed, prettier-formatted GFM rather than a literal dump.
- Lineage since 2014.

## Operating Context

- Inputs: modern .docx only. Older .doc and password-protected files get a specific error explaining how to re-save. Google Docs users export via File → Download → Microsoft Word (.docx). Browser limit is 20 MB.
- Outputs: Markdown shown with a rendered preview; copy to clipboard, download `.md`, or download `.zip` (Markdown plus an `images/` folder) when the document has images.
- Warnings surface for encryption, sensitivity/MIP labels, confidentiality markers, document protection, and dropped content (equations, comments).
- Localized into 21 languages, including RTL (Arabic) and CJK. English at the root; other locales under a prefix. First-time visitors may be redirected by `Accept-Language`, or shown a dismissible language suggestion.
- Typical next step after conversion: pasting into a repo, editor, or docs tool.

## Capabilities and Constraints

- Stack: Astro (site in `web/`), TypeScript converter in `src/`, Tailwind CSS v4, deployed to Cloudflare Workers Static Assets. Every push to `main` deploys production.
- Privacy is a hard constraint: no feature may send document content off-device. Analytics are anonymous conversion counts and Cloudflare Analytics only.
- Performance: heavy conversion dependencies load lazily on first file use so the landing page paints fast. Keep them lazy.
- Strict CSP: no inline `style=""` attributes, no `<script is:inline>`.
- Light and dark themes follow `prefers-color-scheme`.
- Terminology: "Word to Markdown" is the product name; "word2md.com" is the domain; "convert", "Markdown" (capitalized), ".docx".

## Brand Commitments

- Name: Word to Markdown. Domain: word2md.com.
- Voice: plain, direct, reassuring about privacy without hype ("Your files are never uploaded").
- Free, open source, no sign-up, no file limits beyond the browser cap, no ads.
- The Open & Async sponsor promo is a durable part of the home page but secondary: it must never compete with or slow the conversion task.

## Evidence on Hand

- Real: the open-source repo, npm package, 2014 lineage, the converter's documented feature list and limitations (README), localized FAQ (`web/i18n/*.json`), per-locale OG images (`public/og/`), the Open & Async cover (`public/open-and-async-cover.png`).
- Absent, and must not be fabricated: testimonials, user counts, conversion totals, press quotes, company logos, benchmarks against other converters.

## Product Principles

1. The task is the page. Getting a .docx in and Markdown out comes before everything else, including the promo.
2. Privacy is structural. Never design or copy anything that implies, requires, or tempts an upload.
3. Output quality is the product. Show the result honestly, including warnings about what didn't convert.
4. Respect a technical audience. Be precise and skip marketing fluff; point to the CLI and library for real workflows.
5. Every language is first-class. Layouts must hold up in long-string, RTL, and CJK locales.

## Accessibility & Inclusion

WCAG 2.2 AA. Honor `prefers-reduced-motion` and `prefers-color-scheme`; support keyboard-only file selection (not just drag and drop), RTL layout, and screen-reader announcements for conversion status.
