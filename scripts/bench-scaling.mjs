#!/usr/bin/env node
// Scaling benchmark for the conversion pipeline: builds synthetic documents
// that grow along one axis at a time and times each pipeline stage (via the
// internal progress hook) at each size, so a stage whose time grows faster
// than its input stands out. It loads build/, so `npm run bench:scaling`
// builds first; run it directly after `npm run build:js`.
//
//   node scripts/bench-scaling.mjs            # every axis
//   node scripts/bench-scaling.mjs footnotes  # axes whose name contains this
//   W2M_BUILD=/abs/old/build node scripts/bench-scaling.mjs  # another build
//   PEEK=5 node scripts/bench-scaling.mjs toc-links  # print its Markdown
//
// Prints one row per (axis, size) with per-stage milliseconds, and a ratio
// line comparing each stage's time at the largest size with the next size
// down, normalized by the size ratio: about 1 is linear, about 2 for a
// doubling means quadratic.
import {
  AlignmentType,
  Bookmark,
  Document,
  ExternalHyperlink,
  FootnoteReferenceRun,
  HeadingLevel,
  ImageRun,
  InternalHyperlink,
  LevelFormat,
  Math as OMath,
  MathFraction,
  MathRun,
  MathSuperScript,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalMergeType,
  WidthType,
} from 'docx';
import { deflateSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
// W2M_BUILD points at another tsc output directory, to compare two builds.
const build =
  process.env.W2M_BUILD ?? new URL('../build', import.meta.url).href;
const { convertHtml, convertWithWarnings } = await import(`${build}/main.js`);
const { setProgressReporter } = await import(`${build}/progress.js`);

const filter = process.argv[2] ?? '';

// A valid 8x8 PNG, built here so the benchmark needs no binary fixture.
function png() {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(8, 0);
  ihdr.writeUInt32BE(8, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc(8 * (1 + 8 * 3), 0x80);
  for (let y = 0; y < 8; y++) raw[y * 25] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const PNG = png();

const bulletLevels = Array.from({ length: 9 }, (_, level) => ({
  level,
  format: LevelFormat.BULLET,
  text: '•',
  alignment: AlignmentType.LEFT,
  style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
}));

const decimalLevels = bulletLevels.map((level) => ({
  ...level,
  format: LevelFormat.DECIMAL,
  text: `%${level.level + 1}.`,
}));

async function docx(children, footnotes = {}) {
  const doc = new Document({
    numbering: {
      config: [
        { reference: 'bullets', levels: bulletLevels },
        { reference: 'numbers', levels: decimalLevels },
      ],
    },
    footnotes,
    sections: [{ children }],
  });
  return new Uint8Array(await Packer.toBuffer(doc)).buffer;
}

const text = (i) =>
  `Paragraph ${i} has some ordinary prose, with “smart quotes” and a few words.`;
const para = (i) => new Paragraph({ children: [new TextRun(text(i))] });

// Each axis: sizes, and a builder returning { docx } or { html } (+ options).
export const axes = {
  paragraphs: {
    sizes: [1000, 5000, 20000],
    build: async (n) => ({
      input: await docx(Array.from({ length: n }, (_, i) => para(i))),
    }),
  },
  'flat-list': {
    sizes: [1000, 4000, 8000],
    build: async (n) => ({
      input: await docx(
        Array.from(
          { length: n },
          (_, i) =>
            new Paragraph({
              text: `Item ${i}`,
              numbering: { reference: 'bullets', level: 0 },
            }),
        ),
      ),
    }),
  },
  'ordered-list': {
    sizes: [2000, 8000, 16000],
    build: async (n) => ({
      input: await docx(
        Array.from(
          { length: n },
          (_, i) =>
            new Paragraph({
              text: `Item ${i}`,
              numbering: { reference: 'numbers', level: 0 },
            }),
        ),
      ),
    }),
  },
  'nested-list': {
    // Word allows nine levels; this walks down and back up repeatedly.
    sizes: [1000, 4000, 8000],
    build: async (n) => ({
      input: await docx(
        Array.from(
          { length: n },
          (_, i) =>
            new Paragraph({
              text: `Item ${i}`,
              numbering: {
                reference: 'bullets',
                level: Math.abs((i % 16) - 8),
              },
            }),
        ),
      ),
    }),
  },
  'deep-html-list': {
    // Pasted HTML can nest far deeper than Word allows.
    sizes: [100, 200, 400],
    build: async (n) => {
      let html = '';
      for (let i = 0; i < n; i++) html += `<ul><li>Level ${i}`;
      for (let i = 0; i < n; i++) html += '</li></ul>';
      return { html };
    },
  },
  footnotes: {
    sizes: [100, 500, 2000],
    build: async (n) => {
      const notes = {};
      const children = [];
      for (let i = 1; i <= n; i++) {
        notes[i] = {
          children: [new Paragraph({ children: [new TextRun(`Note ${i}.`)] })],
        };
        children.push(
          new Paragraph({
            children: [new TextRun(text(i)), new FootnoteReferenceRun(i)],
          }),
        );
      }
      return { input: await docx(children, notes) };
    },
  },
  'external-links': {
    sizes: [1000, 4000, 8000],
    build: async (n) => ({
      input: await docx(
        Array.from(
          { length: n },
          (_, i) =>
            new Paragraph({
              children: [
                new TextRun('See '),
                new ExternalHyperlink({
                  link: `https://example.com/page/${i}`,
                  children: [new TextRun(`link ${i}`)],
                }),
              ],
            }),
        ),
      ),
    }),
  },
  'toc-links': {
    // A TOC of n entries linking to n bookmarked headings (many share text,
    // so github-slugger has to number duplicates).
    sizes: [500, 2000, 4000],
    build: async (n) => {
      const toc = [];
      const body = [];
      for (let i = 0; i < n; i++) {
        const id = `_Toc${100000 + i}`;
        toc.push(
          new Paragraph({
            children: [
              new InternalHyperlink({
                anchor: id,
                children: [new TextRun(`Section ${i % 50}`)],
              }),
            ],
          }),
        );
        body.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [
              new Bookmark({
                id,
                children: [new TextRun(`Section ${i % 50}`)],
              }),
            ],
          }),
          para(i),
        );
      }
      return { input: await docx([...toc, ...body]) };
    },
  },
  headings: {
    sizes: [1000, 4000, 8000],
    build: async (n) => ({
      input: await docx(
        Array.from(
          { length: n },
          (_, i) =>
            new Paragraph({
              heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2][i % 2],
              children: [new TextRun(`Heading ${i}`)],
            }),
        ),
      ),
    }),
  },
  'images-inline': {
    sizes: [200, 800, 1600],
    build: async (n) => ({
      input: await docx(
        Array.from(
          { length: n },
          () =>
            new Paragraph({
              children: [
                new ImageRun({
                  type: 'png',
                  data: PNG,
                  transformation: { width: 8, height: 8 },
                }),
              ],
            }),
        ),
      ),
    }),
  },
  'images-extract': {
    sizes: [200, 800, 1600],
    build: async (n) => ({
      ...(await axes['images-inline'].build(n)),
      options: { images: 'extract' },
    }),
  },
  'long-code-block': {
    sizes: [1000, 4000, 8000],
    build: async (n) => ({
      input: await docx(
        Array.from(
          { length: n },
          (_, i) =>
            new Paragraph({
              children: [
                new TextRun({
                  text: `const value${i} = compute(${i}) * [a, b] <x> {y};`,
                  font: 'Courier New',
                }),
              ],
            }),
        ),
      ),
    }),
  },
  'many-code-blocks': {
    sizes: [300, 1200, 2400],
    build: async (n) => {
      const children = [];
      for (let i = 0; i < n; i++) {
        children.push(para(i));
        for (let l = 0; l < 3; l++)
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: `line(${i}, ${l});`, font: 'Courier New' }),
              ],
            }),
          );
      }
      return { input: await docx(children) };
    },
  },
  'merged-table': {
    // Rows in pairs: a two-row vertical merge in column 1, a two-column
    // horizontal merge in the second row.
    sizes: [250, 1000, 2000],
    build: async (n) => {
      const width = { size: 2000, type: WidthType.DXA };
      const cell = (t, extra = {}) =>
        new TableCell({ width, children: [new Paragraph(t)], ...extra });
      const rows = [
        new TableRow({ children: ['A', 'B', 'C', 'D'].map((t) => cell(t)) }),
      ];
      for (let i = 0; i < n; i += 2) {
        rows.push(
          new TableRow({
            children: [
              cell(`m${i}`, { verticalMerge: VerticalMergeType.RESTART }),
              cell(`b${i}`),
              cell(`c${i}`),
              cell(`d${i}`),
            ],
          }),
          new TableRow({
            children: [
              cell('', { verticalMerge: VerticalMergeType.CONTINUE }),
              cell(`bc${i}`, { columnSpan: 2 }),
              cell(`d${i + 1}`),
            ],
          }),
        );
      }
      return { input: await docx([new Table({ rows })]) };
    },
  },
  equations: {
    sizes: [200, 800, 1600],
    build: async (n) => ({
      input: await docx(
        Array.from(
          { length: n },
          (_, i) =>
            new Paragraph({
              children: [
                new TextRun(`Equation ${i}: `),
                new OMath({
                  children: [
                    new MathSuperScript({
                      children: [new MathRun('x')],
                      superScript: [new MathRun('2')],
                    }),
                    new MathRun('+'),
                    new MathFraction({
                      numerator: [new MathRun(`${i}`)],
                      denominator: [new MathRun('y')],
                    }),
                  ],
                }),
              ],
            }),
        ),
      ),
    }),
  },
  'pasted-html': {
    // Word-flavored clipboard HTML: styled spans, o:p, smart quotes, links.
    sizes: [1000, 4000, 8000],
    build: async (n) => {
      let html = '<html><head><style>p{}</style></head><body>';
      for (let i = 0; i < n; i++) {
        html += `<p class="MsoNormal"><span style="font-family:Calibri">${text(i)} <a href="https://example.com/${i}">link</a> <b>bold</b><o:p></o:p></span></p>`;
        if (i % 10 === 0) html += `<ul><li><p>Item ${i}</p></li></ul>`;
      }
      return { html: html + '</body></html>' };
    },
  },
  'word-clipboard': {
    // Word's clipboard HTML wraps the whole selection in one section <div>.
    sizes: [1000, 4000, 8000],
    build: async (n) => {
      const { html } = await axes['pasted-html'].build(n);
      return {
        html: html
          .replace('<body>', '<body><div class="WordSection1">')
          .replace('</body>', '</div></body>'),
      };
    },
  },
};

