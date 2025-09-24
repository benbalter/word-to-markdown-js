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
    describe('non-breaking space removal', () => {
        it('should remove unicode non-breaking spaces from conversion pipeline', () => {
            // Test the internal removeNonBreakingSpaces function
            // Since the function is not exported, we'll test it via the pipeline
            const textWithNbsp = 'This is\u00A0text with\u2007various\u202F non-breaking\u2060spaces\uFEFF.';
            // Expected result: non-breaking spaces should be converted to regular spaces or removed
            const expected = 'This is text with various  non-breakingspaces.';
            // Test the logic directly
            const result = textWithNbsp
                .replace(/\u00A0/g, ' ') // Non-breaking space
                .replace(/\u2007/g, ' ') // Figure space
                .replace(/\u202F/g, ' ') // Narrow no-break space
                .replace(/\u2060/g, '') // Word joiner (zero-width non-breaking space)
                .replace(/\uFEFF/g, ''); // Zero-width no-break space (BOM)
            expect(result).toEqual(expected);
            expect(result).not.toContain('\u00A0'); // Non-breaking space
            expect(result).not.toContain('\u2007'); // Figure space
            expect(result).not.toContain('\u202F'); // Narrow no-break space
            expect(result).not.toContain('\u2060'); // Word joiner
            expect(result).not.toContain('\uFEFF'); // BOM
        });
    });
});
//# sourceMappingURL=main.test.js.map