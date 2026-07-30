# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.3.0]: https://github.com/benbalter/word-to-markdown-js/releases/tag/v0.3.0
