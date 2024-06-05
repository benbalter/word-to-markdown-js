import { __awaiter } from "tslib";
import TurndownService from '@joplin/turndown';
import * as turndownPluginGfm from '@joplin/turndown-plugin-gfm';
import * as mammoth from 'mammoth';
import markdownlint from 'markdownlint';
import markdownlintRuleHelpers from 'markdownlint-rule-helpers';
import { parse } from 'node-html-parser';
const defaultTurndownOptions = {
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
};
// Turndown will add an empty header if the first row
// of the table isn't `<th>` elements. This function
// converts the first row of a table to `<th>` elements
// so that it renders correctly in Markdown.
function autoTableHeaders(html) {
    const root = parse(html);
    root.querySelectorAll('table').forEach((table) => {
        const firstRow = table.querySelector('tr');
        firstRow.querySelectorAll('td').forEach((cell) => {
            cell.tagName = 'th';
        });
    });
    return root.toString();
}
// Convert HTML to GitHub-flavored Markdown
function htmlToMd(html, options = {}) {
    const turndownService = new TurndownService(Object.assign(Object.assign({}, options), defaultTurndownOptions));
    turndownService.use(turndownPluginGfm.gfm);
    return turndownService.turndown(html).trim();
}
// Lint the Markdown and correct any issues
function lint(md) {
    const lintResult = markdownlint.sync({ strings: { md } });
    return markdownlintRuleHelpers.applyFixes(md, lintResult['md']).trim();
}
// Converts a Word document to crisp, clean Markdown
export default function convert(input, options = {}) {
    return __awaiter(this, void 0, void 0, function* () {
        let inputObj;
        if (typeof input === 'string') {
            inputObj = { path: input };
        }
        else {
            inputObj = { arrayBuffer: input };
        }
        const mammothResult = yield mammoth.convertToHtml(inputObj, options.mammoth);
        const html = autoTableHeaders(mammothResult.value);
        const md = htmlToMd(html, options.turndown);
        const cleanedMd = lint(md);
        return cleanedMd;
    });
}
//# sourceMappingURL=main.js.map