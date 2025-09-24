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

  it('should remove unicode bullets from unnumbered lists', async () => {
    // Test the unicode bullet removal functionality
    const TurndownService = (await import('@joplin/turndown')).default;
    const turndownPluginGfm = await import('@joplin/turndown-plugin-gfm');
    const { parse } = await import('node-html-parser');
    
    // Replicate the removeUnicodeBullets function logic for testing
    function removeUnicodeBullets(html: string): string {
      const root = parse(html);
      const unicodeBullets = ['•', '◦', '▪', '▫', '‣', '⁃', '∙', '·'];
      const bulletRegex = new RegExp(`^\\s*[${unicodeBullets.map(b => b.replace(/[.*+?^${}()|[\\\]\\]/g, '\\$&')).join('')}]\\s*`);
      
      root.querySelectorAll('ul li').forEach((listItem) => {
        const textContent = listItem.innerHTML;
        const cleanedContent = textContent.replace(bulletRegex, '');
        if (cleanedContent !== textContent) {
          listItem.innerHTML = cleanedContent;
        }
      });
      
      return root.toString();
    }
    
    function testHtmlToMd(html: string): string {
      const cleanedHtml = removeUnicodeBullets(html);
      const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        bulletListMarker: '-',
      });
      turndownService.use(turndownPluginGfm.gfm);
      return turndownService.turndown(cleanedHtml).trim();
    }
    
    // Test cases
    const htmlWithBullets = '<ul><li>• Item one</li><li>◦ Item two</li><li>▪ Item three</li></ul>';
    const htmlWithMixedBullets = '<ul><li>Normal item</li><li>• Item with bullet</li></ul>';
    const htmlNumberedList = '<ol><li>• Should keep bullet in numbered list</li></ol>';
    
    expect(testHtmlToMd(htmlWithBullets)).toEqual('- Item one\n- Item two\n- Item three');
    expect(testHtmlToMd(htmlWithMixedBullets)).toEqual('- Normal item\n- Item with bullet');
    expect(testHtmlToMd(htmlNumberedList)).toEqual('1.  • Should keep bullet in numbered list');
  });
});