const STAGES = [
  'load',
  'properties',
  'equations',
  'mammoth',
  'process-html',
  'turndown',
  'normalize',
  'lint',
  'prettier',
  'restore-equations',
];

async function timeOne({ input, html, options = {} }) {
  const times = {};
  let current;
  let start;
  const stop = () => {
    if (current)
      times[current] = (times[current] ?? 0) + (performance.now() - start);
  };
  setProgressReporter((stage) => {
    stop();
    current = stage;
    start = performance.now();
  });
  if (html !== undefined) await convertHtml(html, options);
  else await convertWithWarnings(input, options);
  stop();
  setProgressReporter(undefined);
  return times;
}

const pad = (s, n) => String(s).padStart(n);

async function main() {
  // PEEK=<n> prints the start and end of one axis's Markdown at size n instead,
  // to check that its generator builds what it says.
  if (process.env.PEEK) {
    const doc = await axes[filter].build(Number(process.env.PEEK));
    const md =
      doc.html === undefined
        ? (await convertWithWarnings(doc.input, doc.options)).markdown
        : await convertHtml(doc.html, doc.options);
    console.log(`${md.slice(0, 600)}\n...\n${md.slice(-400)}`);
    process.exit(0);
  }
  for (const [name, { sizes, build }] of Object.entries(axes)) {
    if (!name.includes(filter)) continue;
    const results = [];
    for (const n of sizes) {
      const doc = await build(n);
      await timeOne(await build(Math.min(50, n))); // warm up
      // Best of three per stage, to keep GC pauses out of the comparison.
      const runs = [];
      for (let i = 0; i < 3; i++) runs.push(await timeOne(doc));
      const times = {};
      for (const stage of STAGES) {
        const seen = runs.map((r) => r[stage]).filter((t) => t !== undefined);
        if (seen.length) times[stage] = Math.min(...seen);
      }
      results.push({ n, times });
      const cols = STAGES.filter((s) => times[s] !== undefined)
        .map((s) => `${s}=${Math.round(times[s])}`)
        .join(' ');
      console.log(`${name.padEnd(17)} n=${pad(n, 6)}  ${cols}`);
    }
    const [a, b] = results.slice(-2);
    const sizeRatio = b.n / a.n;
    const ratios = STAGES.filter(
      (s) => b.times[s] !== undefined && b.times[s] > 20,
    )
      .map((s) => `${s}=${(b.times[s] / a.times[s] / sizeRatio).toFixed(2)}`)
      .join(' ');
    console.log(
      `${name.padEnd(17)} normalized growth x${sizeRatio}: ${ratios}`,
    );
  }
}

// Run only as a script, so other scripts can import the axes.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
