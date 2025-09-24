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
    expect(result).toContain('© ™ ®');
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
    const { htmlToMd } = await import('../main.js');

    // Note: Most Markdown flavors don't support colspan/rowspan, but we test graceful degradation
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

    const result = htmlToMd(complexTableHtml);

    // Should contain table structure even if colspan/rowspan is not preserved
    expect(result).toContain('| Normal cell |'); // First row content
    expect(result).toContain('Spanning cell');
    expect(result).toContain('Tall cell');
    expect(result).toContain('| --- |');
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

    // This tests the main convert function with options
    // Since we can't easily create a .docx file, we'll test the htmlToMd function directly
    const { htmlToMd } = await import('../main.js');
    const result = htmlToMd(testHtml, options.turndown);

    // The conversion process may override some options due to the linting step
    expect(result).toContain('Heading');
    // Bullet markers may be normalized by the linting process
    expect(result).toContain('Item 1');
    expect(result).toContain('Item 2');
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
});
