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
});
