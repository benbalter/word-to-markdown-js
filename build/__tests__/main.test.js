import { __awaiter } from "tslib";
import convert from '../main.js';
// Map of fixtures and expected Markdown output
const expectations = {
    em: 'This word is _italic_.',
    strong: 'This word is **bold**.',
    h1: '# Heading 1\n\nParagraph text',
    h2: '## Heading 2\n\nParagraph text',
    p: 'This is paragraph text.',
    'multiple-headings': '# H1\n\nParagraph\n\n## H2\n\nParagraph\n\n### H3\n\nParagraph',
    table: '| **Foo** | **Bar** |\n| --- | --- |\n| One | Two |\n| Three | Four |',
    ul: '- One\n- Two\n- Three',
    ol: '1. One\n2. Two\n3. Three',
    'nested-ol': '1. One\n    1. Sub one\n    2. Sub two\n2. Two\n    1. Sub one\n        1. Sub sub one\n        2. Sub sub two\n    2. Sub two\n3. Three',
    'nested-ul': '- One\n  - Sub one\n    - Sub sub one\n    - Sub sub two\n  - Sub two\n- Two',
    'list-with-links': '[word-to-markdown](https://github.com/benbalter/word-to-markdown)\n\n- [word-to-markdown](https://github.com/benbalter/word-to-markdown)',
    'comma after bold': 'This is **bolded**, and text.',
    'text after bold': '**This** is **bolded** _and_ text.',
    'file with space': 'This is paragraph text.',
};
describe('main', () => {
    for (const [fixture, expected] of Object.entries(expectations)) {
        it(`should convert the "${fixture}" fixture to Markdown`, () => __awaiter(void 0, void 0, void 0, function* () {
            const path = `src/__fixtures__/${fixture}.docx`;
            const md = yield convert(path);
            expect(md).toEqual(expected);
        }));
    }
    // Tests for table divider bug fix
    describe('table divider bug fix', () => {
        // Import modules for direct testing
        const testHtmlToMd = (html) => __awaiter(void 0, void 0, void 0, function* () {
            const { parse } = yield import('node-html-parser');
            const TurndownService = (yield import('@joplin/turndown')).default;
            const turndownPluginGfm = yield import('@joplin/turndown-plugin-gfm');
            // Apply autoTableHeaders logic
            const root = parse(html);
            root.querySelectorAll('table').forEach((table) => {
                const firstRow = table.querySelector('tr');
                if (!firstRow)
                    return;
                // If first row already has TH elements, leave it alone
                if (firstRow.querySelector('th'))
                    return;
                // Check if first row is empty or has only empty cells
                const cells = firstRow.querySelectorAll('td');
                const isEmpty = cells.length === 0 ||
                    cells.every(cell => { var _a; return !((_a = cell.textContent) === null || _a === void 0 ? void 0 : _a.trim()); });
                if (isEmpty) {
                    // Remove empty first row and find the first non-empty row to convert
                    firstRow.remove();
                    const nextRow = table.querySelector('tr');
                    if (nextRow) {
                        nextRow.querySelectorAll('td').forEach((cell) => {
                            cell.tagName = 'th';
                        });
                    }
                }
                else {
                    // Convert first row TD elements to TH
                    cells.forEach((cell) => {
                        cell.tagName = 'th';
                    });
                }
            });
            const processedHtml = root.toString();
            const turndownService = new TurndownService({
                headingStyle: 'atx',
                codeBlockStyle: 'fenced',
                bulletListMarker: '-',
            });
            turndownService.use(turndownPluginGfm.gfm);
            return turndownService.turndown(processedHtml);
        });
        it('should remove empty first row and convert next row to headers', () => __awaiter(void 0, void 0, void 0, function* () {
            const html = '<table><tr></tr><tr><td>D1</td><td>D2</td></tr></table>';
            const md = yield testHtmlToMd(html);
            expect(md).toEqual('| D1  | D2  |\n| --- | --- |');
            expect(md).not.toContain('|     |     |'); // No empty divider row
        }));
        it('should remove first row with empty cells and convert next row to headers', () => __awaiter(void 0, void 0, void 0, function* () {
            const html = '<table><tr><td></td><td></td></tr><tr><td>D1</td><td>D2</td></tr></table>';
            const md = yield testHtmlToMd(html);
            expect(md).toEqual('| D1  | D2  |\n| --- | --- |');
            expect(md).not.toContain('|     |     |'); // No empty divider row
        }));
        it('should remove first row with whitespace-only cells', () => __awaiter(void 0, void 0, void 0, function* () {
            const html = '<table><tr><td>   </td><td> \n </td></tr><tr><td>D1</td><td>D2</td></tr></table>';
            const md = yield testHtmlToMd(html);
            expect(md).toEqual('| D1  | D2  |\n| --- | --- |');
            expect(md).not.toContain('|     |     |'); // No empty divider row
        }));
        it('should not modify tables that already have TH elements', () => __awaiter(void 0, void 0, void 0, function* () {
            const html = '<table><tr><th>H1</th><th>H2</th></tr><tr><td>D1</td><td>D2</td></tr></table>';
            const md = yield testHtmlToMd(html);
            expect(md).toEqual('| H1  | H2  |\n| --- | --- |\n| D1  | D2  |');
        }));
        it('should convert normal TD headers correctly', () => __awaiter(void 0, void 0, void 0, function* () {
            const html = '<table><tr><td>H1</td><td>H2</td></tr><tr><td>D1</td><td>D2</td></tr></table>';
            const md = yield testHtmlToMd(html);
            expect(md).toEqual('| H1  | H2  |\n| --- | --- |\n| D1  | D2  |');
        }));
    });
});
//# sourceMappingURL=main.test.js.map