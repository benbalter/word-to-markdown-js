---
title: Convert Google Docs to Markdown — Word to Markdown
description: Three ways to turn a Google Doc into clean Markdown, including paste and .docx download, all converted in your browser with nothing uploaded.
order: 1
---

# How to convert a Google Doc to Markdown

There are three good ways to get Markdown out of a Google Doc. Word to Markdown handles two of them, and it converts everything in your browser, so the document never leaves your computer.

## Option 1: Copy and paste

1. In Google Docs, select the text you want (Ctrl+A or ⌘A for the whole document) and copy it.
2. Open [word2md.com](/) and paste anywhere on the page.
3. Copy the Markdown, or download it as a `.md` file.

Pasting is quickest for part of a document. Google Docs puts its own markup on the clipboard, and Word to Markdown strips it out before converting.

## Option 2: Download as .docx, then convert

1. In Google Docs, choose **File → Download → Microsoft Word (.docx)**.
2. Drag the `.docx` onto [word2md.com](/), or click to choose it.
3. Copy the Markdown, download a `.md` file, or download a `.zip` with the images as separate files.

This works best for whole documents, especially ones with images or footnotes. Images come along in the `.zip`, and footnotes become GitHub-flavored `[^1]` footnotes.

## Option 3: Google's built-in export

Google Docs can also save Markdown directly: **File → Download → Markdown (.md)**. If that output works for you, use it. Word to Markdown is useful when you want the same conversion for Google Docs and Word files alike, images as separate files, or (with a downloaded `.docx`) a warning when something can't come across, such as comments or headers.

## Tips for cleaner Markdown

- **Use real heading styles.** Markdown headings come from Google Docs' paragraph styles (Format → Paragraph styles → Heading 1, 2, 3…), not from big bold text. Text that only looks like a heading becomes a bold paragraph.
- **Use real lists and tables.** Bulleted and numbered lists and inserted tables convert to Markdown lists and tables. Lines that start with a typed dash or number may not.
- **Accept or reject suggestions first.** Otherwise they may show up as if accepted.
- **Comments are left out.** When a downloaded `.docx` has comments with text, Word to Markdown warns you that they were dropped.
- **Headers and footers are dropped.** Move anything important into the body.

## Converting lots of Google Docs

To convert a folder of documents, download them as `.docx` (Google Drive can download several files at once as a `.zip`; unzip it first), then use the [command-line tool](/developers/) to convert them all:

```console
for f in *.docx; do npx -y word-to-markdown "$f" -o "${f%.docx}.md"; done
```
