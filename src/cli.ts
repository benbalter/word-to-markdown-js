#!/usr/bin/env node

import { Command, Option } from 'commander';
import { createRequire } from 'module';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { convertWithWarnings, type QuoteStyle } from './main.js';

// Read our own version from package.json. createRequire resolves relative to
// this module, so `../package.json` points at the package root both from the
// TypeScript source (src/) and the compiled CLI (build/) after publish. This
// avoids JSON import attributes, which node16 module resolution would require.
const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

// --strict exits with this when the conversion succeeded but produced
// warnings, so scripts can tell "converted with caveats" (2) from "failed" (1).
const EXIT_WARNINGS = 2;

// Read all of stdin as the .docx bytes. convertWithWarnings takes an
// ArrayBuffer for in-memory input; slice copies just this Buffer's bytes out
// of Node's shared pool.
async function readStdin(): Promise<ArrayBuffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const bytes = Buffer.concat(chunks);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

const EXAMPLES = `
Examples:
  $ w2m report.docx > report.md
  $ w2m -o out/report.md --image-dir images report.docx
  $ cat report.docx | w2m > report.md
  $ w2m --strict --quiet report.docx > report.md || echo "check report.md"`;

const program = new Command();
program.name('w2m');
program.description('Convert Word documents to beautiful Markdown');
program.version(version);
// `convert` is the default command, so `w2m --help` is what people run, but
// commander shows only the top-level options there. Point at the full list.
program.addHelpText(
  'after',
  `\nRun "w2m convert --help" for all conversion options.\n${EXAMPLES}`,
);
program
  .command('mcp')
  .description(
    'Run a local MCP server on stdio so AI agents can convert .docx files ' +
      'on this machine (e.g. claude mcp add word-to-markdown -- npx -y ' +
      'word-to-markdown mcp)',
  )
  .action(async () => {
    // Loaded only here, so conversions never pay for the MCP SDK.
    const { startMcpServer } = await import('./mcp.js');
    await startMcpServer(version);
  });
program
  .command('convert', { isDefault: true })
  .argument(
    '[file]',
    'The Word document to convert. Use - (or omit it and pipe the file in) ' +
      'to read from stdin.',
  )
  .option(
    '-o, --output <file>',
    'Write the Markdown to <file> instead of stdout (- means stdout). ' +
      'Warnings still print to stderr.',
  )
  .option(
    '--strip-images',
    'Remove images instead of embedding them as base64 data URIs',
  )
  .option(
    '--image-dir <dir>',
    'Extract images to <dir> and link them relatively, instead of embedding ' +
      'them as base64. Links resolve relative to where you save the Markdown.',
  )
  .option(
    '--bullet-lists',
    'Convert numbered lists to bullets rather than keeping them as 1./2./3.',
  )
  .option(
    '--underline',
    'Preserve underlined text as inline <u> tags (dropped by default)',
  )
  .option(
    '--preserve-footnotes',
    'Keep Word footnotes as raw <sup> links and a numbered note list instead ' +
      'of converting them to GFM [^1] footnotes',
  )
  .option(
    '--strip-equations',
    'Drop Word equations instead of converting them to LaTeX ($…$ and $$…$$)',
  )
  .addOption(
    new Option(
      '--quotes <style>',
      'How to treat curly quotes: auto (default) keeps them in mostly-Chinese ' +
        'text, where they are Chinese quotation marks; ascii converts them ' +
        'everywhere; preserve keeps them everywhere',
    )
      .choices(['auto', 'ascii', 'preserve'])
      .default('auto'),
  )
  .option(
    '-q, --quiet',
    'Print nothing to stderr except errors: no warnings or progress notes',
  )
  .option(
    '--strict',
    `Exit with status ${EXIT_WARNINGS} if the document has warnings ` +
      '(the Markdown is still written)',
  )
  .option(
    '--verbose',
    'On failure, also print the underlying error and stack trace',
  )
  .addHelpText('after', EXAMPLES)
  .action(async (file: string | undefined, options) => {
    // Progress notes and warnings go to stderr unless --quiet; errors always do.
    const note = (message: string): void => {
      if (!options.quiet) console.error(message);
    };
    // `-o -` is stdout, as with most CLIs.
    const output: string | undefined =
      options.output === '-' ? undefined : options.output;
    try {
      // An explicit `-`, or no file with something piped in, reads stdin. No
      // file at an interactive terminal would just hang, so ask for one.
      const fromStdin = file === '-' || (!file && !process.stdin.isTTY);
      if (!file && !fromStdin) {
        program.commands[0].help({ error: true });
      }
      let input: string | ArrayBuffer;
      if (fromStdin) {
        input = await readStdin();
        if (input.byteLength === 0) {
          throw new Error(
            'Nothing was piped to stdin. Pass a .docx file, or pipe one in: w2m - < report.docx',
          );
        }
      } else {
        input = file as string;
      }

      // --image-dir (extract) takes precedence over --strip-images.
      if (options.imageDir && options.stripImages) {
        note('Ignoring --strip-images because --image-dir is set.');
      }
      const images = options.imageDir
        ? 'extract'
        : options.stripImages
          ? 'strip'
          : 'inline';
      const result = await convertWithWarnings(input, {
        images,
        imageDir: options.imageDir,
        numberedLists: options.bulletLists ? 'bullets' : 'ordered',
        underline: options.underline ? 'preserve' : 'ignore',
        footnotes: options.preserveFootnotes ? 'preserve' : 'gfm',
        equations: options.stripEquations ? 'strip' : 'latex',
        quotes: options.quotes as QuoteStyle,
      });

      // Write extracted images to disk before emitting the Markdown that links
      // them. The links are relative to the Markdown file, so resolve them
      // against its directory (the working directory when writing to stdout).
      if (result.images && result.images.length > 0) {
        const markdownDir = output ? path.dirname(output) : '.';
        const imageDir = path.resolve(markdownDir, options.imageDir);
        await mkdir(imageDir, { recursive: true });
        await Promise.all(
          result.images.map((image) =>
            writeFile(path.resolve(markdownDir, image.path), image.bytes),
          ),
        );
        note(
          `Wrote ${result.images.length} image(s) to ${path.relative('.', imageDir) || '.'}/`,
        );
      }

      // Display warnings to stderr if any
      if (result.warnings.length > 0) {
        result.warnings.forEach((warning) => {
          note(warning);
        });
        note(''); // Empty line for separation
      }

      // Write the Markdown to the requested file, or stdout by default.
      if (output) {
        await mkdir(path.dirname(output), { recursive: true });
        // End with a newline, as stdout (console.log) does (markdownlint MD047).
        await writeFile(output, `${result.markdown}\n`);
        note(`Wrote Markdown to ${output}`);
      } else {
        console.log(result.markdown);
      }

      // Set rather than call process.exit(), so stdout finishes flushing.
      if (options.strict && result.warnings.length > 0) {
        process.exitCode = EXIT_WARNINGS;
      }
    } catch (error) {
      // Converter errors carry user-friendly messages; print anything else as-is
      console.error(
        'Error:',
        error instanceof Error ? error.message : String(error),
      );
      // The friendly message hides the root cause (e.g. a ConversionError
      // wrapping a mammoth failure); --verbose shows it for bug reports.
      if (options.verbose && error instanceof Error) {
        console.error('');
        console.error(error.stack);
        if (error.cause) console.error('Caused by:', error.cause);
      }
      process.exit(1);
    }
  });

await program.parseAsync();
