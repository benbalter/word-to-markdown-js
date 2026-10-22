import JSZip from 'jszip';
import convert, {
  extractDocumentProperties,
  htmlToMd,
  processHtml,
} from '../main.js';

// End-to-end (.docx → Markdown) coverage for Word structures that used to come
// out broken: blocks inside table cells, nested bullet glyphs, table-of-contents
// links, and leading empty table rows. Each document is minimal OOXML built
// here with JSZip, so the Word markup under test sits next to its assertions.
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>
</w:styles>`;

// numId 1: bullets (two levels); numId 2: decimal.
const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="${W}">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl>
    <w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/><w:lvlText w:val="◦"/></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

async function docx(body: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="${REL}/numbering" Target="numbering.xml"/>
</Relationships>`,
  );
  zip.file('word/styles.xml', styles);
  zip.file('word/numbering.xml', numbering);
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'arraybuffer' });
}

const run = (text: string) =>
  `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
const p = (text: string, style?: string) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${run(text)}</w:p>`;
const item = (text: string, numId = 1, level = 0) =>
  `<w:p><w:pPr><w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>${run(text)}</w:p>`;
const cell = (...paragraphs: string[]) =>
  `<w:tc>${paragraphs.join('') || '<w:p/>'}</w:tc>`;
const row = (...cells: string[]) => `<w:tr>${cells.join('')}</w:tr>`;
const table = (...rows: string[]) => `<w:tbl>${rows.join('')}</w:tbl>`;

describe('Word structures (end to end)', () => {
  it('keeps a table with a heading and lists in its cells as a GFM table', async () => {
    const md = await convert(
      await docx(
        table(
          row(cell(p('Area')), cell(p('Open items'))),
          row(
            cell(p('Payments', 'Heading2')),
            cell(
              item('Bank fallback'),
              item('Retry on timeout'),
              item('First', 2),
              item('Second', 2),
            ),
          ),
        ),
      ),
    );
    expect(md).not.toContain('joplin-table-wrapper');
    expect(md).not.toContain('<table');
    expect(md).toContain('| **Payments** |');
    expect(md).toContain(
      '• Bank fallback<br>• Retry on timeout<br>1\\. First<br>2\\. Second',
    );
  });

  it('continues a Word list after a paragraph interrupts it', async () => {
    // Word continues numId 2 across the paragraph (3., 4.). Mammoth emits a
    // second <ol>, which gets Word's number as its start (src/numbering.ts).
    const markdown = await convert(
      await docx(
        `${item('one', 2)}${item('two', 2)}${p('Between')}${item('three', 2)}${item('four', 2)}`,
      ),
    );
    expect(markdown).toBe('1. one\n2. two\n\nBetween\n\n3. three\n4. four');
  });

  it('strips typed bullet glyphs from nested list items too', async () => {
    const md = await convert(
      await docx(item('• Outer') + item('◦ Inner', 1, 1) + item('• Next')),
    );
    expect(md).not.toMatch(/[•◦]/);
    expect(md).toMatch(/^- Outer\n\s+- Inner\n- Next$/);
  });

  it('points table-of-contents links at the heading slugs', async () => {
    const bookmark = (name: string, id: number) =>
      `<w:bookmarkStart w:id="${id}" w:name="${name}"/><w:bookmarkEnd w:id="${id}"/>`;
    const link = (anchor: string, text: string) =>
      `<w:hyperlink w:anchor="${anchor}">${run(text)}</w:hyperlink>`;
    const heading = (name: string, id: number, text: string, style: string) =>
      `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${bookmark(name, id)}${run(text)}</w:p>`;
    const md = await convert(
      await docx(
        `<w:p>${link('_Toc1', 'Getting started')}</w:p>` +
          `<w:p>${link('_Toc2', 'Getting started again')}</w:p>` +
          `<w:p>${link('_Ref3', 'the note')}</w:p>` +
          heading('_Toc1', 1, 'Getting Started', 'Heading1') +
          `<w:p>${bookmark('_Ref3', 3)}${run('A note.')}</w:p>` +
          heading('_Toc2', 2, 'Getting Started', 'Heading2'),
      ),
    );
    expect(md).toContain('[Getting started](#getting-started)');
    // A repeated heading gets GitHub's `-1` suffix.
    expect(md).toContain('[Getting started again](#getting-started-1)');
    // A bookmark that isn't on a heading has no Markdown anchor to link to.
    expect(md).toContain('the note');
    expect(md).not.toContain('_Ref3');
    expect(md).not.toContain('_Toc');
  });

  it('skips every leading empty row before promoting the header', async () => {
    const md = await convert(
      await docx(
        table(
          row(cell(), cell()),
          row(cell(), cell()),
          row(cell(p('Name')), cell(p('Role'))),
          row(cell(p('Ada')), cell(p('Engineer'))),
        ),
      ),
    );
    expect(md.split('\n')[0]).toMatch(/^\| Name +\| Role +\|$/);
    expect(md).toContain('| Ada  | Engineer |');
  });

  it('unwraps a code box whose cell also holds an empty nested table', async () => {
    const code = (text: string) =>
      `<w:p><w:r><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
    const md = await convert(
      await docx(
        table(
          row(cell(code('x = 1'), table(row(cell()), row(cell())), '<w:p/>')),
        ),
      ),
    );
    expect(md).toBe('```\nx = 1\n```');
  });
});

describe('line breaks in table cells', () => {
  it('joins a cell’s lines with a bare <br>, without hard-break spaces', () => {
    const md = htmlToMd(
      processHtml(
        '<table><tr><td>Name</td><td>Notes</td></tr><tr><td>Ada</td><td>one<br>two</td></tr></table>',
      ),
    );
    expect(md).toContain('| one<br>two |');
  });

  it('keeps a hard break in a one-cell table, which renders as plain text', () => {
    const md = htmlToMd(
      processHtml('<table><tr><td><p>one<br>two</p></td></tr></table>'),
    );
    expect(md).toBe('one  \ntwo');
  });
});

describe('confidentiality in custom properties', () => {
  async function withCustomXml(properties: string) {
    const zip = new JSZip();
    zip.file(
      'docProps/custom.xml',
      `<?xml version="1.0"?><Properties>${properties}</Properties>`,
    );
    return extractDocumentProperties(
      await zip.generateAsync({ type: 'arraybuffer' }),
    );
  }

  it('ignores "confidential" in a free-text property value', async () => {
    const properties = await withCustomXml(
      '<property name="Notes"><vt:lpwstr>not confidential</vt:lpwstr></property>',
    );
    expect(properties.confidentiality).toBeUndefined();
  });

  it('flags a property named for confidentiality', async () => {
    const properties = await withCustomXml(
      '<property name="IsConfidential"><vt:bool>true</vt:bool></property>',
    );
    expect(properties.confidentiality).toBe('detected in custom properties');
  });

  it('flags a classification property whose value is confidential', async () => {
    const properties = await withCustomXml(
      '<property name="Classification"><vt:lpwstr>Company Confidential</vt:lpwstr></property>',
    );
    expect(properties.confidentiality).toBe('detected in custom properties');
  });
});
