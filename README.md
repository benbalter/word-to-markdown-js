# Word to Markdown

[![npm version](https://img.shields.io/npm/v/word-to-markdown.svg)](https://www.npmjs.com/package/word-to-markdown)
[![npm downloads](https://img.shields.io/npm/dm/word-to-markdown.svg)](https://www.npmjs.com/package/word-to-markdown)
[![CI](https://github.com/benbalter/word-to-markdown-js/actions/workflows/ci.yml/badge.svg)](https://github.com/benbalter/word-to-markdown-js/actions/workflows/ci.yml)
[![License: ISC](https://img.shields.io/npm/l/word-to-markdown.svg)](https://github.com/benbalter/word-to-markdown-js/blob/main/LICENSE)

Convert Word documents to beautiful Markdown. Via command line, as a Node library, or in your browser. An even better version of the original [`word-to-markdown`](https://github.com/benbalter/word-to-markdown).

Try it in your browser at [word2md.com](https://word2md.com), or use it from the command line — no clone required:

```console
npx word-to-markdown input.docx > output.md
```

## What it converts

- Paragraphs and line breaks
- Headings
- Bold, italic, and strikethrough
- Superscript and subscript — preserved as inline `<sup>`/`<sub>` tags
- Bullet lists, and numbered lists (kept as `1./2./3.` by default)
- Nested lists
- Tables
- Links
- Footnotes and endnotes
- Images — embedded inline as base64 data URIs

### Notes and limitations

- **Numbered lists** are kept as `1./2./3.` ordered lists. Pass
  `{ numberedLists: 'bullets' }` (library) or `--bullet-lists` (CLI) to convert
  them to bullet lists instead (matching the original word-to-markdown).
- **Images** are inlined as base64 data URIs rather than extracted to separate
  files. To change this, pass a custom [Mammoth image handler](https://github.com/mwilliamson/mammoth.js/#images)
  via `options.mammoth` (see [Use as a library](#use-as-a-library)), or drop
  images entirely with `{ images: 'strip' }` / `--strip-images`.
- **Underline** is dropped by default (Mammoth's default, since underlines are
  easily confused with links). Pass `{ underline: 'preserve' }` (library) or
  `--underline` (CLI) to keep it as an inline `<u>` tag.
- **Comments, text boxes, and equations are not converted** — Mammoth drops
  them during the `.docx` → HTML step. When content is dropped this way,
  `convertWithWarnings` surfaces a warning.
- Heading levels come from Word's paragraph styles, not from font size.

## How is this different from the original?

_TL;DR: This project is a complete rewrite, using modern tools and libraries, and is much faster and more reliable. The output should be the same or better. [Feedback welcome!](https://github.com/benbalter/word-to-markdown-js/issues/new)_

## A note on privacy

Word to Markdown is designed with privacy as a core principle. The application operates entirely client-side:

- **Complete client-side processing**: When using the web interface, all document conversion happens locally in your browser using JavaScript. Your documents never leave your computer.
- **No server uploads**: When using the web interface, files are processed entirely on your device. No document content is ever transmitted to any server.
- **No personal data collection**: The application does not collect, store, or transmit any personal information or document contents.
- **Privacy-first analytics**: The hosted version at word2md.com uses only privacy-centric Cloudflare Analytics for anonymous usage statistics. No Google Analytics or user tracking.
- **Self-hosting option**: For maximum privacy, you can run the application locally or self-host it without any analytics whatsoever.

Whether you use the command line tool, run it locally in your browser, or use the hosted version, your documents and privacy are protected.

## Command line

Run it directly with `npx` (downloads and runs the latest published version):

```console
npx word-to-markdown path/to/your/file.docx > output.md
```

Or install it globally to get the `w2m` command:

```console
npm install -g word-to-markdown
w2m path/to/your/file.docx > output.md
```

The converted Markdown is written to **stdout** and any document warnings (encryption, sensitivity labels, and the like) to **stderr**, so a redirect captures only the Markdown. The command exits with a non-zero status and a friendly message if the file is missing, unreadable, or not a valid `.docx`. Only `.docx` is supported — re-save older `.doc` files as `.docx` first.

Options:

- `--bullet-lists` — convert numbered lists to bullets instead of keeping `1./2./3.`.
- `--underline` — preserve underlined text as inline `<u>` tags (dropped by default).
- `--strip-images` — remove images instead of embedding them as base64 data URIs.

## Use as a library

Published to npm as [`word-to-markdown`](https://www.npmjs.com/package/word-to-markdown). It ships as an ES module and requires Node 22.13 or later.

```console
npm install word-to-markdown
```

```js
import convert, { convertWithWarnings } from 'word-to-markdown';

// Just the Markdown:
const markdown = await convert('path/to/your/file.docx');

// Markdown plus any document warnings (e.g. encryption, sensitivity labels):
const { markdown, warnings } = await convertWithWarnings(
  'path/to/your/file.docx',
);
```

Both functions accept either a file-path string (in Node) or an `ArrayBuffer` (in the browser), so the same code runs in either environment:

```js
const { markdown } = await convertWithWarnings(arrayBuffer);
```

### API

- **`convert(input, options?): Promise<string>`** — resolves to the Markdown.
- **`convertWithWarnings(input, options?): Promise<{ markdown: string; warnings: string[] }>`** — also returns human-readable warnings for encrypted, protected, or sensitivity-labeled documents.

`input` is a file-path `string` (Node) or an `ArrayBuffer` (browser). `options` is optional:

- **`images`** — `'inline'` (default) embeds images as base64 data URIs; `'strip'` removes them.
- **`numberedLists`** — `'ordered'` (default) keeps `1./2./3.`; `'bullets'` converts numbered lists to bullets.
- **`underline`** — `'ignore'` (default) drops underlines; `'preserve'` keeps them as inline `<u>` tags.
- **`mammoth`** / **`turndown`** — escape hatches forwarded to [Mammoth](https://github.com/mwilliamson/mammoth.js/) and [Turndown](https://github.com/mixmark-io/turndown) respectively.

```js
const markdown = await convert('file.docx', {
  numberedLists: 'bullets',
  underline: 'preserve',
});
```

### Error handling

Conversion throws typed errors so you can respond to each failure precisely:

```js
import convert, {
  UnsupportedFileError,
  FileNotFoundError,
  InvalidFileError,
  FilePermissionError,
  ConversionError,
} from 'word-to-markdown';

try {
  const markdown = await convert('path/to/your/file.docx');
} catch (error) {
  if (error instanceof UnsupportedFileError) {
    // e.g. a .doc file — only .docx is supported
  } else if (error instanceof FileNotFoundError) {
    // the path doesn't exist
  } else if (error instanceof InvalidFileError) {
    // not a valid or parseable .docx
  } else if (error instanceof FilePermissionError) {
    // the file couldn't be read
  } else if (error instanceof ConversionError) {
    // something failed mid-conversion — see error.cause
  }
}
```

## Running Locally

### Get set up

1. Clone the repo
2. Run `npm install`

### Command line (from source)

Run `npm run build:js` once, then `node build/cli.js path/to/your/file.docx`.

### Run the site locally

`npm run dev` starts the Astro dev server. To preview a production build, run
`npm run build` followed by `npm run preview`.

## Self-Hosting

To self-host the static site using Docker Compose:

1. Clone the repository
2. Run `npm install && npm run build`
3. Run `docker compose up -d`
4. Access at http://localhost:3000

## More context

See the README of [the original Word to Markdown](https://github.com/benbalter/word-to-markdown?tab=readme-ov-file#the-problem) for the project's motivation.

### The old way

[The Original](https://github.com/benbalter/word-to-markdown) Word to Markdown is 10 years old. The conversion process was as follows:

1. Use [LibreOffice](https://www.libreoffice.org/) to convert the Word document to HTML.
2. Use a bunch of RegEx to clean up the HTML
3. Use [Premailer](https://github.com/premailer/premailer) to inline the CSS
4. Use [Nokogiri](https://nokogiri.org) to manipulate the HTML further
5. Use [Reverse Markdown](https://github.com/xijo/reverse_markdown) to convert the HTML to Markdown
6. Use a bunch of RegEx to clean up the Markdown

Not only did this process require installing and shelling out to a huge binary (LibreOffice), but it was very fragile, and key projects like Reverse Markdown are no longer maintained. I tried experimenting with Pandoc, but it had many of the same limitations.

### The new way

1. Use [Mammoth.js](https://github.com/mwilliamson/mammoth.js/) to convert the Word document to HTML.
2. Use [Turndown](https://github.com/mixmark-io/turndown) to convert the HTML to Markdown.
3. Use [Markdownlint](https://github.com/DavidAnson/markdownlint) to clean up the Markdown.

All three of these projects are actively maintained and heavily used, and allows us to convert the document faster, and entirely in JavaScript. Heck, I think theoretically, this could run in the browser for added privacy.

It's still young, but so far, I've found the output to be better, with much less manual cleanup required. Notice something is off? Please [open an issue](https://github.com/benbalter/word-to-markdown-js/issues/new).

One note: This project does not yet attempt to guess heading levels based on font size. It could, but it's not yet implemented.
