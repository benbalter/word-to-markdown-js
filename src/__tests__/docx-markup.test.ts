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

  it('leaves a multi-paragraph footnote in raw form rather than dangling', async () => {
    const md = await convert('src/__fixtures__/footnote-multiparagraph.docx');
    // Mammoth puts the second paragraph on an indented continuation line, so the
    // single-line definition regex can't fold it into a `[^1]:` block. The
    // reference must then stay raw too — converting it alone would leave a
    // dangling `[^1]` with no definition. Both paragraphs and the link survive.
    expect(md).toContain('<sup>');
    expect(md).toContain('#footnote-1');
    expect(md).toContain('First paragraph of the note.');
    expect(md).toContain('Second paragraph of the note.');
    expect(md).not.toContain('[^1]');
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

  it('keeps a paragraph that only partly uses a monospace font as prose', async () => {
    const md = await convert('src/__fixtures__/code-block.docx');
    // The closing paragraph mixes an inline monospace run into normal prose;
    // requiring *every* run to be monospace keeps it out of a code block.
    expect(md).toContain('Call greet(names) to say hello.');
    const fenceCount = (md.match(/```/g) ?? []).length;
    expect(fenceCount).toBe(2); // exactly one fenced block, not two
  });
});
