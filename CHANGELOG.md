# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.4.0]: https://github.com/benbalter/word-to-markdown-js/releases/tag/v0.4.0
[0.3.0]: https://github.com/benbalter/word-to-markdown-js/releases/tag/v0.3.0
