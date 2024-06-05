# Word to Markdown

Convert Word documents to beautiful Markdown. An even better version of the original [`word-to-markdown`](https://github.com/benbalter/word-to-markdown).

## Supports

* Paragraphs
* Numbered lists
* Bullet lists
* Nested Lists
* Headings
* Lists
* Tables
* Footnotes and endnotes
* Images
* Bold, italics, underlines, strikethrough, superscript and subscript.
* Links
* Line breaks
* Text boxes
* Comments

## How is this different from the original?

*TL;DR: This project is a complete rewrite, using modern tools and libraries, and is much faster and more reliable. The output should be the same or better. [Feedback welcome!](https://github.com/benbalter/word-to-markdown-js/issues/new)*

## A note on privacy

Word to Markdown can be run locally or in your browser. In either event, the conversion happens locally, and no information ever leaves your browser.

## Running Locally

## Get Setup

1. Clone the repo
2. Run `npm install`

## Command line

Run `w2m path/to/your/file.docx`

## Web server (static HTML)

`npm run server:web`

## Web server (HTTP API)

You can also run Word to Markdown as an HTTP API server, where you can make requests from elsewhere.

`npm run server`

The server exposes a `POST /raw` endpoint, which returns the converted Markdown. 

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

