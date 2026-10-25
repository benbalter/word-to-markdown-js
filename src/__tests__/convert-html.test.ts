import { convertHtml, htmlToMd } from '../main.js';

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

  it('keeps a table whose cell holds a nested table, flattening the nested one', async () => {
    // A nested table used to make the GFM plugin drop the outer table's grid
    // and print its cells as paragraphs, with only the nested table left.
    const md = await convertHtml(
      '<table><tr><td><p>Name</p></td><td><p>Details</p></td></tr><tr><td><p>Alpha</p></td><td><table><tr><td>k</td><td>v</td></tr><tr><td>a</td><td>1</td></tr></table></td></tr></table>',
    );
    expect(md).toBe(
      '| Name  | Details        |\n| ----- | -------------- |\n| Alpha | k · v<br>a · 1 |',
    );
  });

  it("keeps a nested table's caption and a deeper table's row breaks", async () => {
    const md = await convertHtml(
      '<table><tr><td>Name</td><td>Details</td></tr><tr><td>Alpha</td><td><table><caption>Limits</caption><tr><td><table><tr><td>x</td></tr><tr><td>y</td></tr></table></td><td>z</td></tr></table></td></tr></table>',
    );
    expect(md).toContain('| Alpha | Limits<br>x<br>y · z |');
  });

  it('flattens a nested table inside a wrapper element in a cell', async () => {
    // Pasted HTML can wrap the nested table (here in a <figure>); the wrapper
    // must not carry the table past the flattening to the GFM plugin.
    const md = await convertHtml(
      '<table><tr><td><p>Name</p></td><td><p>Details</p></td></tr><tr><td><p>Alpha</p></td><td><figure><table><tr><td>k</td><td>v</td></tr></table></figure></td></tr></table>',
    );
    expect(md).toBe(
      '| Name  | Details |\n| ----- | ------- |\n| Alpha | k · v   |',
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

  it('keeps a table with a code block in a cell as a GFM table', async () => {
    // A <pre> in a cell used to make the GFM plugin emit the whole table as
    // HTML in a Joplin wrapper div.
    const md = await convertHtml(
      '<table><tr><td><p>Cmd</p></td><td><p>Notes</p></td></tr>' +
        '<tr><td><pre><code>npm i</code></pre></td><td><p>Install</p></td></tr>' +
        '<tr><td><pre><code>a | b\nif (x &lt; 1) {\n\n}</code></pre></td><td>x</td></tr></table>',
    );
    expect(md).not.toContain('joplin-table-wrapper');
    expect(md).not.toContain('<table');
    expect(md).toBe(
      [
        '| Cmd                               | Notes   |',
        '| --------------------------------- | ------- |',
        '| `npm i`                           | Install |',
        '| `a \\| b`<br>`if (x < 1) {`<br>`}` | x       |',
      ].join('\n'),
    );
  });

  it('reads <br> in a code block in a cell as a line break', async () => {
    const md = await convertHtml(
      '<table><tr><td>Cmd</td><td>Notes</td></tr><tr><td><pre>foo<br>bar</pre></td><td>x</td></tr></table>',
    );
    expect(md).toBe(
      [
        '| Cmd            | Notes |',
        '| -------------- | ----- |',
        '| `foo`<br>`bar` | x     |',
      ].join('\n'),
    );
  });

  it("never emits Joplin's table wrapper div, even for a table kept as HTML", () => {
    // htmlToMd skips processHtml, so a list in a cell still falls back to HTML.
    const md = htmlToMd(
      '<table><tr><td>a</td><td>b</td></tr><tr><td><ul><li>x</li></ul></td><td>1</td></tr></table>',
    );
    expect(md).toContain('<table>');
    expect(md).not.toContain('joplin-table-wrapper');
  });
});
