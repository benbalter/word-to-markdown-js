import convert from '../main.js';

// End-to-end (.docx → Markdown) coverage for markup features that can only be
// exercised through real Word files. The fixtures are generated reproducibly by
// scripts/make-fixtures.mjs (minimal OOXML built with JSZip) rather than being
// opaque binaries authored in Word.
describe('docx markup features (end to end)', () => {
  it('converts strikethrough runs to GFM ~~…~~', async () => {
    const md = await convert('src/__fixtures__/strikethrough.docx');
    expect(md).toContain('~~struck text~~');
  });

  it('converts footnotes to GFM [^1] reference and definition', async () => {
    const md = await convert('src/__fixtures__/footnote.docx');
    // Mammoth renders footnotes as a superscript reference link plus a trailing
    // numbered note list; convertFootnotes() rewrites that into GFM/Pandoc
    // footnote syntax. Assert the reference and definition, and that none of
    // Mammoth's raw scaffolding (<sup>, the `↑` backlink, the anchor ids) leaks.
    expect(md).toContain('Text with a footnote[^1].');
    expect(md).toContain('[^1]: The footnote body text.');
    expect(md).not.toContain('<sup>');
    expect(md).not.toContain('↑');
    expect(md).not.toContain('#footnote');
  });

  it('converts a multi-paragraph footnote to one indented GFM definition', async () => {
    const md = await convert('src/__fixtures__/footnote-multiparagraph.docx');
    // The second paragraph is indented four spaces so GFM/Pandoc read it as a
    // continuation of the same footnote, not a new paragraph after it.
    expect(md).toBe(
      [
        'Text with a multi-paragraph footnote[^1].',
        '',
        '[^1]: First paragraph of the note.',
        '',
        '    Second paragraph of the note.',
      ].join('\n'),
    );
  });

  it('keeps a multi-paragraph footnote raw with footnotes: "preserve"', async () => {
    const md = await convert('src/__fixtures__/footnote-multiparagraph.docx', {
      footnotes: 'preserve',
    });
    expect(md).toContain('<sup>');
    expect(md).toContain('#footnote-1');
    expect(md).toContain('First paragraph of the note.');
    expect(md).toContain('Second paragraph of the note.');
    expect(md).not.toContain('[^1]');
  });

  it('converts footnotes when numberedLists: "bullets"', async () => {
    const md = await convert('src/__fixtures__/footnote.docx', {
      numberedLists: 'bullets',
    });
    // Flattening lists used to run first and turn the numbered note list into
    // bullets, so the footnote definitions no longer matched.
    expect(md).toContain('Text with a footnote[^1].');
    expect(md).toContain('[^1]: The footnote body text.');
    expect(md).not.toContain('<sup>');
  });

  it('leaves numbered lines inside code blocks alone with numberedLists: "bullets"', async () => {
    const md = await convert('src/__fixtures__/code-numbered.docx', {
      numberedLists: 'bullets',
    });
    expect(md).toContain('```\n1. install\n2. run\n```');
  });

  it('keeps the raw note list numbered with numberedLists: "bullets" and footnotes: "preserve"', async () => {
    const md = await convert('src/__fixtures__/footnote.docx', {
      numberedLists: 'bullets',
      footnotes: 'preserve',
    });
    // Mammoth's note list isn't a document list, so bullets mode leaves it
    // numbered to match the [1] reference labels.
    expect(md).toContain('1. The footnote body text.');
    expect(md).not.toContain('- The footnote body text.');
  });

  it('preserves raw footnote markup when footnotes: "preserve"', async () => {
    const md = await convert('src/__fixtures__/footnote.docx', {
      footnotes: 'preserve',
    });
    // Opt-out keeps Mammoth's superscript reference link and numbered note list.
    expect(md).toContain('<sup>');
    expect(md).toContain('#footnote-1');
    expect(md).not.toContain('[^1]');
  });

  it('detects a monospace code block and fences it verbatim (issue #207)', async () => {
    const md = await convert('src/__fixtures__/code-block.docx');
    // The fixture is a shaded single-cell table of Normal paragraphs carrying a
    // monospace run font — Word's usual code-block encoding. The converter must
    // merge the lines into one fenced block and, because it becomes <pre><code>,
    // emit the code verbatim with none of Markdown's backslash-escaping.
    expect(md).toContain('```\n// build the greeting -- see docs/README');
    expect(md).toContain('func greet(names: [String]) -> Bool {');
    expect(md).toContain('let ptr: UnsafeMutablePointer<Int> = &flag  // *ptr');
    expect(md).toContain('return names.count > 0');
    expect(md).not.toContain('\\'); // no escaped [] {} <> * - / anywhere
    // The single-cell code table is unwrapped, not rendered as a Markdown table.
    expect(md).not.toContain('| ---');
  });

  it('keeps monospace headings and list items structural, not code', async () => {
    const md = await convert('src/__fixtures__/code-heading-list.docx');
    // Only the plain monospace paragraph becomes a fenced block; the heading
    // and the numbered item keep their Markdown structure.
    expect(md).toContain('# API reference');
    expect(md).toContain('1. npm install');
    expect(md).toContain('```\nconst x = 1;\n```');
    expect((md.match(/```/g) ?? []).length).toBe(2);
  });

  it('keeps a paragraph that only partly uses a monospace font as prose', async () => {
    const md = await convert('src/__fixtures__/code-block.docx');
    // The closing paragraph mixes an inline monospace run into normal prose;
    // requiring *every* run to be monospace keeps it out of a code block.
    expect(md).toContain('Call greet(names) to say hello.');
    const fenceCount = (md.match(/```/g) ?? []).length;
    expect(fenceCount).toBe(2); // exactly one fenced block, not two
  });
});
