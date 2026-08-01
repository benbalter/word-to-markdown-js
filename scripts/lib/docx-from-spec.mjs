// Deterministic JSON-spec → valid .docx builder, on top of the `docx` library.
//
// The LLM emits a compact, structured spec (see SPEC SHAPE below); this module
// turns it into a genuine Word document. Deterministic construction is far more
// reliable than asking a model for raw OOXML, so every well-formed spec yields a
// valid .docx that mammoth can read. Malformed blocks are skipped defensively
// rather than aborting the whole document.
//
// SPEC SHAPE
// {
//   name: "nested-tables",              // fixture slug (kebab-case)
//   description: "why this is tricky",  // human note, carried into the report
//   blocks: [
//     { type: "heading", level: 1..6, runs?: Run[], text?: string },
//     { type: "paragraph", runs: Run[] },
//     { type: "list", ordered: bool, items: [{ runs: Run[], level?: 0..4 }] },
//     { type: "table", rows: [{ cells: [{ runs?: Run[], text?: string,
//                                          colSpan?: n, rowSpan?: n, header?: bool }] }] },
//   ],
// }
// Run = { text: string, bold?, italic?, strike?, sup?, sub?, underline?, code?,
//         link?: "https://...", footnote?: "footnote body text" }
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  ExternalHyperlink,
  Table,
  TableRow,
  TableCell,
  WidthType,
  VerticalMergeType,
  FootnoteReferenceRun,
  LevelFormat,
  AlignmentType,
} from 'docx';

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

// A pool of decimal numbering references so each ordered list numbers itself
// from 1 independently. The builder hands out one reference per ordered list.
const ORDERED_REFS = Array.from({ length: 24 }, (_, i) => `ord${i}`);

function orderedConfig(reference) {
  return {
    reference,
    levels: [0, 1, 2, 3, 4].map((level) => ({
      level,
      format: LevelFormat.DECIMAL,
      text: `%${level + 1}.`,
      alignment: AlignmentType.START,
      style: {
        paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } },
      },
    })),
  };
}

/** Build TextRun/hyperlink/footnote children from an array of Run specs. */
function buildRuns(runs, footnotes) {
  const out = [];
  for (const r of runs ?? []) {
    if (!r || typeof r.text !== 'string') continue;
    if (r.footnote) {
      // Emit the anchor text (if any) then a footnote reference.
      if (r.text) out.push(new TextRun({ text: r.text }));
      const id = footnotes.nextId++;
      footnotes.map[id] = {
        children: [
          new Paragraph({ children: [new TextRun(String(r.footnote))] }),
        ],
      };
      out.push(new FootnoteReferenceRun(id));
      continue;
    }
    const runOpts = {
      text: r.text,
      bold: !!r.bold,
      italics: !!r.italic,
      strike: !!r.strike,
      superScript: !!r.sup,
      subScript: !!r.sub,
      ...(r.underline ? { underline: {} } : {}),
    };
    if (r.link) {
      out.push(
        new ExternalHyperlink({
          link: String(r.link),
          children: [new TextRun({ ...runOpts, style: 'Hyperlink' })],
        }),
      );
    } else {
      out.push(new TextRun(runOpts));
    }
  }
  return out.length ? out : [new TextRun('')];
}

function cellChildren(cell, footnotes) {
  const runs =
    cell.runs ?? (cell.text != null ? [{ text: String(cell.text) }] : []);
  return [new Paragraph({ children: buildRuns(runs, footnotes) })];
}

function buildTable(block, footnotes) {
  const rows = (block.rows ?? []).map((row) => {
    const cells = (row.cells ?? []).map((cell) => {
      const opts = { children: cellChildren(cell, footnotes) };
      if (cell.colSpan && cell.colSpan > 1) opts.columnSpan = cell.colSpan;
      if (cell.rowSpan && cell.rowSpan > 1) {
        opts.verticalMerge = VerticalMergeType.RESTART;
      } else if (cell.rowSpan === 0) {
        opts.verticalMerge = VerticalMergeType.CONTINUE;
      }
      return new TableCell(opts);
    });
    return new TableRow({ children: cells });
  });
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

/**
 * Turn a spec object into a Buffer of .docx bytes.
 * Throws on a fundamentally broken spec; the caller round-trips the result
 * through the converter and discards anything that fails to read.
 */
export async function docxFromSpec(spec) {
  const footnotes = { map: {}, nextId: 1 };
  const orderedUsed = [];
  let orderedIdx = 0;
  const children = [];

  for (const block of spec.blocks ?? []) {
    if (!block || typeof block !== 'object') continue;
    switch (block.type) {
      case 'heading': {
        const level =
          HEADINGS[Math.min(Math.max((block.level ?? 1) - 1, 0), 5)];
        const runs =
          block.runs ?? (block.text != null ? [{ text: block.text }] : []);
        children.push(
          new Paragraph({
            heading: level,
            children: buildRuns(runs, footnotes),
          }),
        );
        break;
      }
      case 'paragraph': {
        children.push(
          new Paragraph({ children: buildRuns(block.runs, footnotes) }),
        );
        break;
      }
      case 'list': {
        const ordered = !!block.ordered;
        let reference;
        if (ordered) {
          reference = ORDERED_REFS[orderedIdx++ % ORDERED_REFS.length];
          orderedUsed.push(reference);
        }
        for (const item of block.items ?? []) {
          const level = Math.min(Math.max(item.level ?? 0, 0), 4);
          const paraOpts = { children: buildRuns(item.runs, footnotes) };
          if (ordered) paraOpts.numbering = { reference, level };
          else paraOpts.bullet = { level };
          children.push(new Paragraph(paraOpts));
        }
        break;
      }
      case 'table': {
        children.push(buildTable(block, footnotes));
        break;
      }
      default:
        // Unknown block type — skip rather than abort.
        break;
    }
  }

  const doc = new Document({
    footnotes: footnotes.map,
    numbering: { config: orderedUsed.map((ref) => orderedConfig(ref)) },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
