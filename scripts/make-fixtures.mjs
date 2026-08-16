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

// --- footnote-multiparagraph.docx -------------------------------------------
// A footnote whose body spans two paragraphs. Mammoth renders the second
// paragraph on an indented continuation line, so the converter can't fold it
// into a single-line `[^1]:` definition. The pipeline intentionally leaves such
// a note in Mammoth's raw `<sup>` + list form (reference and body stay linked)
// rather than emitting a dangling `[^1]`.
const footnoteMultiDoc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}"><w:body>
  <w:p><w:r><w:t xml:space="preserve">Text with a multi-paragraph footnote</w:t></w:r><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="1"/></w:r><w:r><w:t>.</w:t></w:r></w:p>
</w:body></w:document>`;

const footnotesMultiXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="${W}">
  <w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>
  <w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>
  <w:footnote w:id="1"><w:p><w:r><w:t>First paragraph of the note.</w:t></w:r></w:p><w:p><w:r><w:t>Second paragraph of the note.</w:t></w:r></w:p></w:footnote>
</w:footnotes>`;

const footnoteMulti = await docx({
  '[Content_Types].xml': contentTypes({ footnotes: true }),
  '_rels/.rels': rels,
  'word/document.xml': footnoteMultiDoc,
  'word/footnotes.xml': footnotesMultiXml,
  'word/_rels/document.xml.rels': docRels,
});
fs.writeFileSync(
  'src/__fixtures__/footnote-multiparagraph.docx',
  footnoteMulti,
);

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

// --- superscript.docx / subscript.docx --------------------------------------
// Runs with w:vertAlign. Mammoth maps these to <sup>/<sub> by default, and the
// pipeline preserves them as inline HTML with no option required.
const superscriptDoc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}"><w:body>
  <w:p><w:r><w:t xml:space="preserve">E = mc</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>2</w:t></w:r></w:p>
</w:body></w:document>`;

const subscriptDoc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}"><w:body>
  <w:p><w:r><w:t>H</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t>O</w:t></w:r></w:p>
</w:body></w:document>`;

const superscript = await docx({
  '[Content_Types].xml': contentTypes(),
  '_rels/.rels': rels,
  'word/document.xml': superscriptDoc,
});
fs.writeFileSync('src/__fixtures__/superscript.docx', superscript);

const subscript = await docx({
  '[Content_Types].xml': contentTypes(),
  '_rels/.rels': rels,
  'word/document.xml': subscriptDoc,
});
fs.writeFileSync('src/__fixtures__/subscript.docx', subscript);

// --- underline.docx ---------------------------------------------------------
// A run with w:u. Mammoth drops underlines by default (they resemble links), so
// the pipeline yields plain text unless `{ underline: 'preserve' }` is passed,
// which maps it to an inline <u> tag.
const underlineDoc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}"><w:body>
  <w:p><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>underlined</w:t></w:r><w:r><w:t xml:space="preserve"> word</w:t></w:r></w:p>
</w:body></w:document>`;

const underline = await docx({
  '[Content_Types].xml': contentTypes(),
  '_rels/.rels': rels,
  'word/document.xml': underlineDoc,
});
fs.writeFileSync('src/__fixtures__/underline.docx', underline);

// --- dashes.docx ------------------------------------------------------------
// Em dash (—, U+2014) and en dash (–, U+2013) as literal characters. These are
// meaningful punctuation and must survive the pipeline unchanged (they must NOT
// be flattened to ASCII hyphens). See issue #194.
const dashesDoc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}"><w:body>
  <w:p><w:r><w:t xml:space="preserve">An em dash — and an en dash – in a sentence.</w:t></w:r></w:p>
</w:body></w:document>`;

const dashes = await docx({
  '[Content_Types].xml': contentTypes(),
  '_rels/.rels': rels,
  'word/document.xml': dashesDoc,
});
fs.writeFileSync('src/__fixtures__/dashes.docx', dashes);

console.log(
  'wrote strikethrough.docx, footnote.docx, footnote-multiparagraph.docx, image.docx, dropped-content.docx, superscript.docx, subscript.docx, underline.docx, dashes.docx',
);
