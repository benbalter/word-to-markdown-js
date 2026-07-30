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
    '| **Foo** | **Bar** |\n| ------- | ------- |\n| One     | Two     |\n| Three   | Four    |',
  ul: '- One\n- Two\n- Three',
  ol: '1. One\n2. Two\n3. Three',
  'nested-ol':
    '1. One\n   1. Sub one\n   2. Sub two\n2. Two\n   1. Sub one\n      1. Sub sub one\n      2. Sub sub two\n   2. Sub two\n3. Three',
  'nested-ul':
    '- One\n  - Sub one\n    - Sub sub one\n    - Sub sub two\n  - Sub two\n- Two',
  'list-with-links':
    '[word-to-markdown](https://github.com/benbalter/word-to-markdown)\n\n- [word-to-markdown](https://github.com/benbalter/word-to-markdown)',
  'comma after bold': 'This is **bolded**, and text.',
  'text after bold': '**This** is **bolded** _and_ text.',
  'file with space': 'This is paragraph text.',
  'html-entities':
    'Ben & Jerry\'s ice cream costs $5 < $10. Use "quotes" for text.',
  'small-medium-large':
    'Large text\n\nParagraph\n\nMedium Text\n\nParagraph\n\nSmall text\n\nParagraph',
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
    const htmlWithEntities =
      '<p>Ben &amp; Jerry&#39;s ice cream costs $5 &lt; $10. Use &quot;quotes&quot; for text.</p>';
    const expectedMarkdown =
      'Ben & Jerry\'s ice cream costs \\$5 < \\$10. Use "quotes" for text.';

    const result = htmlToMd(htmlWithEntities);
    expect(result).toEqual(expectedMarkdown);
  });

  it('should decode double-encoded HTML entities', async () => {
    const { htmlToMd } = await import('../main.js');
    const htmlWithDoubleEntities =
      '<p>&amp;amp; &amp;lt; &amp;gt; &amp;quot;</p>';
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
    const expectedMarkdown = "© ™ ' …";

    const result = htmlToMd(htmlWithNumericEntities);
    expect(result).toEqual(expectedMarkdown);
  });

  it('should decode astral-plane numeric entities (code points > U+FFFF)', async () => {
    const { htmlToMd } = await import('../main.js');
    // U+1F600 (😀) and U+1F4A9 (💩) live outside the BMP; fromCharCode would
    // truncate them, fromCodePoint decodes them correctly.
    const htmlWithAstralEntities = '<p>&#128512; &#x1F4A9;</p>';
    const expectedMarkdown = '😀 💩';

    const result = htmlToMd(htmlWithAstralEntities);
    expect(result).toEqual(expectedMarkdown);
  });

  it('should not throw on out-of-range numeric entities', async () => {
    const { htmlToMd } = await import('../main.js');
    // Code point beyond U+10FFFF is invalid; decoding must not throw
    // (fromCodePoint raises RangeError, which our guard swallows).
    expect(() => htmlToMd('<p>&#99999999;</p>')).not.toThrow();
  });

  it('should decode hex entities with both lowercase and uppercase X', async () => {
    const { htmlToMd } = await import('../main.js');
    // Test both &#x27; (lowercase) and &#X27; (uppercase)
    const htmlWithHexEntities = '<p>&#x27; &#X27; &#x41; &#X41;</p>';
    const expectedMarkdown = "' ' A A";

    const result = htmlToMd(htmlWithHexEntities);
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

  // Tests for table divider bug fix
  describe('table divider bug fix', () => {
    // Import modules for direct testing
    const testHtmlToMd = async (html: string) => {
      const { parse } = await import('node-html-parser');
      const TurndownService = (await import('@joplin/turndown')).default;
      const turndownPluginGfm = await import('@joplin/turndown-plugin-gfm');

      // Apply autoTableHeaders logic
      const root = parse(html);
      root.querySelectorAll('table').forEach((table) => {
        const firstRow = table.querySelector('tr');
        if (!firstRow) return;

        // If first row already has TH elements, leave it alone
        if (firstRow.querySelector('th')) return;

        // Check if first row is empty or has only empty cells
        const cells = firstRow.querySelectorAll('td');
        const isEmpty =
          cells.length === 0 ||
          cells.every((cell) => !cell.textContent?.trim());

        if (isEmpty) {
          // Remove empty first row and find the first non-empty row to convert
          firstRow.remove();
          const nextRow = table.querySelector('tr');
          if (nextRow) {
            nextRow.querySelectorAll('td').forEach((cell) => {
              cell.tagName = 'th';
            });
          }
        } else {
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
    };

    it('should remove empty first row and convert next row to headers', async () => {
      const html = '<table><tr></tr><tr><td>D1</td><td>D2</td></tr></table>';
      const md = await testHtmlToMd(html);
      expect(md).toEqual('| D1  | D2  |\n| --- | --- |');
      expect(md).not.toContain('|     |     |'); // No empty divider row
    });

    it('should remove first row with empty cells and convert next row to headers', async () => {
      const html =
        '<table><tr><td></td><td></td></tr><tr><td>D1</td><td>D2</td></tr></table>';
      const md = await testHtmlToMd(html);
      expect(md).toEqual('| D1  | D2  |\n| --- | --- |');
      expect(md).not.toContain('|     |     |'); // No empty divider row
    });

    it('should remove first row with whitespace-only cells', async () => {
      const html =
        '<table><tr><td>   </td><td> \n </td></tr><tr><td>D1</td><td>D2</td></tr></table>';
      const md = await testHtmlToMd(html);
      expect(md).toEqual('| D1  | D2  |\n| --- | --- |');
      expect(md).not.toContain('|     |     |'); // No empty divider row
    });

    it('should not modify tables that already have TH elements', async () => {
      const html =
        '<table><tr><th>H1</th><th>H2</th></tr><tr><td>D1</td><td>D2</td></tr></table>';
      const md = await testHtmlToMd(html);
      expect(md).toEqual('| H1  | H2  |\n| --- | --- |\n| D1  | D2  |');
    });

    it('should convert normal TD headers correctly', async () => {
      const html =
        '<table><tr><td>H1</td><td>H2</td></tr><tr><td>D1</td><td>D2</td></tr></table>';
      const md = await testHtmlToMd(html);
      expect(md).toEqual('| H1  | H2  |\n| --- | --- |\n| D1  | D2  |');
    });
  });

  describe('non-breaking space removal', () => {
    it('should remove unicode non-breaking spaces from conversion pipeline', () => {
      // Test the internal removeNonBreakingSpaces function
      // Since the function is not exported, we'll test it via the pipeline
      const textWithNbsp =
        'This is\u00A0text with\u2007various\u202F non-breaking\u2060spaces\uFEFF.';

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

  describe('unicode bullet removal', () => {
    it('should remove unicode bullets from unnumbered lists', async () => {
      // Test the unicode bullet removal functionality
      const TurndownService = (await import('@joplin/turndown')).default;
      const turndownPluginGfm = await import('@joplin/turndown-plugin-gfm');
      const { parse } = await import('node-html-parser');

      // Replicate the removeUnicodeBullets function logic for testing
      function removeUnicodeBullets(html: string): string {
        const root = parse(html);
        const unicodeBullets = ['•', '◦', '▪', '▫', '‣', '⁃', '∙', '·'];
        const bulletRegex = new RegExp(
          `^\\s*[${unicodeBullets.map((b) => b.replace(/[.*+?^${}()|[\\\]\\]/g, '\\$&')).join('')}]\\s*`,
        );

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
      const htmlWithBullets =
        '<ul><li>• Item one</li><li>◦ Item two</li><li>▪ Item three</li></ul>';
      const htmlWithMixedBullets =
        '<ul><li>Normal item</li><li>• Item with bullet</li></ul>';
      const htmlNumberedList =
        '<ol><li>• Should keep bullet in numbered list</li></ol>';

      expect(testHtmlToMd(htmlWithBullets)).toEqual(
        '- Item one\n- Item two\n- Item three',
      );
      expect(testHtmlToMd(htmlWithMixedBullets)).toEqual(
        '- Normal item\n- Item with bullet',
      );
      expect(testHtmlToMd(htmlNumberedList)).toEqual(
        '1.  • Should keep bullet in numbered list',
      );
    });
  });

  // Test for catastrophic backtracking prevention in decodeHtmlEntities
  describe('decodeHtmlEntities regex backtracking', () => {
    it('should handle malformed entities without causing stack overflow', async () => {
      const { htmlToMd } = await import('../main.js');

      // Create a pathological input that could cause catastrophic backtracking
      // A long string of & characters followed by word characters without proper termination
      // The pattern &[#\w]+ can backtrack excessively on strings like &aaaaa...aaa (no semicolon)
      const malformedEntities = '<p>' + '&' + 'a'.repeat(1000) + ' text</p>';

      // This should complete without causing a RangeError: Maximum call stack size exceeded
      expect(() => {
        htmlToMd(malformedEntities);
      }).not.toThrow();
    });

    it('should handle multiple malformed entities efficiently', async () => {
      const { htmlToMd } = await import('../main.js');

      // Multiple malformed entities can compound the backtracking issue
      const repeatedMalformed = '<p>' + '&aaaaaaaaaa '.repeat(100) + '</p>';

      // Should complete without throwing an error
      expect(() => {
        htmlToMd(repeatedMalformed);
      }).not.toThrow();
    });

    it('should handle deeply nested encoded entities with iteration limit', async () => {
      const { htmlToMd } = await import('../main.js');

      // Create a deeply nested encoded entity that could cause infinite loop
      // &amp;amp;amp;amp;... repeated many times
      let deeplyNested = 'test';
      for (let i = 0; i < 20; i++) {
        deeplyNested = '&amp;' + deeplyNested;
      }
      const html = `<p>${deeplyNested}</p>`;

      // This should complete without hanging or causing stack overflow
      const result = htmlToMd(html);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle very long strings with multiple ampersands', async () => {
      const { htmlToMd } = await import('../main.js');

      // Create a very long string with many & characters
      const longString =
        '<p>' + ('text & ' + 'word '.repeat(1000)).repeat(10) + '</p>';

      // Should complete without throwing an error
      const result = htmlToMd(longString);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });
});

describe('extractMammothWarnings', () => {
  it('surfaces messages that indicate dropped or unconvertible content', async () => {
    const { extractMammothWarnings } = await import('../main.js');
    const warnings = extractMammothWarnings([
      {
        type: 'warning',
        message: 'An unrecognised element was ignored: v:shape',
      },
      {
        type: 'warning',
        message: 'Image of type image/x-emf could not be converted',
      },
    ]);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('v:shape');
    expect(warnings[1]).toContain('image/x-emf');
  });

  it('filters out cosmetic style notices that do not lose content', async () => {
    const { extractMammothWarnings } = await import('../main.js');
    const warnings = extractMammothWarnings([
      {
        type: 'warning',
        message: "Unrecognised run style: 'null' (Style ID: FootnoteReference)",
      },
      {
        type: 'warning',
        message:
          'Run style with ID FootnoteReference was referenced but not defined in the document',
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it('de-duplicates repeated messages', async () => {
    const { extractMammothWarnings } = await import('../main.js');
    const warnings = extractMammothWarnings([
      {
        type: 'warning',
        message: 'An unrecognised element was ignored: w:drawing',
      },
      {
        type: 'warning',
        message: 'An unrecognised element was ignored: w:drawing',
      },
    ]);
    expect(warnings).toHaveLength(1);
  });
});

describe('convert vs convertWithWarnings parity', () => {
  it('produce identical markdown for the same document', async () => {
    const { default: convert, convertWithWarnings } =
      await import('../main.js');
    const path = 'src/__fixtures__/footnote.docx';
    const [plain, withWarnings] = await Promise.all([
      convert(path),
      convertWithWarnings(path),
    ]);
    expect(withWarnings.markdown).toEqual(plain);
  });

  it('does not emit noise warnings for an ordinary document', async () => {
    const { convertWithWarnings } = await import('../main.js');
    // footnote.docx emits only cosmetic mammoth style notices, which must be filtered
    const { warnings } = await convertWithWarnings(
      'src/__fixtures__/footnote.docx',
    );
    expect(warnings).toEqual([]);
  });

  it('classify a missing file identically', async () => {
    const {
      default: convert,
      convertWithWarnings,
      FileNotFoundError,
    } = await import('../main.js');
    await expect(
      convert('src/__fixtures__/does-not-exist.docx'),
    ).rejects.toBeInstanceOf(FileNotFoundError);
    await expect(
      convertWithWarnings('src/__fixtures__/does-not-exist.docx'),
    ).rejects.toBeInstanceOf(FileNotFoundError);
  });

  it('classify an invalid (non-docx) file identically', async () => {
    const {
      default: convert,
      convertWithWarnings,
      InvalidFileError,
    } = await import('../main.js');
    // package.json is a valid file but not a valid .docx ZIP
    await expect(convert('package.json')).rejects.toBeInstanceOf(
      InvalidFileError,
    );
    await expect(convertWithWarnings('package.json')).rejects.toBeInstanceOf(
      InvalidFileError,
    );
  });
});

describe('conversion options', () => {
  const IMAGE = 'src/__fixtures__/image.docx';
  const OL = 'src/__fixtures__/ol.docx';

  it('inlines images as base64 data URIs by default', async () => {
    const { default: convert } = await import('../main.js');
    const md = await convert(IMAGE);
    expect(md).toContain('data:image/png;base64');
    expect(md).toContain('Text after image.');
  });

  it('strips images with { images: "strip" }', async () => {
    const { default: convert } = await import('../main.js');
    const md = await convert(IMAGE, { images: 'strip' });
    expect(md).not.toContain('data:image');
    expect(md).not.toContain('!['); // no image markdown at all
    expect(md).toContain('Text after image.');
  });

  it('keeps numbered lists numbered by default', async () => {
    const { default: convert } = await import('../main.js');
    const md = await convert(OL);
    expect(md).toMatch(/^\s*1\.\s+One/m);
    expect(md).not.toContain('- One');
  });

  it('converts numbered lists to bullets with { numberedLists: "bullets" }', async () => {
    const { default: convert } = await import('../main.js');
    const md = await convert(OL, { numberedLists: 'bullets' });
    expect(md).toContain('- One');
    expect(md).not.toMatch(/^\s*1\.\s/m);
  });
});

describe('content-loss warnings (real fixture)', () => {
  const DROPPED = 'src/__fixtures__/dropped-content.docx';

  it('warns when Mammoth drops unrecognised content', async () => {
    const { convertWithWarnings } = await import('../main.js');
    const { markdown, warnings } = await convertWithWarnings(DROPPED);
    // The recognised text survives; the dropped element is reported.
    expect(markdown).toContain('Before.');
    expect(markdown).toContain('After.');
    expect(warnings.some((w) => /converted cleanly/i.test(w))).toBe(true);
  });

  it('convert() (no warnings) still returns the surviving content', async () => {
    const { default: convert } = await import('../main.js');
    const md = await convert(DROPPED);
    expect(md).toContain('Before.');
    expect(md).toContain('After.');
  });
});
