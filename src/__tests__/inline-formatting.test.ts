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
  it('converts numbered lists to bullets by default', async () => {
    const md = await convert('src/__fixtures__/ol.docx');
    expect(md).toContain('- One');
    expect(md).not.toMatch(/^\s*1\.\s/m);
  });

  it("keeps numbering with { numberedLists: 'ordered' }", async () => {
    const md = await convert('src/__fixtures__/ol.docx', {
      numberedLists: 'ordered',
    });
    expect(md).toContain('1. One');
    expect(md).toContain('2. Two');
    expect(md).toContain('3. Three');
  });

  it('preserves numbering in nested ordered lists when requested', async () => {
    const md = await convert('src/__fixtures__/nested-ol.docx', {
      numberedLists: 'ordered',
    });
    expect(md).toContain('1. One');
    expect(md).toMatch(/^\s+1\. Sub one/m);
  });
});
