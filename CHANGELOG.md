# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.1] - 2026-09-30

### Changed

- Clearer npm package description and more search keywords (`docx-to-markdown`,
  `word-to-markdown`, `microsoft-word`, `md`, `gfm`), and a README title that
  says what the tool does. No code changes.

## [0.5.0] - 2026-09-29

### Security

- Allowlist link schemes (http, https, mailto, relative and fragment links) before
  Markdown conversion, for both .docx input and `htmlToMd()`. Leading control
  characters no longer let `javascript:` links through
  ([GHSA-6rhg-55q7-v8wx](https://github.com/benbalter/word-to-markdown-js/security/advisories/GHSA-6rhg-55q7-v8wx)).

### Changed

These change the Markdown produced for affected documents.

- **`numberedLists: 'bullets'` works on the HTML, not the Markdown.** Numbered
  lists are now turned into bullet lists before Turndown runs, instead of by
  rewriting `1.` markers in the output. Document lists convert the same as
  before. The one difference: with `footnotes: 'preserve'`, the raw footnote or
  endnote list now keeps its `1.`/`2.` numbering to match the `[1]` reference
  labels, instead of becoming bullets.
- **Multi-paragraph footnotes and endnotes become GFM footnotes too.** Footnote
  conversion now happens in Turndown rules on the HTML instead of regexes over
  the Markdown, so a note with several paragraphs becomes one `[^1]:`
  definition with its later paragraphs indented, instead of being left as a
  raw `<sup>` link and numbered list. Single-paragraph notes convert as before.

### Added

- `htmlToMd()` takes an optional fourth argument, `gfmFootnotes`, which turns
  Mammoth's footnote/endnote markup into `[^1]` footnotes. It defaults to
  `false`, so existing calls behave the same.

### Fixed

- Confidentiality warnings no longer fire on "confidential" or "sensitive" in
  free-text core properties (title, subject, description, author), so a title
  like "Case-sensitive search" isn't flagged. Keywords, category, and content
  status are still checked.
- CLI: `-o` output ends with a newline, matching stdout.

## [0.4.0] - 2026-09-26

### Changed

These change the Markdown produced for affected documents.

- **Footnotes and endnotes become GFM/Pandoc footnotes** (`[^1]` references and
  `[^1]:` definitions) instead of raw `<sup>` links plus a numbered note list.
  Keep the old output with `{ footnotes: 'preserve' }` or `--preserve-footnotes`.
- **Code blocks are fenced verbatim.** Paragraphs set entirely in a monospace
  font (Word's usual code-block encoding) and the Preformatted Text / HTML
  Preformatted styles become fenced code blocks with no Markdown escaping.
  Single-cell tables wrapping code are unwrapped instead of becoming a one-cell
  Markdown table. (#207)
- **Em and en dashes are preserved.** They were flattened to `-`. (#194)
- **HTML entities are decoded exactly once.** Text typed as `&amp;` in Word
  stays `&amp;` in the Markdown instead of collapsing to `&`. Literal entity
  text such as `&#60;b&#62;` no longer turns into HTML tags, and encoded quotes
  no longer cut link URLs short.
- **Some errors have a more specific class.** Password-protected `.docx` and
  legacy `.doc` files throw `UnsupportedFileError` (was `InvalidFileError`). A
  directory path throws `InvalidFileError`, a path through a non-directory
  throws `FileNotFoundError`, and the blocked system paths throw
  `FilePermissionError` (all were `ConversionError`).
- `ConversionError.cause` uses the standard `Error` cause, so TypeScript types
  it as `unknown`.
- The license field in `package.json` is `Apache-2.0`, matching `LICENSE` (it
  said `ISC`).
- The compiled output targets ES2022 instead of ES6. Node 22.13 or later is
  still required, as before.

### Added

- **TypeScript declarations** (`build/main.d.ts`), including the
  `ConvertOptions` and `DocumentProperties` types.
- `WordToMarkdownError`, a base class for every error the converter throws.
- `footnotes` option (`'gfm'` | `'preserve'`).
- CLI: `-o, --output <file>`, `--preserve-footnotes`, and `-V, --version`.

### Fixed

- `convert(ArrayBuffer)` works in Node. It always failed with
  `InvalidFileError`.
- With `numberedLists: 'bullets'` / `--bullet-lists`, footnotes convert
  correctly, and numbered-looking lines inside code blocks are left alone.
- Header-row promotion no longer turns cells of a nested table into headers,
  and no longer deletes an image-only first row.
- CLI: with `-o`, images extracted by `--image-dir` are written next to the
  Markdown file, where its relative links point (they were written relative to
  the working directory). `-o` creates its directory, and a trailing slash in
  `--image-dir` no longer produces `dir//image1.png` links. The CLI says when
  `--strip-images` is ignored in favor of `--image-dir`.
- Published source maps include the original sources.
- `@mixmark-io/domino` is no longer a runtime dependency.

## [0.3.0] - 2026-07-30

### Changed

- **Numbered lists now stay numbered (`1.`/`2.`/`3.`) by default** instead of
  being converted to bullet lists — across the library, the CLI, and the web
  app. This changes the Markdown produced for any document containing ordered
  lists. Opt back into the classic bullet behavior with
  `{ numberedLists: 'bullets' }` (library) or `--bullet-lists` (CLI).

### Added

- **Extract images to files.** The new `images: 'extract'` mode replaces
  Mammoth's inline base64 with relative `![](images/imageN.ext)` links and
  returns the image bytes on `ConvertResult.images` (via `convertWithWarnings`).
  A new `imageDir` option (default `'images'`) sets the link/path prefix.
  - CLI: `--image-dir <dir>` writes the extracted files and links them
    relatively. Links resolve relative to wherever you save the Markdown.
  - Web: documents with images gain a **Download .zip** button that bundles the
    Markdown plus an `images/` folder (the on-screen preview, Copy, and
    Download .md keep inline base64 so images still render in place).
- **Preserve underline.** `{ underline: 'preserve' }` (library) or `--underline`
  (CLI) keeps underlined text as inline `<u>` tags. Underline remains dropped by
  default, matching Mammoth's default (underlines are easily confused with
  links).

### Documentation

- Documented the `images`, `imageDir`, `numberedLists`, and `underline` options
  for both the library and the CLI.
- Corrected the docs and web UI: **superscript and subscript are preserved** as
  inline `<sup>`/`<sub>` tags. This was already the case in 0.2.0 — only the
  documentation, which previously listed them as unsupported, was wrong.

[Unreleased]: https://github.com/benbalter/word-to-markdown-js/compare/v0.5.1...HEAD
[0.5.1]: https://github.com/benbalter/word-to-markdown-js/releases/tag/v0.5.1
[0.5.0]: https://github.com/benbalter/word-to-markdown-js/releases/tag/v0.5.0
[0.4.0]: https://github.com/benbalter/word-to-markdown-js/releases/tag/v0.4.0
[0.3.0]: https://github.com/benbalter/word-to-markdown-js/releases/tag/v0.3.0
