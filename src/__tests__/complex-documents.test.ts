/**
 * Complex document conversion tests
 *
 * This test file focuses on testing complex document structures and scenarios
 * that would be found in real-world Word documents. It tests the HTML-to-Markdown
 * conversion pipeline directly with complex HTML structures to ensure proper
 * handling of mixed formatting, nested elements, and edge cases.
 */

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

/**
 * M365 Professional Document Tests
 *
 * These tests focus on complex document structures commonly found in
 * Microsoft 365 professional documents, including emoji, complex formatting,
 * and various edge cases that arise from M365's rich content creation features.
 */
describe('M365 professional document features', () => {
  it('should handle emoji characters in text', async () => {
    const { htmlToMd } = await import('../main.js');

    const htmlWithEmoji = `
      <div>
        <h1>Project Status Update 🚀</h1>
        <p>Great news! 🎉 The team has made excellent progress this week. 💪</p>
        <p>Key highlights:</p>
        <ul>
          <li>✅ Completed milestone 1</li>
          <li>✅ All tests passing</li>
          <li>⏳ Milestone 2 in progress</li>
          <li>📅 On track for deadline</li>
        </ul>
        <p>Team performance: ⭐⭐⭐⭐⭐</p>
        <p>Next steps: 👉 Continue development</p>
      </div>
    `;

    const result = htmlToMd(htmlWithEmoji);

    // Verify emoji are preserved in output
    expect(result).toContain('# Project Status Update 🚀');
    expect(result).toContain('Great news! 🎉');
    expect(result).toContain('💪');
    expect(result).toContain('- ✅ Completed milestone 1');
    expect(result).toContain('- ⏳ Milestone 2 in progress');
    expect(result).toContain('- 📅 On track for deadline');
    expect(result).toContain('⭐⭐⭐⭐⭐');
    expect(result).toContain('👉');
  });

  it('should handle emoji with surrounding formatting', async () => {
    const { htmlToMd } = await import('../main.js');

    const htmlWithFormattedEmoji = `
      <div>
        <p><strong>Important 🔔:</strong> Please review this document.</p>
        <p><em>Note 📝:</em> This is a draft version.</p>
        <p>Status: <strong><em>🟢 Active</em></strong></p>
        <p>Priority: <strong>🔴 High</strong></p>
      </div>
    `;

    const result = htmlToMd(htmlWithFormattedEmoji);

    expect(result).toContain('**Important 🔔:**');
    expect(result).toContain('_Note 📝:_');
    expect(result).toContain('**_🟢 Active_**');
    expect(result).toContain('**🔴 High**');
  });

  it('should handle diverse emoji categories', async () => {
    const { htmlToMd } = await import('../main.js');

    const htmlWithDiverseEmoji = `
      <div>
        <h2>Emoji Diversity Test</h2>
        <p>Faces: 😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇</p>
        <p>Gestures: 👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👋 🤚 ✋ 🖐️ 👏 🙌</p>
        <p>Animals: 🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷</p>
        <p>Nature: 🌸 🌺 🌻 🌷 🌱 🌲 🌳 🌴 🌵 🍀 🍁 🍂 🍃</p>
        <p>Food: 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥝</p>
        <p>Objects: 💼 📁 📂 📅 📆 📇 📈 📉 📊 📋 📌 📍 🔖</p>
        <p>Symbols: ✅ ❌ ⚠️ ℹ️ ❓ ❗ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪</p>
        <p>Flags: 🏁 🚩 🎌 🏴 🏳️ 🏳️‍🌈 🏳️‍⚧️</p>
      </div>
    `;

    const result = htmlToMd(htmlWithDiverseEmoji);

    // Verify various emoji categories are preserved
    expect(result).toContain('😀 😃 😄');
    expect(result).toContain('👍 👎 👌');
    expect(result).toContain('🐶 🐱 🐭');
    expect(result).toContain('🌸 🌺 🌻');
    expect(result).toContain('🍎 🍐 🍊');
    expect(result).toContain('💼 📁 📂');
    expect(result).toContain('✅ ❌ ⚠️');
    expect(result).toContain('🏁 🚩 🎌');
  });

  it('should handle emoji in tables', async () => {
    const { htmlToMd } = await import('../main.js');

    const htmlWithEmojiTable = `
      <table>
        <tr>
          <td>Task</td>
          <td>Status</td>
          <td>Priority</td>
        </tr>
        <tr>
          <td>Design Review</td>
          <td>✅ Complete</td>
          <td>🔴 High</td>
        </tr>
        <tr>
          <td>Development</td>
          <td>⏳ In Progress</td>
          <td>🟡 Medium</td>
        </tr>
        <tr>
          <td>Testing</td>
          <td>📅 Scheduled</td>
          <td>🟢 Low</td>
        </tr>
      </table>
    `;

    const result = htmlToMd(htmlWithEmojiTable);

    expect(result).toContain('| Task | Status | Priority |');
    expect(result).toContain('| Design Review | ✅ Complete | 🔴 High |');
    expect(result).toContain('| Development | ⏳ In Progress | 🟡 Medium |');
    expect(result).toContain('| Testing | 📅 Scheduled | 🟢 Low |');
  });

  it('should handle emoji in links', async () => {
    const { htmlToMd } = await import('../main.js');

    const htmlWithEmojiLinks = `
      <div>
        <p><a href="https://example.com/docs">📚 Documentation</a></p>
        <p><a href="https://example.com/help">❓ Help Center</a></p>
        <p><a href="https://example.com/feedback">💬 Send Feedback</a></p>
        <p>Check out our <a href="https://example.com/new">✨ New Features</a> page!</p>
      </div>
    `;

    const result = htmlToMd(htmlWithEmojiLinks);

    expect(result).toContain('[📚 Documentation](https://example.com/docs)');
    expect(result).toContain('[❓ Help Center](https://example.com/help)');
    expect(result).toContain(
      '[💬 Send Feedback](https://example.com/feedback)',
    );
    expect(result).toContain('[✨ New Features](https://example.com/new)');
  });

  it('should handle complex M365 document structure', async () => {
    const { htmlToMd } = await import('../main.js');

    // Simulating a typical M365 professional document structure
    const complexM365Html = `
      <div>
        <h1>Quarterly Business Review 📊</h1>
        <p><strong>Date:</strong> Q4 2024</p>
        <p><strong>Status:</strong> 🟢 On Track</p>
        
        <h2>Executive Summary 📋</h2>
        <p>This quarter has shown <strong>exceptional growth</strong> across all key metrics. 🎯</p>
        
        <h2>Key Metrics 📈</h2>
        <table>
          <tr>
            <td><strong>Metric</strong></td>
            <td><strong>Target</strong></td>
            <td><strong>Actual</strong></td>
            <td><strong>Status</strong></td>
          </tr>
          <tr>
            <td>Revenue</td>
            <td>$1M</td>
            <td>$1.2M</td>
            <td>✅ Exceeded</td>
          </tr>
          <tr>
            <td>Customer Satisfaction</td>
            <td>90%</td>
            <td>95%</td>
            <td>✅ Exceeded</td>
          </tr>
          <tr>
            <td>New Customers</td>
            <td>100</td>
            <td>85</td>
            <td>⚠️ Below Target</td>
          </tr>
        </table>
        
        <h2>Action Items 📝</h2>
        <ol>
          <li><strong>Marketing Initiative</strong> - Increase lead generation 🎯</li>
          <li><strong>Product Enhancement</strong> - Launch new features ✨</li>
          <li><strong>Team Training</strong> - Upskill team members 📚</li>
        </ol>
        
        <h2>Risks & Mitigation 🚨</h2>
        <ul>
          <li>⚠️ <strong>Supply chain delays</strong> - Mitigation: Diversify suppliers</li>
          <li>⚠️ <strong>Market competition</strong> - Mitigation: Accelerate innovation</li>
        </ul>
        
        <h2>Next Steps 👉</h2>
        <p>The team will focus on the following priorities:</p>
        <ol>
          <li>🔵 Complete Q4 deliverables</li>
          <li>🔵 Plan Q1 initiatives</li>
          <li>🔵 Review budget allocation</li>
        </ol>
        
        <p><em>For questions, contact: <a href="mailto:team@example.com">team@example.com</a> 📧</em></p>
      </div>
    `;

    const result = htmlToMd(complexM365Html);

    // Verify document structure
    expect(result).toContain('# Quarterly Business Review 📊');
    expect(result).toContain('## Executive Summary 📋');
    expect(result).toContain('## Key Metrics 📈');
    expect(result).toContain('## Action Items 📝');
    expect(result).toContain('## Risks & Mitigation 🚨');
    expect(result).toContain('## Next Steps 👉');

    // Verify formatting and emoji are preserved
    expect(result).toContain('**Date:**');
    expect(result).toContain('🟢 On Track');
    expect(result).toContain(
      '| **Metric** | **Target** | **Actual** | **Status** |',
    );
    expect(result).toContain('✅ Exceeded');
    expect(result).toContain('⚠️ Below Target');

    // Verify links with emoji
    expect(result).toContain('[team@example.com](mailto:team@example.com)');
    expect(result).toContain('📧');
  });

  it('should handle complex nested formatting with emoji', async () => {
    const { htmlToMd } = await import('../main.js');

    const nestedFormattingHtml = `
      <div>
        <p><strong><em>🚀 Important Update!</em></strong></p>
        <p>Please note: <del>❌ Old deadline</del> → <strong>✅ New deadline</strong></p>
        <blockquote>
          <p><strong>💡 Pro Tip:</strong> Always review before submitting! 📋</p>
        </blockquote>
        <p>Code example: <code>console.log("Hello 👋")</code></p>
      </div>
    `;

    const result = htmlToMd(nestedFormattingHtml);

    expect(result).toContain('**_🚀 Important Update!_**');
    expect(result).toContain('~~❌ Old deadline~~');
    expect(result).toContain('**✅ New deadline**');
    expect(result).toContain('> **💡 Pro Tip:**');
    expect(result).toContain('`console.log("Hello 👋")`');
  });

  it('should handle multi-byte emoji sequences (ZWJ sequences)', async () => {
    const { htmlToMd } = await import('../main.js');

    // ZWJ (Zero Width Joiner) sequences create complex emoji
    const zwjEmojiHtml = `
      <div>
        <p>Family emoji: 👨‍👩‍👧‍👦</p>
        <p>Profession emoji: 👩‍💻 👨‍🔬 👩‍🎨 👨‍✈️</p>
        <p>Skin tone variations: 👍🏻 👍🏼 👍🏽 👍🏾 👍🏿</p>
        <p>Flag sequences: 🇺🇸 🇬🇧 🇯🇵 🇩🇪 🇫🇷</p>
      </div>
    `;

    const result = htmlToMd(zwjEmojiHtml);

    expect(result).toContain('👨‍👩‍👧‍👦');
    expect(result).toContain('👩‍💻');
    expect(result).toContain('👨‍🔬');
    expect(result).toContain('👍🏻 👍🏼 👍🏽 👍🏾 👍🏿');
    expect(result).toContain('🇺🇸 🇬🇧 🇯🇵 🇩🇪 🇫🇷');
  });

  it('should handle mixed content with special M365 features', async () => {
    const { htmlToMd } = await import('../main.js');

    // M365 often generates specific HTML patterns
    const m365SpecificHtml = `
      <div>
        <h1>Meeting Notes 📝</h1>
        
        <p><strong>Attendees:</strong> @John, @Sarah, @Mike 👥</p>
        
        <h2>Discussion Points 💬</h2>
        <p>We discussed the following topics:</p>
        
        <h3>1. Budget Review 💰</h3>
        <p>Current spending is <strong>within budget</strong>. ✅</p>
        
        <h3>2. Timeline Update ⏰</h3>
        <p>Project is <em>slightly behind schedule</em>. ⚠️</p>
        <ul>
          <li>Phase 1: ✅ Complete</li>
          <li>Phase 2: 🔄 In Progress (70%)</li>
          <li>Phase 3: 📅 Starting next week</li>
        </ul>
        
        <h3>3. Resource Allocation 👥</h3>
        <table>
          <tr>
            <td>Team Member</td>
            <td>Role</td>
            <td>Availability</td>
          </tr>
          <tr>
            <td>John 👨‍💼</td>
            <td>Lead</td>
            <td>🟢 Full-time</td>
          </tr>
          <tr>
            <td>Sarah 👩‍💻</td>
            <td>Developer</td>
            <td>🟡 Part-time</td>
          </tr>
        </table>
        
        <h2>Action Items ✍️</h2>
        <ul>
          <li>[ ] John: Review budget proposal 📊</li>
          <li>[ ] Sarah: Complete code review 💻</li>
          <li>[x] Mike: Submit report ✅</li>
        </ul>
        
        <p><strong>Next Meeting:</strong> 📅 Friday at 2 PM</p>
      </div>
    `;

    const result = htmlToMd(m365SpecificHtml);

    // Verify overall structure
    expect(result).toContain('# Meeting Notes 📝');
    expect(result).toContain('## Discussion Points 💬');
    // Note: periods after numbers get escaped by markdown linting to prevent ordered list interpretation
    expect(result).toContain('### 1\\. Budget Review 💰');
    expect(result).toContain('### 2\\. Timeline Update ⏰');
    expect(result).toContain('### 3\\. Resource Allocation 👥');
    expect(result).toContain('## Action Items ✍️');

    // Verify formatting combinations
    expect(result).toContain('**Attendees:**');
    expect(result).toContain('_slightly behind schedule_');
    expect(result).toContain('- Phase 1: ✅ Complete');
    expect(result).toContain('- Phase 2: 🔄 In Progress (70%)');

    // Verify table with emoji
    expect(result).toContain('| John 👨‍💼 | Lead | 🟢 Full-time |');
    expect(result).toContain('| Sarah 👩‍💻 | Developer | 🟡 Part-time |');
  });

  it('should handle whitespace around emoji correctly', async () => {
    const { htmlToMd } = await import('../main.js');

    const whitespaceEmojiHtml = `
      <div>
        <p>No space before emoji:word🎉</p>
        <p>No space after emoji:🎉word</p>
        <p>Emoji at start:🎉 Word after</p>
        <p>Emoji at end: Word before 🎉</p>
        <p>Multiple emoji together: 🎉🎊🎁</p>
        <p>Emoji between words: Hello 👋 World</p>
      </div>
    `;

    const result = htmlToMd(whitespaceEmojiHtml);

    expect(result).toContain('word🎉');
    expect(result).toContain('🎉word');
    expect(result).toContain('🎉 Word after');
    expect(result).toContain('Word before 🎉');
    expect(result).toContain('🎉🎊🎁');
    expect(result).toContain('Hello 👋 World');
  });

  it('should handle emoji with special characters', async () => {
    const { htmlToMd } = await import('../main.js');

    const emojiWithSpecialCharsHtml = `
      <div>
        <p>Emoji with quotes: "🎉" and '🎊'</p>
        <p>Emoji in parentheses: (🎁) [📝] {⭐}</p>
        <p>Emoji with punctuation: Hello! 👋 How are you? 🤔</p>
        <p>Emoji with currency: $100 💵 €50 💶 £30 💷</p>
        <p>Emoji with math: 2 + 2 = 4 ✅</p>
      </div>
    `;

    const result = htmlToMd(emojiWithSpecialCharsHtml);

    expect(result).toContain('"🎉"');
    expect(result).toContain("'🎊'");
    expect(result).toContain('(🎁)');
    // Note: square brackets get escaped by markdown linting to prevent link syntax
    expect(result).toContain('\\[📝\\]');
    expect(result).toContain('Hello! 👋');
    expect(result).toContain('How are you? 🤔');
    expect(result).toContain('💵');
    expect(result).toContain('2 + 2 = 4 ✅');
  });
});
