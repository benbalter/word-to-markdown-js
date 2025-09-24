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
  'html-entities': 'Ben & Jerry\'s ice cream costs $5 < $10. Use "quotes" for text.',
};

describe('main', () => {
  for (const [fixture, expected] of Object.entries(expectations)) {
    if (fixture === 'html-entities') {
      // Skip the html-entities test for now since we don't have a fixture
      continue;
    }
    it(`should convert the "${fixture}" fixture to Markdown`, async () => {
      const path = `src/__fixtures__/${fixture}.docx`;
      const md = await convert(path);
      expect(md).toEqual(expected);
    });
  }
  
  // Test HTML entity decoding directly
  it('should decode HTML entities in converted HTML', async () => {
    const { htmlToMd } = await import('../main.js');
    const htmlWithEntities = '<p>Ben &amp; Jerry&#39;s ice cream costs $5 &lt; $10. Use &quot;quotes&quot; for text.</p>';
    const expectedMarkdown = 'Ben & Jerry\'s ice cream costs \\$5 < \\$10. Use "quotes" for text.';
    
    const result = htmlToMd(htmlWithEntities);
    expect(result).toEqual(expectedMarkdown);
  });

  it('should decode double-encoded HTML entities', async () => {
    const { htmlToMd } = await import('../main.js');
    const htmlWithDoubleEntities = '<p>&amp;amp; &amp;lt; &amp;gt; &amp;quot;</p>';
    // &amp;amp; -> & (decoded by our function)
    // &amp;lt; -> &lt; (partially decoded, Turndown keeps it as entity to avoid HTML confusion)
    // &amp;gt; -> &gt; (partially decoded, Turndown keeps it as entity to avoid HTML confusion)
    // &amp;quot; -> " (decoded by our function)
    const expectedMarkdown = '& &lt; &gt; "';
    
    const result = htmlToMd(htmlWithDoubleEntities);
    expect(result).toEqual(expectedMarkdown);
  });

  it('should decode numeric HTML entities', async () => {
    const { htmlToMd } = await import('../main.js');
    const htmlWithNumericEntities = '<p>&#169; &#8482; &#x27; &#8230;</p>';
    const expectedMarkdown = '© ™ \' …';
    
    const result = htmlToMd(htmlWithNumericEntities);
    expect(result).toEqual(expectedMarkdown);
  });

  it('should fully decode isolated double-encoded entities', async () => {
    const { htmlToMd } = await import('../main.js');
    // When entities are isolated, Turndown can safely decode them fully
    const isolatedDoubleEncoded = '<p>&amp;lt;</p>';
    const expectedMarkdown = '<';
    
    const result = htmlToMd(isolatedDoubleEncoded);
    expect(result).toEqual(expectedMarkdown);
  });
});
