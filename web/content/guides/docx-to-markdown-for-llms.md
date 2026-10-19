---
title: Word to Markdown for ChatGPT, Claude, and RAG
description: Why Markdown is the best format for feeding Word documents to AI tools, and how to convert one file or a whole library locally, without uploading anything.
order: 2
---

# Convert Word documents to Markdown for AI tools and RAG

Large language models read Markdown well. It keeps a document's structure (headings, lists, tables, links) in plain text, without the XML, styles, and binary packaging inside a `.docx`. Converting first gives ChatGPT, Claude, and retrieval (RAG) pipelines cleaner input, and it lets you see what you're sending.

## Why convert before you upload or embed

- **Structure survives.** Headings become `#` lines, so models can see the outline, and tools that split documents into pieces for search can split on sections. Tables stay tables instead of runs of loose cells.
- **Smaller input.** Much of a `.docx` is formatting markup, and Markdown drops it.
- **You can check it first.** Read the Markdown before it goes anywhere, and remove what you don't want to share.
- **Warnings for what didn't come across.** Word to Markdown tells you when a document has a sensitivity label or confidentiality marking, or when comments, headers and footers, or text boxes were dropped. That's worth knowing before a document goes into an AI tool.

## One document

Drag the `.docx` onto [word2md.com](/) and copy the Markdown. Conversion happens in your browser. The document isn't uploaded to word2md.com or anywhere else, so you decide what, if anything, goes to an AI service.

## A whole folder

The [command-line tool](/developers/) runs the same converter on your machine:

```console
for f in docs/*.docx; do
  npx -y word-to-markdown --strip-images "$f" -o "markdown/$(basename "${f%.docx}").md"
done
```

- `--strip-images` drops images. Otherwise they're embedded in the Markdown as long encoded strings that use up an AI tool's context. To keep images as files instead, give each document its own folder: `--image-dir "images/$(basename "${f%.docx}")"`.
- `--strict` makes the command report failure (exit status 2) when a document has warnings, so a script can flag files to check by hand.
- Warnings print separately from the Markdown, so they never end up in your files.

## Let your agent do it

If you use an AI agent such as Claude Code, add the local [MCP server](/developers/) and the agent can convert `.docx` files on your machine itself:

```console
claude mcp add word-to-markdown -- npx -y word-to-markdown mcp
```

The conversion runs on your machine, but the agent reads the Markdown it gets back, so treat the document like any other file you share with the agent.

## Why teams keep their docs in Markdown

Plain-text docs aren't only for AI. Distributed teams like GitHub's write proposals, decisions, and documentation in Markdown so anyone can read, review, and improve them in the open, on their own schedule, and the same files feed search and AI tools without conversion. Ben Balter, who made Word to Markdown, wrote a playbook for working that way: [_Open and Async_](https://open-and-async.com/?utm_source=word2md&utm_medium=guide&utm_campaign=agents).

## What converts

Headings, bold, italic, strikethrough, superscript and subscript, bulleted, numbered, and nested lists, tables (merged cells are expanded to keep tables rectangular), links, code, images, footnotes, and equations (as LaTeX). Older `.doc` files need to be saved as `.docx` first.
