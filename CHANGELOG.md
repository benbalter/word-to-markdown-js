# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- A `.docx` that unpacks to more than 200 MB is refused up front with a new `DocumentTooLargeError`, judged from the sizes its zip declares, before anything is decompressed. A `.docx` is a zip, so a small file can expand enormously (a "zip bomb"): one under 1 MB that unpacked to 700 MB used over 3 GB of memory and then failed with a generic "ensure the file is a valid .docx" error. word2md.com, the CLI, and the MCP server now say the document is too large. A zip that understates its sizes isn't caught by this check.

### Fixed

- Outline numbering that repeats the parent's number, as contracts, policies, and specs use (`1.` → `1.1`, `1.2`), is written out as text: `## 1. First section`, then `1.1 FIRST CLAUSE`. It used to come out as `- 1.` under an unnumbered heading, restarting at 1 after each body paragraph. Ordinary numbered lists stay Markdown lists, and `--bullet-lists` still drops the numbers. (#359)
- A numbered list that a paragraph, table, or another list interrupts continues from Word's number (`1.`, then `2.` after the interruption) instead of restarting at `1.`, and a list's own start number is kept. A sub-item with no item above it no longer sits under an empty `- ` bullet, except where that would merge it into a neighboring list. (#359)
- Headings numbered by an ordinary list keep their number (`## 1. Introduction`), and lists Word makes from one definition, such as a list continued after a copy and paste, count on from one another as in Word instead of each starting at 1.
- A heading that starts with a number keeps it unescaped (`## 1. Scope`, not `## 1\. Scope`), since a heading can't be read as a list.
- The MCP server no longer prints each warning as "Warning: Warning: …". The converter's warnings already start with "Warning:", and the server added it again.
- word2md.com serves its Markdown pages (`/index.md` and the other twins, including the ones agents get with `Accept: text/markdown`) and `llms.txt`/`llms-full.txt` with `charset=utf-8`. Without it, browsers read `llms.txt` as windows-1252 and garbled its non-ASCII characters, and `text/markdown` lacked the charset RFC 7763 requires.
- The MCP server no longer writes extracted images outside the Markdown's folder when `image_dir` is, or passes through, a symlink to a folder elsewhere. Its path check compared paths as text, so `images` linked to `../elsewhere` passed it, and the images landed in `elsewhere`. It now compares real paths and refuses. A folder whose name merely starts with `..`, such as `..assets`, is no longer mistaken for one outside and refused.
- A table with another table nested in a cell stays a Markdown table. The nested table used to make the whole outer table fall apart into a run of paragraphs, losing its rows and columns; now the nested table is written into its cell as one line per row, cells separated by a middle dot (`·`).
- A table with a code block in a cell stays a Markdown table, with the code as inline code (one line per line of code), instead of coming out as raw HTML wrapped in a `<div class="joplin-table-wrapper">`. Code with an escaped pipe (`\|`) keeps its table as HTML, since a Markdown table can't carry it unchanged. A table that still can't be a Markdown table is emitted as a plain HTML `<table>`, without that wrapper.
- A run of pipes in a table cell keeps every pipe: `a || b` used to come out as `a | b`, in text and in code alike, because each run was escaped as a single pipe.

## [0.8.0] - 2026-10-22

### Added

- Each GitHub Release now carries `word-to-markdown.mcpb`, a one-click install of the MCP server for Claude Desktop. (#347)

### Changed

- Chinese quotation marks (“ ” ‘ ’) are kept instead of being turned into ASCII quotes. They share their code points with the curly quotes Word writes for English, which the converter normalizes, so a quote can't be classified on its own; the text is now checked for being mostly Chinese (at least 10 Han characters, Han making up at least half the letters, and no meaningful share of kana, which would mean Japanese). English documents convert exactly as before. Pass `{ quotes: 'ascii' }` or `--quotes ascii` for the old behavior, or `preserve` to keep curly quotes in any language. (#357) Thanks to [@naturalwill](https://github.com/naturalwill).

### Fixed

- Table-heavy documents convert much faster. markdownlint's table parsing grew quadratically with the number of table rows in a document, so a document of 80 tables of 100 rows spent over 20 seconds in that step alone; pinning micromark-extension-gfm-table to 2.1.2, which has the fix from [micromark-extension-gfm-table#17](https://github.com/micromark/micromark-extension-gfm-table/pull/17), makes it linear and brings that step under a second. Output is unchanged.
- Large tables convert much faster. Turndown's GFM table rules re-read each table's row list in loops, and the DOM it uses outside the browser rebuilt that list on every read, so a single table of 2,000 rows spent about 20 seconds in that step. word2md now caches the list, and the same table takes a fraction of a second. Output is unchanged.
- Long numbered lists convert faster. To number items from 100 on, word2md looked up every item's position by scanning the whole list, so a list of 16,000 items spent about half its Turndown time on lookups. word2md now indexes each list once, which brings that list from about 0.5 to 0.3 seconds. Output is unchanged.
- An equation that can't be converted to LaTeX is left out, with a content-loss warning, instead of failing the whole document. Since 0.7.0 started converting equations, one unusual equation (such as very deeply nested fractions) turned the entire conversion into an error. (#350)
- `convertHtml` no longer returns an empty result for some rich text pasted from Google Docs. When markup ahead of the Google Docs wrapper was removed, the DOM library inserted the wrapper's contents at the wrong position and the whole selection was lost, while still reporting success. (#350)
- word2md.com no longer gives up on slow conversions after a fixed time. A large document that keeps making progress now finishes however long it takes; a conversion is called failed only after two minutes without any progress. (#350, #352)

## [0.7.0] - 2026-10-19

### Added

- Word equations (Office Math) are converted to LaTeX instead of dropped: inline `$…$`, or a `$$…$$` block for an equation on its own line, which GitHub renders. Fractions, sub- and superscripts, roots, sums and integrals, brackets, functions and limits, accents, and matrices are supported. `{ equations: 'strip' }` (library) or `--strip-equations` (CLI) keeps the old behavior. (#284) Thanks to [@faizulr](https://github.com/faizulr).
- `w2m mcp` runs a local [MCP](https://modelcontextprotocol.io) server on stdio, so AI agents can convert `.docx` files on your machine: `claude mcp add word-to-markdown -- npx -y word-to-markdown mcp`. Its one tool, `convert_docx_to_markdown`, takes a file path and returns the Markdown and warnings. Images are dropped unless you pass `image_dir`. Because an agent may be acting on instructions it read in a document, it only writes `.md` files, never writes through a symlink or replaces an existing file unless you pass `overwrite: true`, and keeps extracted images inside the Markdown's folder. The MCP SDK loads only for this subcommand. (#336)
- The package carries `mcpName` (`io.github.benbalter/word-to-markdown`), and each release now lists the server in the [official MCP Registry](https://registry.modelcontextprotocol.io). (#341)
- word2md.com speaks to agents and crawlers. Every English page has a Markdown version (`/index.md`, `/privacy.md`, …), also served for `Accept: text/markdown`. `/llms.txt` and `/llms-full.txt` are generated from the site's own copy, and `robots.txt` states `Content-Signal: search=yes, ai-input=yes, ai-train=yes`. In browsers with WebMCP, the page registers `convert_docx_to_markdown` and `get_converted_markdown` tools that convert in the tab, like a drop. (#335, #336)
- word2md.com has three guides, each with its own social card: [Google Docs to Markdown](https://word2md.com/google-docs-to-markdown/), [Word to Markdown for AI tools](https://word2md.com/docx-to-markdown-for-llms/) and [Developers](https://word2md.com/developers/) (CLI, library, MCP and WebMCP). (#338, #344)

### Changed

- word2md.com's "From the maker" card describes Open and Async the way the book's own site does, as drawing on "more than a decade of remote-first lessons from GitHub". The old "GitHub-tested" read as an endorsement. Long meta descriptions in German, Indonesian and Vietnamese were shortened to fit search results. (#340, #343)

### Security

- Overrode `postcss-selector-parser` to 7.1.6 under `@tailwindcss/typography` for CVE-2026-104844 (quadratic selector parsing). It's a build-time dependency of the site, not of the npm package. (#342)

## [0.6.0] - 2026-10-18

### Added

- The CLI reads a `.docx` from stdin: pass `-` as the file, or leave it out and pipe the file in (`cat report.docx | w2m > report.md`). `-o -` writes to stdout.
- CLI `--quiet` (`-q`) prints only errors to stderr, and `--strict` exits with status 2 when the document has warnings (the Markdown is still written), so scripts can tell "converted, but check it" from "failed". `w2m --help` now shows examples and points at `w2m convert --help` for every option.
- word2md.com can be installed as an app and keeps working offline after your first visit: a service worker caches the converter, so you can open the site and convert documents with no connection. Pages still load from the network whenever you're online, and documents are never cached.
- word2md.com links to its sibling, [md2word.app](https://md2word.app), which converts Markdown to Word: a "Going the other way?" card on the home page and a footer link.
- `convertWithWarnings()` now also returns `warningDetails`: one `{ kind, message, detail? }` entry per string in `warnings`, so callers can present or localize warnings without parsing the English text. `kind` is `encrypted`, `sensitivity`, `confidentiality`, `protected`, or `content-loss`. The `warnings` strings are unchanged.
- `convertHtml(html, options?)` converts an HTML string, such as rich text copied from Word, Google Docs, or a web page, to Markdown with the same cleanup `.docx` conversion gets. It drops Word's clipboard markup (styles, `<o:p>`) and Google Docs' all-bold wrapper.
- word2md.com: pasting rich text copied from Word, Google Docs, or a web page onto the page converts it, as pasting a `.docx` file already did.
- word2md.com converts several files at once: drop, choose, or paste up to 20 `.docx` files and each converts in turn, then appears in a list. Pick a file to see, copy, or download its Markdown, or download all of them as one `.zip` (each document's images in a folder of its own). A file that can't be converted says why in the list without stopping the rest. Before, only the first file was converted. One file converts exactly as before.
- `convertWithWarnings()` warns about content Mammoth drops without saying so: comments (with how many had text), headers and footers with text beyond a page number, and text boxes saved without Word's VML fallback. Each is a `content-loss` warning whose `detail` is `comments (N)`, `headers and footers`, or `text boxes (N)`. Comments aren't flagged when your Mammoth style map renders them (`comment-reference => …`). `extractDocumentProperties()` returns the counts as `comments`, `headersFooters`, and `textBoxes`. word2md.com names these in its dropped-content warning, in every language.
- word2md.com publishes a [`security.txt`](https://word2md.com/.well-known/security.txt) (RFC 9116) saying how to report a vulnerability. (#297)

### Changed

- word2md.com: Copy Markdown is now the main action after a conversion, and the result scrolls into view. Warnings appear in the page's language, with the converter's raw messages behind a "Technical details" toggle. Code in the output and preview no longer shows font ligatures, so `->` and `--` look exactly as they're copied.
- word2md.com: when a document has images, Download .zip becomes the main action (the Markdown alone carries them as long base64 strings), with a note explaining where the images are.
- word2md.com: the dropped-content warning names what was dropped (equations, images, special symbols, embedded objects) when it can tell.
- word2md.com: errors name the file they're about, and dropping a file that isn't a Word document (like `README.md`) now says so, instead of advising you to re-save it in Word.
- word2md.com: on touch screens the dropzone asks you to choose a .docx rather than drop one, the result buttons are 44px tall, and screen readers hear the file input as "Choose a .docx file" with the size and privacy note as its description.
- word2md.com: the hero's "Trusted since 2014" now reads "Converting docs since 2014": it states the tool's lineage rather than claiming trust.
- word2md.com: the Markdown output wraps long lines instead of scrolling sideways, so long lines and inline images are readable and easy to select. (#283) Thanks to [@RegolithIII](https://github.com/RegolithIII) for the suggestion.
- word2md.com: once a conversion finishes, the page shows only the result: How It Works, the conversion table, the command-line callout, and the FAQ step aside until you choose "Convert another file". The German page now addresses you formally ("Sie") throughout, the Indonesian page says "berkas" for "file" throughout, and the German, Indonesian, and Vietnamese search descriptions say again that nothing is uploaded.
- word2md.com downloads less: the converter cleans up Mammoth's HTML with domino, the DOM Turndown already parses with, instead of a second HTML parser, so the conversion worker is about 11% smaller (398 KB to 353 KB gzipped). The Markdown produced is unchanged. The npm package no longer depends on `node-html-parser`, and depends on `@mixmark-io/domino` directly (Turndown already installed it).
- word2md.com downloads less for visitors who don't convert anything: the Markdown preview's renderer (about 52 KB gzipped) now loads when a conversion starts, and the offline cache no longer downloads it up front (about 389 KB gzipped instead of 441 KB). Offline, a first conversion still shows its Markdown; the preview works offline too once you've converted something online.

These change the Markdown produced for affected documents.

- **Tables with lists or headings in their cells stay Markdown tables.** They came out as raw HTML wrapped in a `<div class="joplin-table-wrapper">`. Each list item now becomes its own `•`-marked (or numbered) line in the cell and a heading becomes bold, with lines joined by `<br>`. Line breaks in table cells no longer leave two stray spaces before the `<br>`.
- **Table-of-contents links work.** Word's TOC entries and cross-references to a heading link to that heading's GitHub-style anchor (`#getting-started`) instead of a `#_Toc…` bookmark that no longer exists in the Markdown. Links to a bookmark that isn't on a heading become plain text.
- **Typed bullet glyphs are stripped from nested list items too**, and from items that start with formatting (e.g. a bold `•`). Only top-level, unformatted items were cleaned before.
- **Tables that start with several empty rows** use the first row with content as the header, instead of an empty one. A single-cell code box is unwrapped even when its cell also holds an empty nested table.
- **Numbered lists past 99 stay lists.** Items numbered 100 and up came out as `100.item`, with no space after the number, so they rendered as plain text; from 1000, conversion failed outright. They now get a space, and their continuation lines and nested lists are indented to the number's width so they stay inside the item.
- **Numbered lists keep their start number.** An ordered list that starts at 5 (`<ol start="5">`, e.g. in HTML passed to `convertHtml()` or pasted onto word2md.com) was renumbered from 1, because markdownlint's MD029 fix rewrites every list to start at 1. That rule is now off; Prettier still numbers lists consistently, so lists that start at 1 come out as before. Word documents aren't affected: mammoth numbers each list from 1.
- **Tables with merged cells now render as GitHub tables.** Each merged cell is expanded into one cell per column it covers (its text in the first, the rest empty), so every row has as many cells as the header. Before, the delimiter row came out with the wrong number of cells, and GitHub showed the table as raw pipe text. (#282, #288) Thanks to [@victorzhong0110](https://github.com/victorzhong0110).

### Fixed

- word2md.com: a conversion that never finishes (for example, the browser runs out of memory converting a huge document) now ends with an error after a few minutes instead of spinning forever.
- Confidentiality warnings no longer fire on "confidential" in a free-text custom property's value (e.g. a `Notes` property reading "not confidential"). A custom property named for confidentiality, or a classification or sensitivity property whose value says confidential, is still flagged.
- word2md.com: Ctrl+A / Cmd+A in the Markdown output or preview selects just that panel, not the whole page. (#279, #280) Thanks to [@jethrothelion](https://github.com/jethrothelion).

### Documentation

- The README's limitations and CLI options match the converter's behavior: multi-paragraph footnotes, text boxes, dropped comments, and `--verbose`. (#289, #295) Thanks to [@w3lld1](https://github.com/w3lld1).

## [0.5.1] - 2026-09-30

### Changed

- Clearer npm package description and more search keywords (`docx-to-markdown`, `word-to-markdown`, `microsoft-word`, `md`, `gfm`), and a README title that says what the tool does. No code changes.

## [0.5.0] - 2026-09-29

### Security

- Allowlist link schemes (http, https, mailto, relative and fragment links) before Markdown conversion, for both .docx input and `htmlToMd()`. Leading control characters no longer let `javascript:` links through ([GHSA-6rhg-55q7-v8wx](https://github.com/benbalter/word-to-markdown-js/security/advisories/GHSA-6rhg-55q7-v8wx)).

### Changed

These change the Markdown produced for affected documents.

- **`numberedLists: 'bullets'` works on the HTML, not the Markdown.** Numbered lists are now turned into bullet lists before Turndown runs, instead of by rewriting `1.` markers in the output. Document lists convert the same as before. The one difference: with `footnotes: 'preserve'`, the raw footnote or endnote list now keeps its `1.`/`2.` numbering to match the `[1]` reference labels, instead of becoming bullets.
- **Multi-paragraph footnotes and endnotes become GFM footnotes too.** Footnote conversion now happens in Turndown rules on the HTML instead of regexes over the Markdown, so a note with several paragraphs becomes one `[^1]:` definition with its later paragraphs indented, instead of being left as a raw `<sup>` link and numbered list. Single-paragraph notes convert as before.

### Added

- `htmlToMd()` takes an optional fourth argument, `gfmFootnotes`, which turns Mammoth's footnote/endnote markup into `[^1]` footnotes. It defaults to `false`, so existing calls behave the same.

### Fixed

- Confidentiality warnings no longer fire on "confidential" or "sensitive" in free-text core properties (title, subject, description, author), so a title like "Case-sensitive search" isn't flagged. Keywords, category, and content status are still checked.
- CLI: `-o` output ends with a newline, matching stdout.

## [0.4.0] - 2026-09-26

### Changed

These change the Markdown produced for affected documents.

- **Footnotes and endnotes become GFM/Pandoc footnotes** (`[^1]` references and `[^1]:` definitions) instead of raw `<sup>` links plus a numbered note list. Keep the old output with `{ footnotes: 'preserve' }` or `--preserve-footnotes`.
- **Code blocks are fenced verbatim.** Paragraphs set entirely in a monospace font (Word's usual code-block encoding) and the Preformatted Text / HTML Preformatted styles become fenced code blocks with no Markdown escaping. Single-cell tables wrapping code are unwrapped instead of becoming a one-cell Markdown table. (#207)
- **Em and en dashes are preserved.** They were flattened to `-`. (#194)
- **HTML entities are decoded exactly once.** Text typed as `&amp;` in Word stays `&amp;` in the Markdown instead of collapsing to `&`. Literal entity text such as `&#60;b&#62;` no longer turns into HTML tags, and encoded quotes no longer cut link URLs short.
- **Some errors have a more specific class.** Password-protected `.docx` and legacy `.doc` files throw `UnsupportedFileError` (was `InvalidFileError`). A directory path throws `InvalidFileError`, a path through a non-directory throws `FileNotFoundError`, and the blocked system paths throw `FilePermissionError` (all were `ConversionError`).
- `ConversionError.cause` uses the standard `Error` cause, so TypeScript types it as `unknown`.
- The license field in `package.json` is `Apache-2.0`, matching `LICENSE` (it said `ISC`).
- The compiled output targets ES2022 instead of ES6. Node 22.13 or later is still required, as before.

### Added

- **TypeScript declarations** (`build/main.d.ts`), including the `ConvertOptions` and `DocumentProperties` types.
- `WordToMarkdownError`, a base class for every error the converter throws.
- `footnotes` option (`'gfm'` | `'preserve'`).
- CLI: `-o, --output <file>`, `--preserve-footnotes`, and `-V, --version`.

### Fixed

- `convert(ArrayBuffer)` works in Node. It always failed with `InvalidFileError`.
- With `numberedLists: 'bullets'` / `--bullet-lists`, footnotes convert correctly, and numbered-looking lines inside code blocks are left alone.
- Header-row promotion no longer turns cells of a nested table into headers, and no longer deletes an image-only first row.
- CLI: with `-o`, images extracted by `--image-dir` are written next to the Markdown file, where its relative links point (they were written relative to the working directory). `-o` creates its directory, and a trailing slash in `--image-dir` no longer produces `dir//image1.png` links. The CLI says when `--strip-images` is ignored in favor of `--image-dir`.
- Published source maps include the original sources.
- `@mixmark-io/domino` is no longer a runtime dependency.

## [0.3.0] - 2026-07-30

### Changed

- **Numbered lists now stay numbered (`1.`/`2.`/`3.`) by default** instead of being converted to bullet lists — across the library, the CLI, and the web app. This changes the Markdown produced for any document containing ordered lists. Opt back into the classic bullet behavior with `{ numberedLists: 'bullets' }` (library) or `--bullet-lists` (CLI).

### Added

- **Extract images to files.** The new `images: 'extract'` mode replaces Mammoth's inline base64 with relative `![](images/imageN.ext)` links and returns the image bytes on `ConvertResult.images` (via `convertWithWarnings`). A new `imageDir` option (default `'images'`) sets the link/path prefix.
  - CLI: `--image-dir <dir>` writes the extracted files and links them relatively. Links resolve relative to wherever you save the Markdown.
  - Web: documents with images gain a **Download .zip** button that bundles the Markdown plus an `images/` folder (the on-screen preview, Copy, and Download .md keep inline base64 so images still render in place).
- **Preserve underline.** `{ underline: 'preserve' }` (library) or `--underline` (CLI) keeps underlined text as inline `<u>` tags. Underline remains dropped by default, matching Mammoth's default (underlines are easily confused with links).

### Documentation

- Documented the `images`, `imageDir`, `numberedLists`, and `underline` options for both the library and the CLI.
- Corrected the docs and web UI: **superscript and subscript are preserved** as inline `<sup>`/`<sub>` tags. This was already the case in 0.2.0 — only the documentation, which previously listed them as unsupported, was wrong.

[Unreleased]: https://github.com/benbalter/word-to-markdown-js/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/benbalter/word-to-markdown-js/releases/tag/v0.8.0
[0.7.0]: https://github.com/benbalter/word-to-markdown-js/releases/tag/v0.7.0
[0.6.0]: https://github.com/benbalter/word-to-markdown-js/releases/tag/v0.6.0
[0.5.1]: https://github.com/benbalter/word-to-markdown-js/releases/tag/v0.5.1
[0.5.0]: https://github.com/benbalter/word-to-markdown-js/releases/tag/v0.5.0
[0.4.0]: https://github.com/benbalter/word-to-markdown-js/releases/tag/v0.4.0
[0.3.0]: https://github.com/benbalter/word-to-markdown-js/releases/tag/v0.3.0
