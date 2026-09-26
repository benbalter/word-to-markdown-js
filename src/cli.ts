#!/usr/bin/env node

import { Command } from 'commander';
import { createRequire } from 'module';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { convertWithWarnings } from './main.js';

// Read our own version from package.json. createRequire resolves relative to
// this module, so `../package.json` points at the package root both from the
// TypeScript source (src/) and the compiled CLI (build/) after publish. This
// avoids JSON import attributes, which node16 module resolution would require.
const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const program = new Command();
program.name('w2m');
program.description('Convert Word documents to beautiful Markdown');
program.version(version);
program
  .command('convert', { isDefault: true })
  .argument('<file>', 'The Word document to convert')
  .option(
    '-o, --output <file>',
    'Write the Markdown to <file> instead of stdout. Warnings still print to ' +
      'stderr.',
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
  .action(async (file, options) => {
    try {
      // --image-dir (extract) takes precedence over --strip-images.
      if (options.imageDir && options.stripImages) {
        console.error('Ignoring --strip-images because --image-dir is set.');
      }
      const images = options.imageDir
        ? 'extract'
        : options.stripImages
          ? 'strip'
          : 'inline';
      const result = await convertWithWarnings(file, {
        images,
        imageDir: options.imageDir,
        numberedLists: options.bulletLists ? 'bullets' : 'ordered',
        underline: options.underline ? 'preserve' : 'ignore',
        footnotes: options.preserveFootnotes ? 'preserve' : 'gfm',
      });

      // Write extracted images to disk before emitting the Markdown that links
      // them. The links are relative to the Markdown file, so resolve them
      // against its directory (the working directory when writing to stdout).
      if (result.images && result.images.length > 0) {
        const markdownDir = options.output ? path.dirname(options.output) : '.';
        const imageDir = path.resolve(markdownDir, options.imageDir);
        await mkdir(imageDir, { recursive: true });
        await Promise.all(
          result.images.map((image) =>
            writeFile(path.resolve(markdownDir, image.path), image.bytes),
          ),
        );
        console.error(
          `Wrote ${result.images.length} image(s) to ${path.relative('.', imageDir) || '.'}/`,
        );
      }

      // Display warnings to stderr if any
      if (result.warnings.length > 0) {
        result.warnings.forEach((warning) => {
          console.error(warning);
        });
        console.error(''); // Empty line for separation
      }

      // Write the Markdown to the requested file, or stdout by default.
      if (options.output) {
        await mkdir(path.dirname(options.output), { recursive: true });
        await writeFile(options.output, result.markdown);
        console.error(`Wrote Markdown to ${options.output}`);
      } else {
        console.log(result.markdown);
      }
    } catch (error) {
      // Converter errors carry user-friendly messages; print anything else as-is
      console.error(
        'Error:',
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });

await program.parseAsync();
