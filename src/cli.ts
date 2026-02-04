#!/usr/bin/env node

import { Command } from 'commander';
import { convertWithWarnings, UnsupportedFileError } from './main.js';

const program = new Command();
program.name('w2m');
program.description('Convert Word documents to beautiful Markdown');
program
  .command('convert', { isDefault: true })
  .argument('<file>', 'The Word document to convert')
  .action(async (file) => {
    try {
      const result = await convertWithWarnings(file);

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
      if (error instanceof UnsupportedFileError) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
      }
      throw error;
    }
  });

program.parse();
