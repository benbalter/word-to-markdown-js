import JSZip from 'jszip';
import convert, { convertHtml } from '../main.js';
import { labelCompoundNumbering } from '../numbering.js';

// Word's compound ("legal") list numbering, such as `1.` → `1.1`, written out
// as text before Mammoth reads the .docx (src/numbering.ts). Each document is
// minimal OOXML built here, so the numbering under test sits next to its
// assertions; legal-numbering.docx is the reproduction from issue #359.
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const M = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
const REL =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const level = (ilvl: number, text: string, extra = '', format = 'decimal') =>
  `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/><w:numFmt w:val="${format}"/>${extra}<w:lvlText w:val="${text}"/></w:lvl>`;

// numId 1: legal (`%1.`, `%1.%2`); numId 2: an ordinary two-level list.
const NUMBERING = `<w:abstractNum w:abstractNumId="1">${level(0, '%1.')}${level(1, '%1.%2')}</w:abstractNum>
<w:abstractNum w:abstractNumId="2">${level(0, '%1.')}${level(1, '%2.', '', 'lowerLetter')}</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>`;

const STYLES = `<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>`;

async function docx(
  body: string,
  { numbering = NUMBERING, styles = STYLES } = {},
): Promise<ArrayBuffer> {
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
  zip.file('word/styles.xml', `<w:styles xmlns:w="${W}">${styles}</w:styles>`);
  zip.file(
    'word/numbering.xml',
    `<w:numbering xmlns:w="${W}">${numbering}</w:numbering>`,
  );
  zip.file(
    'word/document.xml',
    `<w:document xmlns:w="${W}" xmlns:m="${M}"><w:body>${body}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'arraybuffer' });
}

const run = (text: string) =>
  `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
const p = (text: string) => `<w:p>${run(text)}</w:p>`;
const item = (text: string, ilvl = 0, numId = 1, style = '') =>
  `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>${run(text)}</w:p>`;
const heading = (text: string) => item(text, 0, 1, 'Heading2');

describe('compound list numbering', () => {
  it('writes out section and clause numbers under numbered headings (#359)', async () => {
    const md = await convert('src/__fixtures__/legal-numbering.docx');
    expect(md).toBe(
      [
        '## 1. First section',
        '1.1 FIRST CLAUSE',
        'Body text of clause 1.1.',
        '1.2 SECOND CLAUSE',
        'Body text of clause 1.2.',
        '## 2. Second section',
        '2.1 THIRD CLAUSE',
        'Body text of clause 2.1.',
        '2.2 FOURTH CLAUSE',
        'Body text of clause 2.2.',
      ].join('\n\n'),
    );
  });

  it('numbers clauses with no body text between them', async () => {
    const md = await convert(
      await docx(
        heading('First') + item('A', 1) + item('B', 1) + heading('Second'),
      ),
    );
    expect(md).toBe('## 1. First\n\n1.1 A\n\n1.2 B\n\n## 2. Second');
  });

  it('numbers a level that is a plain paragraph, not a heading', async () => {
    // Left a Markdown list, the second section would restart at 1. As text,
    // the leading `1.` is escaped so it stays text, and renders as `1.`.
    const md = await convert(
      await docx(item('First') + item('A', 1) + p('Body') + item('Second')),
    );
    expect(md).toBe('1\\. First\n\n1.1 A\n\nBody\n\n2\\. Second');
  });

  it('leaves an ordinary multilevel list as a Markdown list', async () => {
    const md = await convert(
      await docx(item('One', 0, 2) + item('Sub', 1, 2) + item('Two', 0, 2)),
    );
    expect(md).toMatch(/^1\. One\n\s+1\. Sub\n2\. Two$/);
  });

  it('leaves the numbers out when numbered lists become bullets', async () => {
    const md = await convert(await docx(heading('First') + item('A', 1)), {
      numberedLists: 'bullets',
    });
    expect(md).not.toMatch(/\d\.\d/);
    expect(md).toContain('## First');
  });

  it('follows numbering a heading style carries', async () => {
    const styles = `${STYLES}<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Clause"><w:name w:val="Clause"/><w:basedOn w:val="Heading1"/><w:pPr><w:numPr><w:ilvl w:val="1"/></w:numPr></w:pPr></w:style>`;
    const styled = (text: string, style: string) =>
      `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${run(text)}</w:p>`;
    const md = await convert(
      await docx(
        styled('Scope', 'Heading1') +
          styled('Purpose', 'Clause') +
          styled('Terms', 'Heading1'),
        { styles },
      ),
    );
    expect(md).toBe('# 1. Scope\n\n1.1 Purpose\n\n# 2. Terms');
  });

  it('formats each level as Word does', async () => {
    // Roman articles, lettered sections restarting under each article, and a
    // legal (`w:isLgl`) level that shows every number in decimal.
    const numbering = `<w:abstractNum w:abstractNumId="1">${level(0, 'Article %1', '', 'upperRoman')}${level(1, '%1.%2', '<w:isLgl/>', 'lowerLetter')}${level(2, '(%3)', '<w:suff w:val="nothing"/>', 'lowerLetter')}</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="3"/></w:lvlOverride></w:num>`;
    const md = await convert(
      await docx(
        heading('Scope') +
          item('Purpose', 1) +
          item('x', 2) +
          item('y', 2) +
          heading('Terms') +
          item('Defined', 1),
        { numbering },
      ),
    );
    expect(md).toBe(
      [
        '## Article III Scope',
        '3.1 Purpose',
        '(a)x',
        '(b)y',
        '## Article IV Terms',
        '4.1 Defined',
      ].join('\n\n'),
    );
  });

  it("doesn't count numbering a tracked change removed", async () => {
    const changed = `<w:p><w:pPr><w:pPrChange w:id="1" w:author="A"><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr></w:pPr></w:pPrChange></w:pPr>${run('Was a clause')}</w:p>`;
    const md = await convert(
      await docx(heading('First') + changed + item('A', 1)),
    );
    expect(md).toBe('## 1. First\n\nWas a clause\n\n1.1 A');
  });

  it('numbers a clause that holds an equation, and keeps the equation', async () => {
    // Both passes edit the .docx before Mammoth, sharing one read and write.
    const equation = `<w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr></w:pPr>${run('Where ')}<m:oMath><m:r><m:t>x=1</m:t></m:r></m:oMath></w:p>`;
    const md = await convert(await docx(heading('First') + equation));
    expect(md).toBe('## 1. First\n\n1.1 Where $x=1$');
  });

  it('caps a huge start value instead of writing a huge label', async () => {
    const numbering = `<w:abstractNum w:abstractNumId="1">${level(0, '%1.')}${level(1, '%1.%2', '', 'lowerLetter')}</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="1"><w:startOverride w:val="2147483647"/></w:lvlOverride></w:num>`;
    const md = await convert(
      await docx(heading('First') + item('A', 1), { numbering }),
    );
    expect(md).toBe('## 1. First\n\n1.32767 A');
  });

  it('caps level text instead of copying it into every paragraph', async () => {
    const long = 'x'.repeat(10_000);
    const numbering = `<w:abstractNum w:abstractNumId="1">${level(0, '%1.')}${level(1, `%1.%2${long}`)}</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>`;
    const md = await convert(
      await docx(heading('First') + item('A', 1), { numbering }),
    );
    // 255 characters of level text: `%1.%2` and 250 of the x's.
    expect(md).toBe(`## 1. First\n\n1.1${'x'.repeat(250)} A`);
  });

  it('reads runaway nested paragraph properties in one pass', async () => {
    // Mammoth can't parse XML nested this deep, so this calls the pass
    // directly: it must neither hang nor rewrite the runaway paragraphs.
    const n = 20_000;
    const runaway = '<w:p><w:pPr>'.repeat(n) + '</w:pPr>'.repeat(n) + '</w:p>';
    const zip = await JSZip.loadAsync(await docx(runaway + heading('First')));
    const started = Date.now();
    expect(await labelCompoundNumbering(zip)).toBe(true);
    expect(Date.now() - started).toBeLessThan(2000);
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain(runaway);
    expect(xml).toContain('>1. </w:t>');
  });

  it('links a bookmark to a numbered heading by its numbered slug', async () => {
    const md = await convert(
      await docx(
        `<w:p><w:hyperlink w:anchor="_Toc1">${run('See scope')}</w:hyperlink></w:p>` +
          `<w:p><w:pPr><w:pStyle w:val="Heading2"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:bookmarkStart w:id="0" w:name="_Toc1"/><w:bookmarkEnd w:id="0"/>${run('Scope')}</w:p>`,
      ),
    );
    expect(md).toBe('[See scope](#1-scope)\n\n## 1. Scope');
  });
});

describe('numbered headings', () => {
  it("doesn't escape a heading's leading number", async () => {
    expect(await convertHtml('<h2>1. Scope</h2><p>1. Not a list</p>')).toBe(
      '## 1. Scope\n\n1\\. Not a list',
    );
  });

  it('keeps the escape in a setext heading, where it is needed', async () => {
    expect(
      await convertHtml('<h1>1. Scope</h1>', {
        turndown: { headingStyle: 'setext' },
      }),
    ).toMatch(/^1\\\. Scope\n=+$/);
  });
});
