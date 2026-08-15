import convert from '../main.js';

// End-to-end (.docx → Markdown) coverage for inline run formatting and the
// numbered-list option. The fixtures are generated reproducibly by
// scripts/make-fixtures.mjs. These lock in behavior the README previously
// described inaccurately: superscript/subscript are preserved, underline is
// opt-in, and numbered lists can be kept ordered.
describe('inline run formatting (end to end)', () => {
  it('preserves superscript as inline <sup> by default', async () => {
    const md = await convert('src/__fixtures__/superscript.docx');
    expect(md).toContain('E = mc<sup>2</sup>');
  });

  it('preserves subscript as inline <sub> by default', async () => {
    const md = await convert('src/__fixtures__/subscript.docx');
    expect(md).toContain('H<sub>2</sub>O');
  });

  it('drops underline by default (matching Mammoth)', async () => {
    const md = await convert('src/__fixtures__/underline.docx');
    expect(md).toContain('underlined word');
    expect(md).not.toContain('<u>');
  });

  it("keeps underline as inline <u> with { underline: 'preserve' }", async () => {
    const md = await convert('src/__fixtures__/underline.docx', {
      underline: 'preserve',
    });
    expect(md).toContain('<u>underlined</u> word');
  });

  it('does not affect superscript when preserving underline', async () => {
    const md = await convert('src/__fixtures__/superscript.docx', {
      underline: 'preserve',
    });
    expect(md).toContain('E = mc<sup>2</sup>');
  });
});

describe('numbered lists (end to end)', () => {
  it('keeps numbered lists numbered by default', async () => {
    const md = await convert('src/__fixtures__/ol.docx');
    expect(md).toContain('1. One');
    expect(md).toContain('2. Two');
    expect(md).toContain('3. Three');
  });

  it("converts numbered lists to bullets with { numberedLists: 'bullets' }", async () => {
    const md = await convert('src/__fixtures__/ol.docx', {
      numberedLists: 'bullets',
    });
    expect(md).toContain('- One');
    expect(md).not.toMatch(/^\s*1\.\s/m);
  });

  it('preserves numbering in nested ordered lists by default', async () => {
    const md = await convert('src/__fixtures__/nested-ol.docx');
    expect(md).toContain('1. One');
    expect(md).toMatch(/^\s+1\. Sub one/m);
  });
});

describe('dashes (end to end)', () => {
  // Regression test for issue #194: em/en dashes are meaningful punctuation and
  // must not be flattened to ASCII hyphens by the normalization pass.
  it('preserves em and en dashes', async () => {
    const md = await convert('src/__fixtures__/dashes.docx');
    expect(md).toContain('An em dash — and an en dash – in a sentence.');
  });
});
