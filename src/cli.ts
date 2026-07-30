#!/usr/bin/env node

import { Command } from 'commander';
import { mkdir, writeFile } from 'fs/promises';
import {
  convertWithWarnings,
  UnsupportedFileError,
  FileNotFoundError,
  InvalidFileError,
  FilePermissionError,
  ConversionError,
} from './main.js';

const program = new Command();
program.name('w2m');
program.description('Convert Word documents to beautiful Markdown');
program
  .command('convert', { isDefault: true })
  .argument('<file>', 'The Word document to convert')
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
  .action(async (file, options) => {
    try {
      // --image-dir (extract) takes precedence over --strip-images.
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
      });

      // Write extracted images to disk before emitting the Markdown that links
      // them. Paths are already prefixed with the requested directory.
      if (result.images && result.images.length > 0) {
        await mkdir(options.imageDir, { recursive: true });
        await Promise.all(
          result.images.map((image) => writeFile(image.path, image.bytes)),
        );
        console.error(
          `Wrote ${result.images.length} image(s) to ${options.imageDir}/`,
        );
      }

      // Display warnings to stderr if any
      if (result.warnings.length > 0) {
        result.warnings.forEach((warning) => {
          console.error(warning);
        });
        console.error(''); // Empty line for separation
      }

      // Output markdown to stdout
      console.log(result.markdown);
    } catch (error) {
      // Handle our custom errors with user-friendly messages
      if (
        error instanceof UnsupportedFileError ||
        error instanceof FileNotFoundError ||
        error instanceof InvalidFileError ||
        error instanceof FilePermissionError ||
        error instanceof ConversionError
      ) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
      }
      // Handle unexpected errors (including non-Error objects)
      console.error(
        'Error:',
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });

program.parse();
