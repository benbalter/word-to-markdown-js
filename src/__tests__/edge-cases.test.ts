import convert from '../main.js';

describe('edge cases and advanced features', () => {
  // Test error handling with invalid input
  it('should handle invalid file path gracefully', async () => {
    await expect(convert('/nonexistent/file.docx')).rejects.toThrow();
  });

  it('should handle ArrayBuffer input', async () => {
    // Create a minimal valid Word document as ArrayBuffer
    // This is a simplified test - in practice, this would be actual .docx binary data
    const emptyBuffer = new ArrayBuffer(0);

    // The function should handle ArrayBuffer input without throwing
    await expect(convert(emptyBuffer)).rejects.toThrow(); // Empty buffer should fail gracefully
  });

  // Test HTML entity decoding edge cases
  it('should handle complex HTML entities', async () => {
    const { htmlToMd } = await import('../main.js');

    const htmlWithComplexEntities = `
      <p>&lt;script&gt;alert('XSS')&lt;/script&gt;</p>
      <p>&amp;nbsp; &amp;copy; &amp;trade; &amp;reg;</p>
      <p>&ldquo;Smart quotes&rdquo; and &lsquo;single quotes&rsquo;</p>
      <p>&ndash; en dash and &mdash; em dash</p>
    `;

    const result = htmlToMd(htmlWithComplexEntities);

    // Verify entities are handled appropriately (some may be preserved for security)
    expect(result).toContain("alert('XSS')"); // The script tags may be escaped
    // Double-encoded entities decode once, keeping the text the author typed.
    expect(result).toContain('&nbsp; &copy; &trade; &reg;');
    expect(result).toContain('Smart quotes'); // Contains the text regardless of quote style
    expect(result).toContain('– en dash and — em dash');
  });

  // Test whitespace handling
  it('should normalize whitespace correctly', async () => {
    const { htmlToMd } = await import('../main.js');

    const htmlWithWhitespace = `
      <p>   Multiple   spaces   between   words   </p>
      <p>
        Text with
        line breaks
        in the middle
      </p>
      <p>&nbsp;&nbsp;&nbsp;Non-breaking spaces</p>
    `;

    const result = htmlToMd(htmlWithWhitespace);

    // Verify whitespace is normalized
    expect(result).toContain('Multiple spaces between words');
    expect(result).toContain('Text with line breaks in the middle');
    expect(result).toContain('Non-breaking spaces');
  });

  // Test special character combinations
  it('should handle special character combinations', async () => {
    const { htmlToMd } = await import('../main.js');

    const htmlWithSpecialChars = `
      <p><strong><em>Bold and italic together</em></strong></p>
      <p><strong>Bold with <a href="http://example.com">link</a> inside</strong></p>
      <p><em>Italic with <code>code</code> inside</em></p>
      <p><del><strong>Strikethrough bold</strong></del></p>
      <p><u><em>Underline italic</em></u></p>
    `;

    const result = htmlToMd(htmlWithSpecialChars);

    expect(result).toContain('**_Bold and italic together_**');
    expect(result).toContain('**Bold with [link](http://example.com) inside**');
    expect(result).toContain('_Italic with `code` inside_');
    expect(result).toContain('~~**Strikethrough bold**~~');
    // Underline may be converted differently depending on the conversion rules
    expect(result).toContain('_Underline italic_');
  });

  // Test table edge cases
  it('should handle tables with colspan and rowspan', async () => {
    const { htmlToMd, processHtml } = await import('../main.js');

    // Markdown has no merged cells, so merges degrade into empty cells. Going
    // through processHtml (as the converter does) is what makes the rows line
    // up: header promotion is what asks Turndown for a delimiter row, and that
    // row used to be built with more cells than the header had.
    const complexTableHtml = `
      <table>
        <tr>
          <td>Normal cell</td>
          <td colspan="2">Spanning cell</td>
        </tr>
        <tr>
          <td rowspan="2">Tall cell</td>
          <td>Cell 1</td>
          <td>Cell 2</td>
        </tr>
        <tr>
          <td>Cell 3</td>
          <td>Cell 4</td>
        </tr>
      </table>
    `;

    const result = htmlToMd(processHtml(complexTableHtml));

    // Every row spans the same three columns: the colspan widens the header to
    // three cells, and the rowspan puts an empty cell in the last row.
    expect(result).toEqual(
      [
        '| Normal cell | Spanning cell |     |',
        '| --- | --- | --- |',
        '| Tall cell | Cell 1 | Cell 2 |',
        '|     | Cell 3 | Cell 4 |',
      ].join('\n'),
    );
  });

  it('should keep the delimiter row in step with a colspan header', async () => {
    const { htmlToMd, processHtml } = await import('../main.js');

    // https://github.com/benbalter/word-to-markdown-js/issues/282 — a header
    // whose merged cells make it narrower than the body produced a delimiter
    // row with more cells than the header, so the table stopped rendering.
    const html = `
      <table>
        <tr>
          <td>Product</td>
          <td colspan="2">North America</td>
          <td colspan="2">Europe</td>
        </tr>
        <tr>
          <td>Item</td>
          <td>Q1</td>
          <td>Q2</td>
          <td>Q1</td>
          <td>Q2</td>
        </tr>
      </table>
    `;

    const result = htmlToMd(processHtml(html));
    const widths = result
      .split('\n')
      .filter((line: string) => line.startsWith('|'))
      .map((line: string) => line.split('|').length - 2);

    expect(widths).toEqual([5, 5, 5]);
    expect(result).toContain(
      '| Product | North America |     | Europe |     |',
    );
  });

  it('should not pad a one-cell table into a table', async () => {
    const { htmlToMd, processHtml } = await import('../main.js');

    // Word's bordered single-cell box: rendered as content, not a table, and
    // the colspan must not turn it into a two-column one.
    const html = '<table><tr><td colspan="2"><p>Note</p></td></tr></table>';

    expect(htmlToMd(processHtml(html))).toEqual('Note');
  });

  it('should ignore a merge extent that is not a count', async () => {
    const { htmlToMd, processHtml } = await import('../main.js');

    // Word writes colspan="0"/"-" for a merge that runs to the end of the row.
    const html =
      '<table><tr><td>a</td><td>b</td></tr><tr><td colspan="0">c</td><td rowspan="-1">d</td></tr></table>';

    expect(htmlToMd(processHtml(html))).toEqual(
      ['| a   | b   |', '| --- | --- |', '| c   | d   |'].join('\n'),
    );
  });

  it('should fill every row a rowspan covers, not just the next one', async () => {
    const { htmlToMd, processHtml } = await import('../main.js');

    const html =
      '<table><tr><td>H1</td><td>H2</td></tr><tr><td rowspan="3">A</td><td>1</td></tr><tr><td>2</td></tr><tr><td>3</td></tr></table>';

    expect(htmlToMd(processHtml(html))).toEqual(
      [
        '| H1  | H2  |',
        '| --- | --- |',
        '| A   | 1   |',
        '|     | 2   |',
        '|     | 3   |',
      ].join('\n'),
    );
  });

  it('should fill a block merged across both rows and columns', async () => {
    const { htmlToMd, processHtml } = await import('../main.js');

    const html =
      '<table><tr><td>a</td><td>b</td><td>c</td></tr><tr><td colspan="2" rowspan="2">X</td><td>f</td></tr><tr><td>h</td></tr></table>';

    expect(htmlToMd(processHtml(html))).toEqual(
      [
        '| a   | b   | c   |',
        '| --- | --- | --- |',
        '| X   |     | f   |',
        '|     |     | h   |',
      ].join('\n'),
    );
  });

  it("should not apply an outer table's merges to a nested table", async () => {
    const { processHtml } = await import('../main.js');
    const { parse } = await import('node-html-parser');

    const html =
      '<table><tr><td>H1</td><td>H2</td></tr><tr><td rowspan="2">A<table><tr><td>x</td><td>y</td></tr><tr><td>z</td><td>w</td></tr></table></td><td>1</td></tr><tr><td>2</td></tr></table>';

    const inner = parse(processHtml(html)).querySelector('td table')!;
    const widths = inner
      .querySelectorAll('tr')
      .map((row) => row.querySelectorAll('td, th').length);

    expect(widths).toEqual([2, 2]);
  });

  it('should expand merges in a repeating header row', async () => {
    const { htmlToMd, processHtml } = await import('../main.js');

    // Mammoth writes a Word row marked "Repeat as header row" as <thead><th>,
    // which the header promotion leaves alone.
    const html =
      '<table><thead><tr><th>Product</th><th colspan="2">North America</th></tr></thead><tbody><tr><td>Shoes</td><td>Q1</td><td>Q2</td></tr></tbody></table>';

    expect(htmlToMd(processHtml(html))).toEqual(
      [
        '| Product | North America |     |',
        '| --- | --- | --- |',
        '| Shoes | Q1  | Q2  |',
      ].join('\n'),
    );
  });

  // Test list edge cases
  it('should handle deeply nested mixed lists', async () => {
    const { htmlToMd } = await import('../main.js');

    const deepListHtml = `
      <ul>
        <li>Level 1 bullet
          <ol>
            <li>Level 2 number
              <ul>
                <li>Level 3 bullet
                  <ol>
                    <li>Level 4 number
                      <ul>
                        <li>Level 5 bullet</li>
                      </ul>
                    </li>
                  </ol>
                </li>
              </ul>
            </li>
          </ol>
        </li>
      </ul>
    `;

    const result = htmlToMd(deepListHtml);

    expect(result).toContain('Level 1 bullet');
    expect(result).toContain('Level 2 number');
    expect(result).toContain('Level 3 bullet');
    expect(result).toContain('Level 4 number');
    expect(result).toContain('Level 5 bullet');
  });

  // Test link edge cases
  it('should handle various link formats', async () => {
    const { htmlToMd } = await import('../main.js');

    const linkHtml = `
      <p><a href="https://example.com">Simple link</a></p>
      <p><a href="https://example.com" title="Link title">Link with title</a></p>
      <p><a href="mailto:test@example.com">Email link</a></p>
      <p><a href="#section1">Internal link</a></p>
      <p><a href="../relative/path.html">Relative link</a></p>
      <p><a href="">Empty href</a></p>
      <p><a>Link without href</a></p>
    `;

    const result = htmlToMd(linkHtml);

    expect(result).toContain('[Simple link](https://example.com)');
    expect(result).toContain(
      '[Link with title](https://example.com "Link title")',
    );
    expect(result).toContain('[Email link](mailto:test@example.com)');
    expect(result).toContain('[Internal link](#section1)');
    expect(result).toContain('[Relative link](../relative/path.html)');
    // Links without proper href should degrade gracefully
    expect(result).toContain('Empty href');
    expect(result).toContain('Link without href');
  });

  // Test conversion options
  it('should respect conversion options', async () => {
    const testHtml = `
      <h1>Heading</h1>
      <ul>
        <li>Item 1</li>
        <li>Item 2</li>
      </ul>
      <pre><code>code block</code></pre>
    `;

    // Test with different turndown options
    const options = {
      turndown: {
        headingStyle: 'setext',
        bulletListMarker: '*',
        codeBlockStyle: 'indented',
      },
    };

    // htmlToMd runs Turndown directly (no lint/prettify), so caller options
    // must take effect verbatim.
    const { htmlToMd } = await import('../main.js');
    const result = htmlToMd(testHtml, options.turndown);

    // setext heading style underlines h1 with '=' instead of using '#'
    expect(result).toContain('Heading\n=====');
    expect(result).not.toContain('# Heading');
    // custom bullet marker is respected
    expect(result).toContain('* Item 1');
    expect(result).toContain('* Item 2');
    // indented code block style uses 4-space indentation, not fences
    expect(result).toContain('    code block');
    expect(result).not.toContain('```');
  });

  // Test performance with large content
  it('should handle large HTML content efficiently', async () => {
    const { htmlToMd } = await import('../main.js');

    // Generate a large HTML document
    let largeHtml = '<div>';
    for (let i = 0; i < 1000; i++) {
      largeHtml += `<p>Paragraph ${i} with <strong>bold text</strong> and <em>italic text</em>.</p>`;
      if (i % 100 === 0) {
        largeHtml += `<h2>Section ${i / 100}</h2>`;
      }
    }
    largeHtml += '</div>';

    const startTime = Date.now();
    const result = htmlToMd(largeHtml);
    const endTime = Date.now();

    // Should complete within reasonable time (5 seconds)
    expect(endTime - startTime).toBeLessThan(5000);
    expect(result).toContain('Paragraph 0 with **bold text**');
    expect(result).toContain('Paragraph 999 with **bold text**');
    expect(result).toContain('## Section 0');
    expect(result).toContain('## Section 9');
  });

  // Test markdown linting and cleanup
  it('should clean up markdown syntax issues', async () => {
    // Test that the linting step fixes common markdown issues
    // This is tested indirectly through the conversion process
    const { htmlToMd } = await import('../main.js');

    const messyHtml = `
      <h1>  Title with extra spaces  </h1>
      <p>Paragraph with   multiple   spaces.</p>
      <ul>
        <li>
          <p>List item in paragraph</p>
        </li>
      </ul>
    `;

    const result = htmlToMd(messyHtml);

    // Should be cleaned up by markdownlint
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('promotes only the outer row when a header cell holds a nested table', async () => {
    const { processHtml } = await import('../main.js');
    const html = processHtml(
      '<table><tr><td>A<table><tr><td>x</td></tr><tr><td>y</td></tr></table></td><td>B</td></tr><tr><td>1</td><td>2</td></tr></table>',
    );
    // The nested table's second row must stay a data row.
    expect(html).toContain('<tr><td>y</td></tr>');
    expect(html).toContain('<th>B</th>');
  });

  it('keeps an image-only first table row as the header', async () => {
    const { processHtml } = await import('../main.js');
    const html = processHtml(
      '<table><tr><td><img src="data:image/png;base64,AA" alt="logo"></td></tr><tr><td>row</td></tr></table>',
    );
    expect(html).toContain('<th><img');
    expect(html).toContain('<td>row</td>');
  });

  it('renames <ol> to <ul> with bulletLists, keeping footnote and endnote lists', async () => {
    const { processHtml } = await import('../main.js');
    const html = processHtml(
      '<ol start="3" type="a"><li>One<ol><li>Sub</li></ol></li></ol>' +
        '<pre><code>1. install</code></pre>' +
        '<ol><li id="footnote-1"><p>Note.</p></li></ol>' +
        '<ol><li id="endnote-2"><p>End.</p></li></ol>',
      { bulletLists: true },
    );
    expect(html).toContain('<ul><li>One<ul><li>Sub</li></ul></li></ul>');
    expect(html).toContain('<pre><code>1. install</code></pre>');
    expect(html).toContain('<ol><li id="footnote-1">');
    expect(html).toContain('<ol><li id="endnote-2">');
  });

  it('turns Mammoth footnote and endnote markup into GFM footnotes', async () => {
    const { htmlToMd } = await import('../main.js');
    const html =
      '<p>A<sup><a href="#footnote-1" id="footnote-ref-1">[1]</a></sup> ' +
      'B<sup><a href="#endnote-2" id="endnote-ref-2">[2]</a></sup> ' +
      'C<sup>2</sup></p>' +
      '<ol><li id="footnote-1"><p>Foot. <a href="#footnote-ref-1">↑</a></p></li></ol>' +
      '<ol><li id="endnote-2"><p>End. <a href="#endnote-ref-2">↑</a></p></li></ol>';
    const md = htmlToMd(html, {}, [], true);
    expect(md).toContain('A[^1] B[^2] C<sup>2</sup>');
    expect(md).toContain('[^1]: Foot.');
    expect(md).toContain('[^2]: End.');
    expect(md).not.toContain('↑');
    // Without the flag the markup passes through as before.
    expect(htmlToMd(html)).toContain('#footnote-1');
  });

  it('leaves <ol> alone without bulletLists', async () => {
    const { processHtml } = await import('../main.js');
    expect(processHtml('<ol><li>One</li></ol>')).toBe('<ol><li>One</li></ol>');
  });
});
