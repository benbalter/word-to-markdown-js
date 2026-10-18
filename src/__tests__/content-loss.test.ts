import JSZip from 'jszip';
import { convertWithWarnings, extractDocumentProperties } from '../main.js';

// Word content mammoth leaves out of the Markdown without a message of its
// own: comments, headers and footers, and text boxes it can't read. Each test
// first shows the content really is missing, then that the converter says so.
// Documents are minimal OOXML built here with JSZip.
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS = [
  `xmlns:w="${W}"`,
  `xmlns:r="${REL}"`,
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"',
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"',
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:v="urn:schemas-microsoft-com:vml"',
].join(' ');

interface Doc {
  body: string;
  parts?: Record<string, string>;
  rels?: [id: string, type: string, target: string][];
  sectPr?: string;
}

async function docx({
  body,
  parts = {},
  rels = [],
  sectPr = '',
}: Doc): Promise<ArrayBuffer> {
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
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels
      .map(
        ([id, type, target]) =>
          `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`,
      )
      .join('')}</Relationships>`,
  );
  for (const [name, xml] of Object.entries(parts)) zip.file(name, xml);
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>${body}${sectPr}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'arraybuffer' });
}

const run = (text: string) =>
  `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
const p = (text: string) => `<w:p>${run(text)}</w:p>`;

const commented = (comments: string) => ({
  body: `<w:p><w:commentRangeStart w:id="0"/>${run('Commented text')}<w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p>`,
  parts: {
    'word/comments.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments ${NS}>${comments}</w:comments>`,
  },
  rels: [['rId5', 'comments', 'comments.xml']] as Doc['rels'],
});
const comment = (id: number, ...paragraphs: string[]) =>
  `<w:comment w:id="${id}" w:author="A" w:initials="A">${paragraphs.join('') || '<w:p/>'}</w:comment>`;

