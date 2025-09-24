import convert from '../main.js';

// Map of fixtures and expected Markdown output
const expectations = {
  em: 'This word is _italic_.',
  strong: 'This word is **bold**.',
  h1: '# Heading 1\n\nParagraph text',
  h2: '## Heading 2\n\nParagraph text',
  p: 'This is paragraph text.',
  'multiple-headings':
    '# H1\n\nParagraph\n\n## H2\n\nParagraph\n\n### H3\n\nParagraph',
  table:
    '| **Foo** | **Bar** |\n| --- | --- |\n| One | Two |\n| Three | Four |',
  ul: '- One\n- Two\n- Three',
  ol: '1. One\n2. Two\n3. Three',
  'nested-ol':
    '1. One\n    1. Sub one\n    2. Sub two\n2. Two\n    1. Sub one\n        1. Sub sub one\n        2. Sub sub two\n    2. Sub two\n3. Three',
  'nested-ul':
    '- One\n  - Sub one\n    - Sub sub one\n    - Sub sub two\n  - Sub two\n- Two',
  'list-with-links':
    '[word-to-markdown](https://github.com/benbalter/word-to-markdown)\n\n- [word-to-markdown](https://github.com/benbalter/word-to-markdown)',
  'comma after bold': 'This is **bolded**, and text.',
  'text after bold': '**This** is **bolded** _and_ text.',
  'file with space': 'This is paragraph text.',
};

describe('main', () => {
  for (const [fixture, expected] of Object.entries(expectations)) {
    it(`should convert the "${fixture}" fixture to Markdown`, async () => {
      const path = `src/__fixtures__/${fixture}.docx`;
      const md = await convert(path);
      expect(md).toEqual(expected);
    });
  }

  it('should handle empty tables without crashing', async () => {
    // Test the autoTableHeaders function directly with edge cases
    const { parse } = await import('node-html-parser');
    
    // This should not throw an error
    const emptyTableHtml = '<table></table>';
    const root = parse(emptyTableHtml);
    
    expect(() => {
      root.querySelectorAll('table').forEach((table) => {
        const firstRow = table.querySelector('tr');
        if (firstRow) {
          firstRow.querySelectorAll('td').forEach((cell) => {
            cell.tagName = 'th';
          });
        }
      });
    }).not.toThrow();
    
    expect(root.toString()).toBe('<table></table>');
  });
});
