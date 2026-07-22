# Word to Markdown

Convert Word documents to beautiful Markdown. Via command line or in your browser. An even better version of the original [`word-to-markdown`](https://github.com/benbalter/word-to-markdown).

Try it in your browser at [word2md.com](https://word2md.com), or use it from the command line — no clone required:

```console
npx word-to-markdown input.docx > output.md
```

## Supports

- Paragraphs
- Numbered lists
- Bullet lists
- Nested Lists
- Headings
- Lists
- Tables
- Footnotes and endnotes
- Images
- Bold, italics, underlines, strikethrough, superscript and subscript.
- Links
- Line breaks
- Text boxes
- Comments

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

## Use as a library

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

In the browser, pass an `ArrayBuffer` instead of a file path.

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
3. Run `docker-compose up -d`
4. Access at http://localhost:3000

## More context

See the README of [the original Word to Markdown](https://github.com/benbalter/word-to-markdown?tab=readme-ov-file#the-problem) for the project's motivation.

### The old way

[The Original](https://github.com/benbalter/word-to-markdown) Word to Markdown is 10 years old. The conversion process was as follows:

1. Use [LibreOffice](https://www.libreoffice.org/) to convert the Word document to HTML.
2. Use a bunch of RegEx to clean up the HTML
3. User [Premailer](https://github.com/premailer/premailer) to inline the CSS
4. Use [Nokogiri](https://nokogiri.org) to manipulate the HTML further
5. Use [Reverse Markdown](https://github.com/xijo/reverse_markdown) to convert the HTML to Markdown
6. Use a bunch of RegEx to clean up the Markdown

Not only did this process require installing and shelling out to a huge binary (LibreOffice), but it was very fragile, and key projects like Reverse Markdown are no longer maintained. I tried experimenting with Pandoc, but it had many of the same limitation.

### The new way

1. Use [Mammoth.js](https://github.com/mwilliamson/mammoth.js/) to convert the Word document to HTML.
2. Use [Turndown](https://github.com/mixmark-io/turndown) to convert the HTML to Markdown.
3. Use [Markdownlint](https://github.com/DavidAnson/markdownlint) to clean up the Markdown.

All three of these projects are actively maintained and heavily used, and allows us to convert the document faster, and entirely in JavaScript. Heck, I think theoretically, this could run in the browser for added privacy.

It's still in beta, but so far, I've found the output to be better, with much less manual cleanup required. Notice something is off? Please [open an issue](https://github.com/benbalter/word-to-markdown-js/issues/new).

One note: This project does not yet attempt to guess heading levels based on font size. It could, but it's not yet implemented.
