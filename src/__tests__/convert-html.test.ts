import { convertHtml } from '../main.js';

// convertHtml takes rich text pasted onto word2md.com: HTML copied from Word,
// Google Docs, or a web page. It skips mammoth but gets the same cleanup.

describe('convertHtml', () => {
  it('converts headings, inline formatting, and tables', async () => {
    const md = await convertHtml(
      '<h1>Title</h1><p>Hello <b>bold</b> and <i>italic</i></p><table><tr><td>a</td><td>b</td></tr><tr><td>1</td><td>2</td></tr></table>',
    );
    expect(md).toBe(
      '# Title\n\nHello **bold** and _italic_\n\n| a   | b   |\n| --- | --- |\n| 1   | 2   |',
    );
  });

  it("drops Word's clipboard noise: head elements, styles, XML islands, <o:p>", async () => {
    const md = await convertHtml(
      '<html><head><meta charset=utf-8><title>Doc title</title><style>p.MsoNormal{margin:0}</style><xml><o:DocumentProperties>props</o:DocumentProperties></xml></head><body><!--StartFragment--><p class=MsoNormal>Body text<o:p></o:p></p><!--EndFragment--></body></html>',
    );
    expect(md).toBe('Body text');
  });

  it("doesn't bold a whole Google Docs selection", async () => {
    const md = await convertHtml(
      '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-abc"><p>Not bold</p></b>',
    );
    expect(md).toBe('Not bold');
  });

  it('keeps a Google Docs selection copied in Chrome, which adds its own <meta>', async () => {
    // Chrome prefixes the clipboard HTML with a <meta charset>, ahead of the
    // one Google Docs writes. Removing both left domino's cached child index
    // stale, and unwrapping the docs-internal-guid <b> then dropped all of it.
    const md = await convertHtml(
      `<meta charset='utf-8'><meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-abc"><h1 dir="ltr"><span>Title</span></h1><ul><li dir="ltr"><p dir="ltr" role="presentation"><span>one</span></p></li></ul><p dir="ltr"><span>Body</span></p></b>`,
    );
    expect(md).toBe('# Title\n\n- one\n\nBody');
  });

  it('keeps a list tight when each item wraps its text in a <p>', async () => {
    const md = await convertHtml(
      '<ul><li><p>one</p></li><li><p>two</p></li></ul>',
    );
    expect(md).toBe('- one\n- two');
  });

  it('normalizes smart quotes, as .docx conversion does', async () => {
    expect(await convertHtml('<p>“quoted” it’s</p>')).toBe(`"quoted" it's`);
  });

  it('unwraps links with unsafe schemes', async () => {
    const md = await convertHtml(
      '<p><a href="javascript:alert(1)">bad</a> <a href="https://example.com">good</a></p>',
    );
    expect(md).toBe('bad [good](https://example.com)');
  });

  it('strips images on request', async () => {
    const html = '<p>Text <img src="data:image/png;base64,AAAA" alt="x"></p>';
    expect(await convertHtml(html)).toContain('data:image/png');
    expect(await convertHtml(html, { images: 'strip' })).toBe('Text');
  });
});
