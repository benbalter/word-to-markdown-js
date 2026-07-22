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

  it('preserves footnote reference and body text', async () => {
    const md = await convert('src/__fixtures__/footnote.docx');
    // NOTE: mammoth renders footnotes as a superscript reference link plus a
    // list of note bodies at the end — NOT GFM `[^1]` syntax. We assert the
    // actual behavior so the content is regression-guarded and the limitation
    // is documented; this is why footnotes are not listed in the "what gets
    // converted" table as clean Markdown footnotes.
    expect(md).toContain('Text with a footnote');
    expect(md).toContain('The footnote body text.');
    expect(md).toContain('#footnote-1');
  });
});
