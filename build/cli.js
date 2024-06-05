#!/usr/bin/env node
import { __awaiter } from "tslib";
import { Command } from 'commander';
import convert from './main.js';
const program = new Command();
program.name('w2m');
program.description('Convert Word documents to beautiful Markdown');
program
    .command('convert', { isDefault: true })
    .argument('<file>', 'The Word document to convert')
    .action((file) => __awaiter(void 0, void 0, void 0, function* () {
    const md = yield convert(file);
    console.log(md);
}));
program.parse();
//# sourceMappingURL=cli.js.map