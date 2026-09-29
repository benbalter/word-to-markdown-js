import JSZip from 'jszip';
import convert, { processHtml } from '../main.js';

// Only http:, https: and mailto: links (plus fragments and relative URLs) may
// reach the Markdown. Anything else is unwrapped to its text, so a hyperlink in
// a Word document can't smuggle a script URL into a downstream renderer.

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// XML 1.0 forbids raw C0 controls; a character reference still reaches
// mammoth's parser (and Word writes targets the same way).
// eslint-disable-next-line no-control-regex
const C0_CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

const escapeXml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(C0_CONTROLS, (c) => `&#x${c.charCodeAt(0).toString(16)};`)
    .replace(/\t/g, '&#x9;');

// A minimal .docx with one paragraph per link: an external hyperlink
// relationship for URLs, or a w:anchor for "#bookmark" targets.
async function docxWithLinks(
  links: { text: string; target: string }[],
): Promise<ArrayBuffer> {
  const rels: string[] = [];
  const paras = links.map(({ text, target }, i) => {
    const run = `<w:r><w:t>${escapeXml(text)}</w:t></w:r>`;
    if (target.startsWith('#')) {
      return `<w:p><w:hyperlink w:anchor="${escapeXml(target.slice(1))}">${run}</w:hyperlink></w:p>`;
    }
    const id = `rId${i + 1}`;
    rels.push(
      `<Relationship Id="${id}" Type="${R}/hyperlink" Target="${escapeXml(target)}" TargetMode="External"/>`,
    );
    return `<w:p><w:hyperlink r:id="${id}">${run}</w:hyperlink></w:p>`;
  });

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
  <Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`,
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${paras.join('')}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('link scheme allowlist', () => {
  const unsafe: [string, string][] = [
    ['leading U+0001 before javascript:', '\u0001javascript:alert(4)'],
    ['mixed-case javascript:', 'JaVaScRiPt:alert(1)'],
    ['leading space before javascript:', ' javascript:alert(3)'],
    ['tab inside the scheme', 'java\tscript:alert(1)'],
    ['trailing control after the URL', 'javascript:alert(1)\u001F'],
    ['vbscript:', 'vbscript:msgbox(6)'],
    ['data:text/html', 'data:text/html,<script>alert(1)</script>'],
    ['file:', 'file:///etc/passwd'],
  ];

  describe('end to end (.docx → Markdown)', () => {
    it.each(unsafe)('unwraps a %s link to plain text', async (_, target) => {
      const md = await convert(
        await docxWithLinks([{ text: 'click me', target }]),
      );
      expect(md).toBe('click me');
    });

    it('never emits a script-capable link target', async () => {
      const md = await convert(
        await docxWithLinks(
          unsafe.map(([, target], i) => ({ text: `link ${i}`, target })),
        ),
      );
      expect(md).not.toMatch(/\]\(/);
      expect(md).not.toMatch(/javascript|vbscript|data:|file:/i);
      // eslint-disable-next-line no-control-regex
      expect(md).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
    });

    it.each([
      ['http', 'http://example.com/', '[site](http://example.com/)'],
      [
        'https',
        'https://example.com/a?b=c',
        '[site](https://example.com/a?b=c)',
      ],
      ['mailto', 'mailto:ben@example.com', '[site](mailto:ben@example.com)'],
      ['relative', 'docs/page.html', '[site](docs/page.html)'],
      ['fragment', '#section-1', '[site](#section-1)'],
    ])('keeps a %s link', async (_, target, expected) => {
      const md = await convert(await docxWithLinks([{ text: 'site', target }]));
      expect(md).toBe(expected);
    });

    it('strips leading and trailing controls from an allowed link', async () => {
      const md = await convert(
        await docxWithLinks([
          { text: 'site', target: '\u0001 https://example.com/ \u001F' },
        ]),
      );
      expect(md).toBe('[site](https://example.com/)');
    });
  });

  describe('processHtml', () => {
    it.each(unsafe)('unwraps a %s link', (_, href) => {
      const html = processHtml(
        `<p>before <a href="${escapeXml(href)}"><strong>bold</strong> text</a> after</p>`,
      );
      expect(html).toBe('<p>before <strong>bold</strong> text after</p>');
    });

    it('unwraps a link whose href is not a parseable URL', () => {
      expect(processHtml('<a href="http://[::1">x</a>')).toBe('x');
    });

    it.each([
      'http://example.com/',
      'HTTPS://example.com/',
      'mailto:ben@example.com',
      '#footnote-1',
      '../relative/path',
      '/root-relative',
      '//example.com/protocol-relative',
      '',
    ])('keeps href %j', (href) => {
      const html = `<a href="${href}">x</a>`;
      expect(processHtml(html)).toBe(html);
    });

    it('re-serializes a trimmed href without altering its query', () => {
      expect(
        processHtml(
          '<a href="&#x1; https://x.test/?a=1&amp;b=&quot;2&quot;">x</a>',
        ),
      ).toBe('<a href="https://x.test/?a=1&amp;b=&quot;2&quot;">x</a>');
    });

    it('leaves anchors without an href (bookmarks) alone', () => {
      const html = '<p><a id="_Toc1"></a>Heading</p>';
      expect(processHtml(html)).toBe(html);
    });
  });
});
