---
title: Word to Markdown CLI, library, and MCP server
description: Convert .docx to Markdown from the command line, from Node, or from an AI agent over MCP or WebMCP. Free, open source, and nothing is uploaded.
order: 3
---

# Word to Markdown for developers and agents

The converter behind [word2md.com](/) is free and open source and published to npm as [`word-to-markdown`](https://www.npmjs.com/package/word-to-markdown). Every way of running it, below, converts on your own machine; the converter uploads nothing. (With MCP or WebMCP, the agent does read the Markdown it gets back, as with any file you share with it.)

## Command line

```console
npx word-to-markdown report.docx > report.md
cat report.docx | npx word-to-markdown - > report.md
npx word-to-markdown -o out/report.md --image-dir images report.docx
```

Install it globally (`npm install -g word-to-markdown`) to get the shorter `w2m` command. The Markdown goes to stdout (or `-o`) and warnings to stderr. It exits 1 if the conversion fails. With `--strict`, it also exits 2 when the document has warnings. Other options cover bullets for numbered lists, underline, footnote style, equations, and images. See the [full CLI reference](https://github.com/benbalter/word-to-markdown-js#command-line).

## Node library

```js
import { convertWithWarnings } from 'word-to-markdown';

const { markdown, warnings } = await convertWithWarnings('report.docx');
```

It accepts a file path or an `ArrayBuffer` and ships TypeScript types. Errors are typed (`UnsupportedFileError`, `InvalidFileError`, and others) so you can show people a useful message. See the [API reference](https://github.com/benbalter/word-to-markdown-js#use-as-a-library).

## MCP server for AI agents

`npx -y word-to-markdown mcp` runs a local [Model Context Protocol](https://modelcontextprotocol.io) server on stdio. Add it to Claude Code:

```console
claude mcp add word-to-markdown -- npx -y word-to-markdown mcp
```

Or to any MCP client:

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

Its tool, `convert_docx_to_markdown`, takes the path to a `.docx` and returns the Markdown and any warnings. Images are dropped unless you pass `image_dir`, so base64 images don't flood the agent's context. `output_path` writes long documents to a file. The tool never overwrites an existing file unless you pass `overwrite: true`. See the [MCP reference](https://github.com/benbalter/word-to-markdown-js#mcp-server).

## WebMCP in the browser

In a browser with [WebMCP](https://webmachinelearning.github.io/webmcp/), word2md.com registers two tools for agents working in the tab: `convert_docx_to_markdown`, which takes a `.docx` as base64 and shows the result on the page, and `get_converted_markdown`, which returns what the person last converted. As with dropping a file, the conversion runs in the tab and nothing is uploaded. Images come back as `image-omitted` placeholders unless the agent passes `include_images: true`.

## Related MCP server

[Open and Async MCP](https://github.com/open-and-async/mcp), from the same author, gives an agent async-first writing tools: draft a decision doc, swap a planned meeting for an async alternative, or score a status update. It pairs well with converting a team's Word docs to Markdown.

```console
claude mcp add open-async -- npx -y @open-and-async/mcp
```

## For crawlers and LLMs

- [`/llms.txt`](/llms.txt) indexes the site, and [`/llms-full.txt`](/llms-full.txt) has all of it in one file.
- Every English page has a Markdown version: add `.md` (for example [`/developers.md`](/developers.md)), or request the page with `Accept: text/markdown`.

## Source and self-hosting

The code is on [GitHub](https://github.com/benbalter/word-to-markdown-js) under the Apache 2.0 license. The README explains how to run the site locally or host your own copy, with no analytics.
