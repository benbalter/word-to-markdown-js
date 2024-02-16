# Word to Markdown

Convert Word documents to beautiful Markdown.

**Status: Working Beta**

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

It's still in beta, but so far, I've found the output to be better, with much less manual cleanup required.

One note: This project does not yet attempt to guess heading levels based on font size. It could, but it's not yet implemented.