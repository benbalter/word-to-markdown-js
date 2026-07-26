# Security Policy

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, report them privately using one of the following:

- [GitHub private vulnerability reporting](https://github.com/benbalter/word-to-markdown-js/security/advisories/new)
  (preferred), or
- email **ben@balter.com**.

Please include as much of the following as you can, to help us triage quickly:

- The type of issue (e.g. path traversal, XSS in the web UI, prototype
  pollution, ReDoS).
- The affected component — the Node library/CLI (`src/`), or the client-side
  site (`web/`).
- Step-by-step instructions to reproduce, and a proof-of-concept if possible.
- The impact, including how an attacker might exploit it.

You can expect an initial response within a few days. We will keep you informed
as we work on a fix and will credit you in the release notes unless you prefer
to remain anonymous.

## Scope

`word-to-markdown` converts `.docx` files to Markdown entirely locally — the CLI
and library run on your machine, and the website (word2md.com) performs all
conversion in your browser. **No document content is ever uploaded.** Security
reports that assume server-side processing of document content do not apply.
