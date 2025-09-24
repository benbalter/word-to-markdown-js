// Complex document tests using HTML to Markdown conversion directly

describe('complex document conversion', () => {
  // Test for complex combinations using HTML input directly
  // This tests the conversion pipeline more comprehensively
  it('should handle documents with mixed formatting', async () => {
    const { htmlToMd } = await import('../main.js');

    // Complex HTML that would come from a Word document with mixed formatting
    const complexHtml = `
      <div>
        <h1>Document Title</h1>
        <p>This paragraph has <strong>bold text</strong>, <em>italic text</em>, and <u>underlined text</u>.</p>
        <p>It also has <del>strikethrough text</del> and normal text.</p>
        
        <h2>List Examples</h2>
        <ul>
          <li>First item with <strong>bold</strong> content</li>
          <li>Second item with <em>italic</em> content
            <ul>
              <li>Nested item with <a href="https://example.com">a link</a></li>
              <li>Another nested item</li>
            </ul>
          </li>
          <li>Third item</li>
        </ul>
        
        <h3>Table with Mixed Content</h3>
        <table>
          <tr>
            <td><strong>Header 1</strong></td>
            <td><strong>Header 2</strong></td>
            <td><strong>Header 3</strong></td>
          </tr>
          <tr>
            <td>Regular text</td>
            <td><em>Italic content</em></td>
            <td><a href="https://example.com">Link text</a></td>
          </tr>
          <tr>
            <td><strong>Bold content</strong></td>
            <td>Mixed <em>italic</em> and <strong>bold</strong></td>
            <td>Plain text</td>
          </tr>
        </table>
        
        <h4>Paragraph with Line Breaks</h4>
        <p>This is the first line.<br>
        This is the second line after a break.<br>
        This is the third line.</p>
      </div>
    `;

    const result = htmlToMd(complexHtml);

    // Verify key elements are preserved
    expect(result).toContain('# Document Title');
    expect(result).toContain('**bold text**');
    expect(result).toContain('_italic text_');
    expect(result).toContain('~~strikethrough text~~');
    expect(result).toContain('## List Examples');
    expect(result).toContain('### Table with Mixed Content');
    expect(result).toContain('| **Header 1** | **Header 2** | **Header 3** |');
    expect(result).toContain('[Link text](https://example.com)');
    expect(result).toContain('- First item with **bold** content');
    expect(result).toContain(
      '  - Nested item with [a link](https://example.com)',
    );
  });

  it('should handle complex table structures', async () => {
    const { htmlToMd } = await import('../main.js');

    const tableHtml = `
      <table>
        <tr>
          <td>Name</td>
          <td>Age</td>
          <td>City</td>
          <td>Notes</td>
        </tr>
        <tr>
          <td><strong>John Doe</strong></td>
          <td>30</td>
          <td>New York</td>
          <td>Has <em>special</em> requirements</td>
        </tr>
        <tr>
          <td><strong>Jane Smith</strong></td>
          <td>25</td>
          <td>Los Angeles</td>
          <td>Prefers <a href="mailto:jane@example.com">email contact</a></td>
        </tr>
        <tr>
          <td><strong>Bob Johnson</strong></td>
          <td>35</td>
          <td>Chicago</td>
          <td>N/A</td>
        </tr>
      </table>
    `;

    const result = htmlToMd(tableHtml);

    // Verify table structure - the first row gets converted to headers automatically
    expect(result).toContain('| Name | Age | City | Notes |');
    expect(result).toContain('| --- | --- | --- | --- |');
    expect(result).toContain(
      '| **John Doe** | 30  | New York | Has _special_ requirements |',
    );
    expect(result).toContain(
      '| **Jane Smith** | 25  | Los Angeles | Prefers [email contact](mailto:jane@example.com) |',
    );
    expect(result).toContain('| **Bob Johnson** | 35  | Chicago | N/A |');
  });

  it('should handle nested lists with mixed content', async () => {
    const { htmlToMd } = await import('../main.js');

    const nestedListHtml = `
      <ol>
        <li>First numbered item</li>
        <li>Second numbered item with <strong>bold text</strong>
          <ul>
            <li>Nested bullet point</li>
            <li>Another nested point with <em>emphasis</em></li>
            <li>Third nested point with <a href="https://example.com">a link</a>
              <ol>
                <li>Deep nested numbered item</li>
                <li>Another deep item with <strong>bold</strong> and <em>italic</em></li>
              </ol>
            </li>
          </ul>
        </li>
        <li>Third numbered item</li>
      </ol>
    `;

    const result = htmlToMd(nestedListHtml);

    // Verify nested structure (the conversion preserves some numbered lists)
    expect(result).toContain('First numbered item');
    expect(result).toContain('Second numbered item with **bold text**');
    expect(result).toContain('- Nested bullet point');
    expect(result).toContain('- Another nested point with _emphasis_');
    expect(result).toContain(
      '- Third nested point with [a link](https://example.com)',
    );
    expect(result).toContain('Deep nested numbered item');
    expect(result).toContain('Another deep item with **bold** and _italic_');
    expect(result).toContain('Third numbered item');
  });

  it('should handle text with various unicode characters', async () => {
    const { htmlToMd } = await import('../main.js');

    const unicodeHtml = `
      <div>
        <p>Unicode characters: © 2023 Company™</p>
        <p>Symbols: ← ↑ → ↓ ★ ☆ ♠ ♣ ♥ ♦</p>
        <p>Math: ∞ ≤ ≥ ≠ ± × ÷ ∑ ∏ ∂ ∫</p>
        <p>Currency: $ € £ ¥ ₹ ₿</p>
        <p>Accented: café naïve résumé</p>
      </div>
    `;

    const result = htmlToMd(unicodeHtml);

    // Verify unicode characters are preserved
    expect(result).toContain('© 2023 Company™');
    expect(result).toContain('← ↑ → ↓ ★ ☆ ♠ ♣ ♥ ♦');
    expect(result).toContain('∞ ≤ ≥ ≠ ± × ÷ ∑ ∏ ∂ ∫');
    expect(result).toContain('$ € £ ¥ ₹ ₿');
    expect(result).toContain('café naïve résumé');
  });

  it('should handle images with alt text and titles', async () => {
    const { htmlToMd } = await import('../main.js');

    const imageHtml = `
      <div>
        <p>Here is an image:</p>
        <img src="image1.jpg" alt="A beautiful landscape" title="Landscape Photo">
        <p>Another image without title:</p>
        <img src="image2.png" alt="Company logo">
        <p>Image without alt text:</p>
        <img src="image3.gif">
      </div>
    `;

    const result = htmlToMd(imageHtml);

    // Verify image markdown syntax
    expect(result).toContain(
      '![A beautiful landscape](image1.jpg "Landscape Photo")',
    );
    expect(result).toContain('![Company logo](image2.png)');
    expect(result).toContain('![](image3.gif)');
  });

  it('should handle blockquotes and code blocks', async () => {
    const { htmlToMd } = await import('../main.js');

    const codeBlockHtml = `
      <div>
        <blockquote>
          <p>This is a quoted text from another source.</p>
          <p>It can span multiple paragraphs.</p>
        </blockquote>
        
        <p>Here is some inline <code>code</code> in a sentence.</p>
        
        <pre><code>function hello() {
    console.log("Hello, World!");
    return true;
}</code></pre>
      </div>
    `;

    const result = htmlToMd(codeBlockHtml);

    // Verify blockquote and code formatting
    expect(result).toContain('> This is a quoted text');
    expect(result).toContain('> It can span multiple paragraphs');
    expect(result).toContain('inline `code` in');
    expect(result).toContain('```\nfunction hello()');
    expect(result).toContain('console.log("Hello, World!");');
    expect(result).toContain('```');
  });

  it('should handle mixed heading levels with content', async () => {
    const { htmlToMd } = await import('../main.js');

    const headingHtml = `
      <div>
        <h1>Main Title</h1>
        <p>Introduction paragraph with <strong>important</strong> information.</p>
        
        <h2>Section 1</h2>
        <p>Content for section 1.</p>
        
        <h3>Subsection 1.1</h3>
        <p>More detailed content.</p>
        
        <h4>Sub-subsection 1.1.1</h4>
        <p>Even more detailed content.</p>
        
        <h5>Deep heading</h5>
        <p>Very specific content.</p>
        
        <h6>Deepest heading</h6>
        <p>Most specific content.</p>
        
        <h2>Section 2</h2>
        <p>Another major section.</p>
      </div>
    `;

    const result = htmlToMd(headingHtml);

    // Verify all heading levels
    expect(result).toContain('# Main Title');
    expect(result).toContain('## Section 1');
    expect(result).toContain('### Subsection 1.1');
    expect(result).toContain('#### Sub-subsection 1.1.1');
    expect(result).toContain('##### Deep heading');
    expect(result).toContain('###### Deepest heading');
    expect(result).toContain('## Section 2');
    expect(result).toContain('**important**');
  });

  it('should handle edge cases with empty elements', async () => {
    const { htmlToMd } = await import('../main.js');

    const edgeCaseHtml = `
      <div>
        <p></p>
        <h1></h1>
        <h2>Valid Heading</h2>
        <p>  </p>
        <ul>
          <li></li>
          <li>Valid item</li>
          <li>   </li>
        </ul>
        <table>
          <tr>
            <td></td>
            <td>Valid cell</td>
          </tr>
        </table>
      </div>
    `;

    const result = htmlToMd(edgeCaseHtml);

    // Verify it handles empty elements gracefully
    expect(result).toContain('## Valid Heading');
    expect(result).toContain('- Valid item');
    expect(result).toContain('Valid cell');
    // Empty elements should not cause crashes
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });
});
