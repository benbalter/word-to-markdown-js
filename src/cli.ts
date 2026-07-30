#!/usr/bin/env node

import { Command } from 'commander';
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
    '--ordered-lists',
    'Keep numbered lists as 1./2./3. rather than converting them to bullets',
  )
  .option(
    '--underline',
    'Preserve underlined text as inline <u> tags (dropped by default)',
  )
  .action(async (file, options) => {
    try {
      const result = await convertWithWarnings(file, {
        images: options.stripImages ? 'strip' : 'inline',
        numberedLists: options.orderedLists ? 'ordered' : 'bullets',
        underline: options.underline ? 'preserve' : 'ignore',
      });

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
