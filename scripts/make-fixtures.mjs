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

console.log('wrote strikethrough.docx and footnote.docx');
