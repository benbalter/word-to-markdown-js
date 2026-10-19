# Word to Markdown (DOCX → Markdown converter)

[![npm version](https://img.shields.io/npm/v/word-to-markdown.svg)](https://www.npmjs.com/package/word-to-markdown) [![npm downloads](https://img.shields.io/npm/dm/word-to-markdown.svg)](https://www.npmjs.com/package/word-to-markdown) [![CI](https://github.com/benbalter/word-to-markdown-js/actions/workflows/ci.yml/badge.svg)](https://github.com/benbalter/word-to-markdown-js/actions/workflows/ci.yml) [![License: Apache-2.0](https://img.shields.io/npm/l/word-to-markdown.svg)](https://github.com/benbalter/word-to-markdown-js/blob/main/LICENSE)

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
- Footnotes and endnotes — converted to GFM/Pandoc `[^1]` footnotes
- Images — embedded inline as base64 data URIs, or extracted to files
- Equations — converted to LaTeX: inline `$…$`, or a `$$` block for an equation on its own line

### Notes and limitations

- **Numbered lists** are kept as `1./2./3.` ordered lists. Pass `{ numberedLists: 'bullets' }` (library) or `--bullet-lists` (CLI) to convert them to bullet lists instead (matching the original word-to-markdown).
- **Images** are inlined as base64 data URIs by default. To extract them to files with relative links instead, use `{ images: 'extract' }` (library — the bytes come back on `ConvertResult.images`) or `--image-dir <dir>` (CLI). Drop them entirely with `{ images: 'strip' }` / `--strip-images`. On the web, documents with images offer a **Download .zip** (Markdown + an `images/` folder). For full control, pass a custom [Mammoth image handler](https://github.com/mwilliamson/mammoth.js/#images) via `options.mammoth`.
- **Underline** is dropped by default (Mammoth's default, since underlines are easily confused with links). Pass `{ underline: 'preserve' }` (library) or `--underline` (CLI) to keep it as an inline `<u>` tag.
- **Footnotes and endnotes** become standard GFM/Pandoc footnotes — a `[^1]` reference in the body and a `[^1]: …` definition at the end — which render on GitHub and in the web preview. Pass `{ footnotes: 'preserve' }` (library) or `--preserve-footnotes` (CLI) to instead keep Mammoth's raw `<sup>` links and numbered note list (useful for CommonMark targets that lack footnote support). Notes whose bodies span multiple paragraphs are converted with indented continuation paragraphs.
- **Text boxes** are converted as paragraphs after the containing paragraph. A text box saved without Word's VML fallback (as some other tools write them) is dropped, and `convertWithWarnings` warns.
- **Comments** are dropped during the `.docx` → HTML step, and `convertWithWarnings` warns with how many had text. To keep them, map them in a Mammoth style map, e.g. `{ mammoth: { styleMap: ['comment-reference => sup'] } }`.
- **Headers and footers** are dropped. `convertWithWarnings` warns when one has text beyond a page number.
- **Equations** (Office Math) become LaTeX: inline `$…$`, or a `$$…$$` block when the equation is on its own line, which GitHub and most Markdown math renderers (KaTeX, MathJax) display. Fractions, scripts, roots, sums and integrals, brackets, functions and limits, accents, and matrices are converted. Pass `{ equations: 'strip' }` (library) or `--strip-equations` (CLI) to drop them instead, with a `convertWithWarnings` warning.
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

The converted Markdown is written to **stdout** and any document warnings (encryption, sensitivity labels, and the like) to **stderr**, so a redirect captures only the Markdown. The command exits with status 1 and a friendly message if the file is missing, unreadable, or not a valid `.docx`. Only `.docx` is supported — re-save older `.doc` files as `.docx` first.

To read the document from **stdin**, pass `-` as the file, or leave it out and pipe the file in:

```console
cat report.docx | w2m > report.md
curl -sL https://example.com/report.docx | w2m - -o report.md
```

Options:

- `-o, --output <file>` — write the Markdown to `<file>` instead of stdout (warnings still go to stderr). `-o -` means stdout.
- `--bullet-lists` — convert numbered lists to bullets instead of keeping `1./2./3.`.
- `--underline` — preserve underlined text as inline `<u>` tags (dropped by default).
- `--strip-images` — remove images instead of embedding them as base64 data URIs.
- `--image-dir <dir>` — extract images to `<dir>` and link them relatively, instead of embedding base64. Links resolve relative to where you save the Markdown, e.g. `w2m --image-dir images report.docx > report.md`, or with `-o`, `w2m -o out/report.md --image-dir images report.docx` (images land in `out/images/`).
- `--preserve-footnotes` — keep Word footnotes as raw `<sup>` links and a numbered note list instead of GFM `[^1]` footnotes.
- `--strip-equations` — drop Word equations instead of converting them to LaTeX.
- `-q, --quiet` — print nothing to stderr except errors: no warnings and no "Wrote …" notes.
- `--strict` — exit with status **2** if the document has warnings, so a script can tell "converted, but check it" (2) from "failed" (1). The Markdown is still written. Combine with `--quiet` to rely on the exit status alone.
- `--verbose` — On failure, also print the underlying error and stack trace.
- `-V, --version` — print the version.

## MCP server

`w2m mcp` runs a local [Model Context Protocol](https://modelcontextprotocol.io) server on stdio, so AI agents can convert `.docx` files on your machine. Like the website, it never uploads anything: the agent passes a file path, and the server reads and converts the file locally.

In Claude Desktop, it's one click: [download `word-to-markdown.mcpb`](https://github.com/benbalter/word-to-markdown-js/releases/latest/download/word-to-markdown.mcpb) and double-click it. Claude Desktop installs it as an extension. You don't need Node or a terminal, since Claude Desktop includes Node.

Add it to Claude Code:

```console
claude mcp add word-to-markdown -- npx -y word-to-markdown mcp
```

Or to any MCP client that takes a JSON config:

```json
{
  "mcpServers": {
    "word-to-markdown": {
      "command": "npx",
      "args": ["-y", "word-to-markdown", "mcp"]
    }
  }
}
```

It has one tool, `convert_docx_to_markdown`:

- `path` (required): the `.docx` to convert. Prefer an absolute path; relative paths resolve against the server's working directory.
- `output_path`: write the Markdown to this `.md` (or `.markdown`) file instead of returning it, which is handy for long documents. The tool won't write through a symlink.
- `image_dir`: extract images into this folder and link them. It must be a relative folder inside `output_path`'s folder (or the `.docx`'s). By default images are dropped, because base64 images would flood the agent's context.
- `overwrite`: replace `output_path` or image files that already exist. Off by default, so the tool refuses rather than clobbering a file. That matters when an agent is acting on instructions it read in a document.
- `bullet_lists`, `preserve_footnotes`: same as the CLI flags.

It returns the Markdown and any document warnings, also as structured content.

In the browser, word2md.com registers the same conversion as [WebMCP](https://webmachinelearning.github.io/webmcp/) tools (`convert_docx_to_markdown`, taking the file as base64, and `get_converted_markdown`) for agents in browsers that support it. They run in the tab, just like dropping a file.

## Use as a library

Published to npm as [`word-to-markdown`](https://www.npmjs.com/package/word-to-markdown). It ships as an ES module with TypeScript declarations and requires Node 22.13 or later.

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

Both functions accept either a file-path string (Node) or an `ArrayBuffer` (Node or the browser):

```js
const { markdown } = await convertWithWarnings(arrayBuffer);
```

### API

- **`convert(input, options?): Promise<string>`** — resolves to the Markdown.
- **`convertWithWarnings(input, options?): Promise<{ markdown: string; warnings: string[]; warningDetails: WarningDetail[]; images? }>`** — also returns human-readable warnings for encrypted, protected, or sensitivity-labeled documents and for dropped content, and (in `extract` mode) the extracted images. `warningDetails` has one `{ kind, message, detail? }` entry per warning, where `kind` is `encrypted`, `sensitivity`, `confidentiality`, `protected`, or `content-loss` and `detail` is the document's label or Mammoth's raw message. Use it to present or translate warnings without parsing the English text.
- **`convertHtml(html, options?): Promise<string>`** — converts an HTML string, such as rich text copied from Word, Google Docs, or a web page, with the same cleanup. There's no `.docx`, so `mammoth`, `images: 'extract'`, and `imageDir` don't apply.

`input` is a file-path `string` (Node) or an `ArrayBuffer`. `options` (type `ConvertOptions`) is optional:

- **`images`** — `'inline'` (default) embeds images as base64 data URIs; `'strip'` removes them; `'extract'` replaces each with a relative `![](imageDir/imageN.ext)` link and returns the bytes on `ConvertResult.images` (use `convertWithWarnings` to retrieve them).
- **`imageDir`** — link/path prefix for extracted images (default `'images'`); only applies with `images: 'extract'`.
- **`numberedLists`** — `'ordered'` (default) keeps `1./2./3.`; `'bullets'` converts numbered lists to bullets.
- **`underline`** — `'ignore'` (default) drops underlines; `'preserve'` keeps them as inline `<u>` tags.
- **`footnotes`** — `'gfm'` (default) converts footnotes and endnotes to `[^1]` references and definitions; `'preserve'` keeps Mammoth's raw `<sup>` links and numbered note list.
- **`equations`** — `'latex'` (default) converts Word equations to `$…$` / `$$…$$` LaTeX; `'strip'` drops them.
- **`mammoth`** / **`turndown`** — escape hatches forwarded to [Mammoth](https://github.com/mwilliamson/mammoth.js/) and [Turndown](https://github.com/mixmark-io/turndown) respectively.

```js
// Extract images to files and write them out yourself:
const { markdown, images } = await convertWithWarnings('file.docx', {
  images: 'extract',
});
// markdown → ![](images/image1.png); images → [{ path, contentType, bytes }]
```

### Error handling

Conversion throws typed errors so you can respond to each failure precisely. All of them extend `WordToMarkdownError`, so `error instanceof WordToMarkdownError` catches any of them.

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
    // a .doc or password-protected file — only unprotected .docx is supported
  } else if (error instanceof FileNotFoundError) {
    // the path doesn't exist (or runs through something that isn't a directory)
  } else if (error instanceof InvalidFileError) {
    // not a valid or parseable .docx (or the path is a directory)
  } else if (error instanceof FilePermissionError) {
    // the file couldn't be read, or is in a blocked system directory
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

`npm run dev` starts the Astro dev server. To preview a production build, run `npm run build` followed by `npm run preview`.

## Self-Hosting

To self-host the static site using Docker Compose:

1. Clone the repository
2. Run `npm install && npm run build`
3. Run `docker compose up -d`
4. Access at http://localhost:3000

This serves `dist/` with plain nginx, so it skips what the Cloudflare Worker and `public/_headers` add in production: the `Accept-Language` redirect on `/`, the `/api/event` counter (requests to it 404), the security headers, and long-lived caching for `/_astro/*`. Conversion itself runs in the browser and works the same. For a production-like local setup, run `npm run build` and then `npx wrangler dev`.

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
2. Use [domino](https://github.com/mixmark-io/domino), the DOM Turndown parses with, to clean up the HTML (unwrap code-block tables, expand merged table cells, add a header row, strip literal bullet characters).
3. Use [Turndown](https://github.com/mixmark-io/turndown) to convert the HTML to Markdown.
4. Use [Markdownlint](https://github.com/DavidAnson/markdownlint) to clean up the Markdown.
5. Use [Prettier](https://prettier.io) to format it consistently.

All of these projects are actively maintained and heavily used, and they let us convert the document faster, entirely in JavaScript. That also means it runs in the browser: [word2md.com](https://word2md.com) converts your document on your own device, without uploading it anywhere.

It's still young, but so far, I've found the output to be better, with much less manual cleanup required. Notice something is off? Please [open an issue](https://github.com/benbalter/word-to-markdown-js/issues/new).
