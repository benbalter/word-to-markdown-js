#!/usr/bin/env node

import { Command } from 'commander';
import convert, {
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
  .action(async (file) => {
    try {
      const md = await convert(file);
      console.log(md);
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
      // Re-throw unexpected errors
      throw error;
    }
  });

program.parse();
