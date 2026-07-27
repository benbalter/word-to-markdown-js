// One-off generator for the strikethrough + footnote .docx test fixtures.
// Builds minimal valid OOXML packages with JSZip (already a dependency) so the
// fixtures are reproducible from source rather than opaque binaries authored in
// Word. Run: node scripts/make-fixtures.mjs
import JSZip from 'jszip';
import fs from 'fs';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

function contentTypes({ footnotes = false } = {}) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${
    footnotes
      ? `\n  <Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>`
      : ''
  }
</Types>`;
}

function docx(parts) {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(parts)) zip.file(name, content);
  return zip.generateAsync({ type: 'nodebuffer' });
}

// --- strikethrough.docx -----------------------------------------------------
const strikeDoc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}"><w:body>
  <w:p><w:r><w:t xml:space="preserve">This is </w:t></w:r><w:r><w:rPr><w:strike/></w:rPr><w:t>struck text</w:t></w:r><w:r><w:t xml:space="preserve"> here.</w:t></w:r></w:p>
</w:body></w:document>`;

// --- footnote.docx ----------------------------------------------------------
const footnoteDoc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}"><w:body>
  <w:p><w:r><w:t xml:space="preserve">Text with a footnote</w:t></w:r><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="1"/></w:r><w:r><w:t>.</w:t></w:r></w:p>
</w:body></w:document>`;

const footnotesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="${W}">
  <w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>
  <w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>
  <w:footnote w:id="1"><w:p><w:r><w:t>The footnote body text.</w:t></w:r></w:p></w:footnote>
</w:footnotes>`;

const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>
</Relationships>`;

const strike = await docx({
  '[Content_Types].xml': contentTypes(),
  '_rels/.rels': rels,
  'word/document.xml': strikeDoc,
});
fs.writeFileSync('src/__fixtures__/strikethrough.docx', strike);

const footnote = await docx({
  '[Content_Types].xml': contentTypes({ footnotes: true }),
  '_rels/.rels': rels,
  'word/document.xml': footnoteDoc,
  'word/footnotes.xml': footnotesXml,
  'word/_rels/document.xml.rels': docRels,
});
fs.writeFileSync('src/__fixtures__/footnote.docx', footnote);

// --- image.docx -------------------------------------------------------------
// An inline DrawingML picture. Mammoth emits <img src="data:image/png;base64,…">
// which the pipeline keeps by default and drops with `{ images: 'strip' }`.
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const WP =
  'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
// Smallest valid PNG (1×1 transparent pixel).
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const imageDoc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="${WP}" xmlns:a="${A}" xmlns:pic="${PIC}"><w:body>
  <w:p><w:r><w:drawing><wp:inline><wp:extent cx="100" cy="100"/><wp:docPr id="1" name="img"/><a:graphic><a:graphicData uri="${PIC}"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="img"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId1"/></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm><a:prstGeom prst="rect"/></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
  <w:p><w:r><w:t>Text after image.</w:t></w:r></w:p>
</w:body></w:document>`;

const imageContentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const imageRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="${R}/image" Target="media/image1.png"/>
</Relationships>`;

const image = await docx({
  '[Content_Types].xml': imageContentTypes,
  '_rels/.rels': rels,
  'word/document.xml': imageDoc,
  'word/_rels/document.xml.rels': imageRels,
  'word/media/image1.png': png,
});
fs.writeFileSync('src/__fixtures__/image.docx', image);

// --- dropped-content.docx ---------------------------------------------------
// An unrecognised element Mammoth ignores, dropping its content and emitting a
// warning-level message ("An unrecognised element was ignored: …"). Exercises
// the content-loss warning surfaced by convertWithWarnings.
const droppedDoc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}"><w:body>
  <w:p><w:r><w:t xml:space="preserve">Before.</w:t></w:r><w:someUnknownElement><w:r><w:t>hidden</w:t></w:r></w:someUnknownElement><w:r><w:t xml:space="preserve"> After.</w:t></w:r></w:p>
</w:body></w:document>`;

const dropped = await docx({
  '[Content_Types].xml': contentTypes(),
  '_rels/.rels': rels,
  'word/document.xml': droppedDoc,
});
fs.writeFileSync('src/__fixtures__/dropped-content.docx', dropped);

console.log(
  'wrote strikethrough.docx, footnote.docx, image.docx, dropped-content.docx',
);