const withHeader = (header: string) => ({
  body: p('Body text'),
  parts: {
    'word/header1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr ${NS}>${header}</w:hdr>`,
  },
  rels: [['rId7', 'header', 'header1.xml']] as Doc['rels'],
  sectPr:
    '<w:sectPr><w:headerReference w:type="default" r:id="rId7"/></w:sectPr>',
});
// A PAGE field the way Word writes one: instruction, then its result ("3").
const pageField = `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run('3')}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;

const textBox = (text: string) =>
  `<w:drawing><wp:anchor><wp:docPr id="1" name="Text Box 1"/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:txbx><w:txbxContent>${p(text)}</w:txbxContent></wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing>`;
const vmlTextBox = (text: string) =>
  `<w:pict><v:shape><v:textbox><w:txbxContent>${p(text)}</w:txbxContent></v:textbox></v:shape></w:pict>`;

const contentLoss = (result: Awaited<ReturnType<typeof convertWithWarnings>>) =>
  result.warningDetails
    .filter((w) => w.kind === 'content-loss')
    .map((w) => w.detail);

describe('comments', () => {
  it('are dropped, and the warning counts the ones with text', async () => {
    const result = await convertWithWarnings(
      await docx(
        commented(
          comment(0, p('First comment')) +
            comment(1, p('Second comment')) +
            comment(2),
        ),
      ),
    );
    expect(result.markdown).toBe('Commented text');
    expect(contentLoss(result)).toEqual(['comments (2)']);
    expect(result.warnings).toContain(
      'Warning: Some document content was not converted and is missing from the Markdown (comments (2)).',
    );
  });

  it("don't warn when the style map has mammoth render them", async () => {
    const result = await convertWithWarnings(
      await docx(commented(comment(0, p('Kept comment')))),
      { mammoth: { styleMap: ['comment-reference => sup'] } },
    );
    expect(result.markdown).toContain('Kept comment');
    expect(contentLoss(result)).toEqual([]);
  });

  it('only empty ones: no warning', async () => {
    const properties = await extractDocumentProperties(
      await docx(commented(comment(0))),
    );
    expect(properties.comments).toBeUndefined();
  });
});

describe('headers and footers', () => {
  it('are dropped, and a header with text warns', async () => {
    const result = await convertWithWarnings(
      await docx(withHeader(p('Quarterly report'))),
    );
    expect(result.markdown).toBe('Body text');
    expect(contentLoss(result)).toEqual(['headers and footers']);
  });

  it('a footer with text warns too', async () => {
    const properties = await extractDocumentProperties(
      await docx({
        body: p('Body'),
        parts: {
          'word/footer2.xml': `<w:ftr ${NS}>${p('Company confidential')}</w:ftr>`,
        },
      }),
    );
    expect(properties.headersFooters).toBe(true);
  });

  it('only a page number or empty paragraphs: no warning', async () => {
    for (const header of [
      `<w:p>${pageField}</w:p>`,
      `<w:p><w:fldSimple w:instr=" PAGE ">${run('3')}</w:fldSimple></w:p>`,
      '<w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr></w:p>',
      p('  –  '),
    ]) {
      const properties = await extractDocumentProperties(
        await docx(withHeader(header)),
      );
      expect(properties.headersFooters).toBeUndefined();
    }
  });

  it('text typed around a page-number field still warns', async () => {
    const properties = await extractDocumentProperties(
      await docx(withHeader(`<w:p>${run('Page ')}${pageField}</w:p>`)),
    );
    expect(properties.headersFooters).toBe(true);
  });
});

describe('text boxes', () => {
  it('a text box with no VML fallback is dropped, and warns', async () => {
    const result = await convertWithWarnings(
      await docx({
        body: `<w:p>${run('Host')}<w:r>${textBox('Boxed text')}</w:r></w:p>`,
      }),
    );
    expect(result.markdown).toBe('Host');
    expect(contentLoss(result)).toEqual(['text boxes (1)']);
  });

  it("Word's text box, with a VML fallback, converts and doesn't warn", async () => {
    const result = await convertWithWarnings(
      await docx({
        body: `<w:p>${run('Host')}<w:r><mc:AlternateContent><mc:Choice Requires="wps">${textBox('Boxed text')}</mc:Choice><mc:Fallback>${vmlTextBox('Boxed text')}</mc:Fallback></mc:AlternateContent></w:r></w:p>`,
      }),
    );
    expect(result.markdown).toContain('Boxed text');
    expect(contentLoss(result)).toEqual([]);
  });

  it('a VML-only text box converts and does not warn', async () => {
    const result = await convertWithWarnings(
      await docx({
        body: `<w:p>${run('Host')}<w:r>${vmlTextBox('Boxed text')}</w:r></w:p>`,
      }),
    );
    expect(result.markdown).toContain('Boxed text');
    expect(contentLoss(result)).toEqual([]);
  });
});

describe('equations', () => {
  it("are left to mammoth's own warning, not warned about twice", async () => {
    const result = await convertWithWarnings(
      await docx({
        body: `<w:p>${run('Before ')}<m:oMath><m:r><m:t>x</m:t></m:r></m:oMath></w:p>`,
      }),
    );
    expect(result.markdown).toBe('Before');
    expect(contentLoss(result)).toEqual([
      'An unrecognised element was ignored: {http://schemas.openxmlformats.org/officeDocument/2006/math}oMath',
    ]);
  });
});

it('a document without any of these has no content-loss warnings', async () => {
  const properties = await extractDocumentProperties(
    await docx({ body: p('Plain') }),
  );
  expect(properties).toEqual({});
});

describe('malformed parts', () => {
  // The scans read untrusted XML. An unterminated tag must not make a failed
  // match rescan the rest of the part: with an unbounded attribute scan, these
  // took time quadratic in their size (256 KB of `<w:t ` took seconds, 1 MB
  // over a minute).
  it.each(['<w:fldSimple ', '<w:fldChar ', '<w:t ', '<wps:txbx '])(
    '1 MB of unterminated %j finishes quickly',
    async (tag) => {
      const junk = tag.repeat(Math.ceil((1024 * 1024) / tag.length));
      const header = withHeader(junk);
      const doc = await docx({
        ...header,
        body: p('Body') + junk,
        parts: {
          ...header.parts,
          'word/comments.xml': `<w:comments ${NS}><w:comment w:id="0">${junk}</w:comment></w:comments>`,
        },
      });
      const started = performance.now();
      await extractDocumentProperties(doc);
      expect(performance.now() - started).toBeLessThan(2000);
    },
  );

  it('fields nested past the depth cap stay balanced', async () => {
    const depth = 200;
    const open =
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>';
    const close = '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
    const nested = `${open.repeat(depth)}${run('9')}${close.repeat(depth)}`;
    // Only field results: nothing visible.
    const hidden = await extractDocumentProperties(
      await docx(withHeader(`<w:p>${nested}</w:p>`)),
    );
    expect(hidden.headersFooters).toBeUndefined();
    // Text after every field has closed is visible again.
    const visible = await extractDocumentProperties(
      await docx(withHeader(`<w:p>${nested}${run('Report title')}</w:p>`)),
    );
    expect(visible.headersFooters).toBe(true);
  });
});
