import JSZip from 'jszip';
import convert, { convertWithWarnings } from '../main.js';
import { ommlToLatex } from '../equations.js';

// Word equations (Office Math) become LaTeX. Documents are minimal OOXML built
// here with JSZip; equations are written the way Word saves them.
const NS = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"',
].join(' ');

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
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>${body}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'arraybuffer' });
}

const run = (text: string) =>
  `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
const r = (text: string) => `<m:r><m:t>${text}</m:t></m:r>`;
const fn = (text: string) =>
  `<m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t>${text}</m:t></m:r>`;
const e = (...content: string[]) => `<m:e>${content.join('')}</m:e>`;
const math = (...content: string[]) => `<m:oMath>${content.join('')}</m:oMath>`;
const latex = (...content: string[]) => ommlToLatex(math(...content));

describe('ommlToLatex', () => {
  it.each([
    ['a run', [r('x+1')], 'x+1'],
    [
      'Greek letters and operators',
      [r('α≤β×2')],
      '\\alpha \\le \\beta \\times 2',
    ],
    [
      'a fraction',
      [
        '<m:f><m:num>' +
          r('a') +
          '</m:num><m:den>' +
          r('b+c') +
          '</m:den></m:f>',
      ],
      '\\frac{a}{b+c}',
    ],
    [
      'a linear fraction',
      [
        '<m:f><m:fPr><m:type m:val="lin"/></m:fPr><m:num>' +
          r('a') +
          '</m:num><m:den>' +
          r('b') +
          '</m:den></m:f>',
      ],
      'a/b',
    ],
    [
      'a superscript',
      ['<m:sSup>' + e(r('x')) + '<m:sup>' + r('2') + '</m:sup></m:sSup>'],
      'x^2',
    ],
    [
      'a superscript on a sum, braced',
      ['<m:sSup>' + e(r('a+b')) + '<m:sup>' + r('n+1') + '</m:sup></m:sSup>'],
      '{a+b}^{n+1}',
    ],
    [
      'a subscript and superscript',
      [
        '<m:sSubSup>' +
          e(r('x')) +
          '<m:sub>' +
          r('i') +
          '</m:sub><m:sup>' +
          r('2') +
          '</m:sup></m:sSubSup>',
      ],
      'x_i^2',
    ],
    [
      'a square root',
      [
        '<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>' +
          e(r('x')) +
          '</m:rad>',
      ],
      '\\sqrt{x}',
    ],
    [
      'an nth root',
      ['<m:rad><m:deg>' + r('3') + '</m:deg>' + e(r('x')) + '</m:rad>'],
      '\\sqrt[3]{x}',
    ],
    [
      'a sum with limits',
      [
        '<m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub>' +
          r('i=1') +
          '</m:sub><m:sup>' +
          r('n') +
          '</m:sup>' +
          e(r('i')) +
          '</m:nary>',
      ],
      '\\sum_{i=1}^n i',
    ],
    [
      'an integral (the default n-ary operator)',
      [
        '<m:nary><m:sub>' +
          r('0') +
          '</m:sub><m:sup>' +
          r('∞') +
          '</m:sup>' +
          e(r('f(x)dx')) +
          '</m:nary>',
      ],
      '\\int_0^{\\infty} f(x)dx',
    ],
    ['parentheses', ['<m:d>' + e(r('a+b')) + '</m:d>'], '\\left(a+b\\right)'],
    [
      'absolute value bars, which never become a table pipe',
      [
        '<m:d><m:dPr><m:begChr m:val="|"/><m:endChr m:val="|"/></m:dPr>' +
          e(r('x')) +
          '</m:d>',
      ],
      '\\left\\vert x\\right\\vert',
    ],
    [
      'a function',
      [
        '<m:func><m:fName>' +
          fn('sin') +
          '</m:fName>' +
          e(r('θ')) +
          '</m:func>',
      ],
      '\\sin{\\theta}',
    ],
    [
      'a limit',
      [
        '<m:func><m:fName><m:limLow>' +
          e(fn('lim')) +
          '<m:lim>' +
          r('n→∞') +
          '</m:lim></m:limLow></m:fName>' +
          e(r('a')) +
          '</m:func>',
      ],
      '\\lim_{n\\to \\infty}{a}',
    ],
    [
      'an accent',
      ['<m:acc><m:accPr><m:chr m:val="⃗"/></m:accPr>' + e(r('v')) + '</m:acc>'],
      '\\vec{v}',
    ],
    [
      'an overbar',
      [
        '<m:bar><m:barPr><m:pos m:val="top"/></m:barPr>' +
          e(r('z')) +
          '</m:bar>',
      ],
      '\\overline{z}',
    ],
    [
      'a matrix in brackets',
      [
        '<m:d><m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/></m:dPr>' +
          e(
            '<m:m><m:mr>' +
              e(r('1')) +
              e(r('0')) +
              '</m:mr><m:mr>' +
              e(r('0')) +
              e(r('1')) +
              '</m:mr></m:m>',
          ) +
          '</m:d>',
      ],
      '\\left[\\begin{matrix}1 & 0 \\\\ 0 & 1\\end{matrix}\\right]',
    ],
    [
      'normal text',
      ['<m:r><m:rPr><m:nor/></m:rPr><m:t>if</m:t></m:r>'],
      '\\text{if}',
    ],
    ['LaTeX specials', [r('a_b{c}%$#&lt;')], 'a\\_b\\{c\\}\\%\\$\\#\\lt'],
  ])('converts %s', (_name, content, expected) => {
    expect(latex(...content)).toBe(expected);
  });
});

describe('equations in a document', () => {
  const pythagoras = math(
    '<m:sSup>' + e(r('a')) + '<m:sup>' + r('2') + '</m:sup></m:sSup>',
    r('+'),
    '<m:sSup>' + e(r('b')) + '<m:sup>' + r('2') + '</m:sup></m:sSup>',
    r('='),
    '<m:sSup>' + e(r('c')) + '<m:sup>' + r('2') + '</m:sup></m:sSup>',
  );

  it('converts an inline equation to $…$', async () => {
    const md = await convert(
      await docx(`<w:p>${run('So ')}${pythagoras}${run(' holds.')}</w:p>`),
    );
    expect(md).toBe('So $a^2+b^2=c^2$ holds.');
  });

  it('converts a display equation to a $$ block', async () => {
    const md = await convert(
      await docx(
        `<w:p>${run('Before.')}</w:p><w:p><m:oMathPara>${pythagoras}</m:oMathPara></w:p><w:p>${run('After.')}</w:p>`,
      ),
    );
    expect(md).toBe('Before.\n\n$$\na^2+b^2=c^2\n$$\n\nAfter.');
  });

  it('displays an equation alone in its paragraph, as Word does', async () => {
    const md = await convert(await docx(`<w:p>${pythagoras}</w:p>`));
    expect(md).toBe('$$\na^2+b^2=c^2\n$$');
  });

  it('stacks the lines of a multi-line display equation', async () => {
    const md = await convert(
      await docx(
        `<w:p><m:oMathPara>${math(r('x=1'))}${math(r('y=2'))}</m:oMathPara></w:p>`,
      ),
    );
    expect(md).toBe('$$\n\\begin{gathered}x=1 \\\\ y=2\\end{gathered}\n$$');
  });

  it('keeps an equation in a table cell on one line, without pipes', async () => {
    const abs = math(
      '<m:d><m:dPr><m:begChr m:val="|"/><m:endChr m:val="|"/></m:dPr>' +
        e(r('x')) +
        '</m:d>',
    );
    const cell = (content: string) => `<w:tc><w:p>${content}</w:p></w:tc>`;
    const md = await convert(
      await docx(
        `<w:tbl><w:tr>${cell(run('Name'))}${cell(run('Formula'))}</w:tr><w:tr>${cell(run('Abs'))}${cell(abs)}</w:tr></w:tbl>`,
      ),
    );
    expect(md).toContain('| Abs  | $\\left\\vert x\\right\\vert$ |');
  });

  it('leaves no warning for converted equations', async () => {
    const result = await convertWithWarnings(
      await docx(`<w:p>${run('x: ')}${pythagoras}</w:p>`),
    );
    expect(result.markdown).toBe('x: $a^2+b^2=c^2$');
    expect(result.warnings).toEqual([]);
  });

  it("drops equations with equations: 'strip', and warns", async () => {
    const result = await convertWithWarnings(
      await docx(`<w:p>${run('Before ')}${pythagoras}</w:p>`),
      { equations: 'strip' },
    );
    expect(result.markdown).toBe('Before');
    expect(result.warningDetails.map((w) => w.detail)).toEqual([
      'An unrecognised element was ignored: {http://schemas.openxmlformats.org/officeDocument/2006/math}oMath',
    ]);
  });

  it('leaves out an equation it cannot convert, and warns, instead of failing the document', async () => {
    // Nested deeply enough to exhaust the stack in the recursive converter.
    // Before equations were converted, Mammoth just dropped them, so a
    // document like this must still convert.
    let nested = r('x');
    for (let depth = 0; depth < 20000; depth++) {
      nested = `<m:f><m:num>${nested}</m:num><m:den>${r('y')}</m:den></m:f>`;
    }
    const result = await convertWithWarnings(
      await docx(
        `<w:p>${run('Before ')}${math(nested)}${run(' after, and ')}${pythagoras}</w:p>`,
      ),
    );
    // The rest of the document, other equations included, still converts.
    expect(result.markdown).toMatch(/^Before +after, and \$a\^2\+b\^2=c\^2\$$/);
    expect(result.warningDetails).toEqual([
      expect.objectContaining({
        kind: 'content-loss',
        // Matches the web UI's /oMath/ pattern, so it names "equations".
        detail: expect.stringMatching(/oMath \(1\)$/),
      }),
    ]);
  });

  it('keeps an equation after a line break inline', async () => {
    const md = await convert(
      await docx(
        `<w:p>${run('Line one')}<w:r><w:br/></w:r>${pythagoras}</w:p>`,
      ),
    );
    expect(md).toBe('Line one  \n$a^2+b^2=c^2$');
  });

  it('keeps two equations sharing a paragraph inline', async () => {
    const md = await convert(
      await docx(
        `<w:p>${math(r('x=1'))}${run(' and ')}${math(r('y=2'))}</w:p>`,
      ),
    );
    expect(md).toBe('$x=1$ and $y=2$');
  });

  it('writes a prime as a prime, not a raised one', () => {
    expect(
      latex('<m:sSup>' + e(r('f')) + '<m:sup>' + r('′') + '</m:sup></m:sSup>'),
    ).toBe("f'");
  });

  it('links a table of contents entry to a heading with an equation', async () => {
    const md = await convert(
      await docx(
        `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:bookmarkStart w:id="0" w:name="_Toc1"/>${run('Area ')}${math(r('πr'))}<w:bookmarkEnd w:id="0"/></w:p>` +
          `<w:p><w:hyperlink w:anchor="_Toc1">${run('Area')}</w:hyperlink></w:p>`,
      ),
    );
    expect(md).toBe('# Area $\\pi r$\n\n[Area](#area-pi-r)');
  });

  it('leaves placeholder-like text alone in a part with no equations', async () => {
    const zip = await JSZip.loadAsync(
      await docx(
        `<w:p>${run('Note')}<w:r><w:footnoteReference w:id="1"/></w:r>${run(' and ')}${pythagoras}</w:p>`,
      ),
    );
    zip.file(
      'word/_rels/document.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/></Relationships>`,
    );
    zip.file(
      'word/footnotes.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes ${NS}><w:footnote w:id="1"><w:p>${run('See WTMEQ0X here')}</w:p></w:footnote></w:footnotes>`,
    );
    const md = await convert(await zip.generateAsync({ type: 'arraybuffer' }));
    expect(md).toContain('[^1]: See WTMEQ0X here');
    expect(md).toContain('$a^2+b^2=c^2$');
  });

  it('leaves a document whose text looks like a placeholder alone', async () => {
    const md = await convert(
      await docx(`<w:p>${run('WTMEQ0X ')}${pythagoras}</w:p>`),
    );
    expect(md).toBe('WTMEQ0X $a^2+b^2=c^2$');
  });
});
