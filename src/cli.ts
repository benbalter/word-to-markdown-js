#!/usr/bin/env node

import { Command } from 'commander';
import convert, { UnsupportedFileError } from './main.js';

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
      if (error instanceof UnsupportedFileError) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
      }
      throw error;
    }
  });

program.parse();
