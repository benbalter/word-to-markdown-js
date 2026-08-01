// A1 (credit-funded): ask Azure Foundry for a batch of diverse, adversarial
// document specs (see SPEC SHAPE in scripts/lib/docx-from-spec.mjs). Each spec is
// generated from a distinct "challenge" seed to guarantee variety, and the RAW
// model response is written to disk before any parsing so the spend is never
// wasted by a downstream bug.
//
// Run: node scripts/gen-fixture-specs.mjs [variantsPerChallenge=2]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chatJson, dumpRaw } from './lib/azure.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPEC_DIR = path.join(__dirname, '.gen-cache', 'specs');

// Each challenge stresses a distinct part of the Word → Markdown pipeline.
const CHALLENGES = [
  'a table with horizontally merged header cells (colSpan) and a body row',
  'a table with vertically merged cells (rowSpan) spanning two rows',
  'a deeply nested ordered list (3+ levels) mixing ordered and unordered items',
  'paragraphs mixing bold, italic, strikethrough, superscript and subscript in one line',
  'multiple footnotes referenced from body paragraphs',
  'hyperlinks embedded inside list items and inside table cells',
  'headings that jump levels (h1 then h3) and a heading following a table',
  'inline code spans and a run that looks like a URL but is plain text',
  'a table whose first row should become the Markdown header row',
  'smart quotes, em dashes, and non-breaking spaces inside paragraphs',
  'an ordered list that restarts numbering after an intervening paragraph',
  'a table cell containing its own nested bullet list',
];

const variants = Math.max(1, parseInt(process.argv[2] ?? '2', 10));

const SYSTEM = `You generate test-document specifications for a Word (.docx) → Markdown converter.
Return ONLY JSON matching this shape (no prose):
{
  "name": "<kebab-case slug, unique, descriptive>",
  "description": "<one sentence: what makes this document tricky to convert>",
  "blocks": [ ...ordered blocks... ]
}
Block types:
- {"type":"heading","level":1-6,"text":"..."}
- {"type":"paragraph","runs":[Run,...]}
- {"type":"list","ordered":true|false,"items":[{"runs":[Run,...],"level":0-4}]}
- {"type":"table","rows":[{"cells":[{"runs":[Run,...] OR "text":"...","colSpan":n?,"rowSpan":n?,"header":bool?}]}]}
Run = {"text":"...","bold"?:bool,"italic"?:bool,"strike"?:bool,"sup"?:bool,"sub"?:bool,"underline"?:bool,"link"?:"https://...","footnote"?:"footnote body"}
For a vertically merged cell, the STARTING cell uses "rowSpan":2 and the covered cell below uses "rowSpan":0.
Keep documents small (2-6 blocks) but realistic. Use real-sounding content, not lorem ipsum.`;

async function main() {
  fs.mkdirSync(SPEC_DIR, { recursive: true });
  const seen = new Set();
  let ok = 0;
  for (const challenge of CHALLENGES) {
    for (let v = 0; v < variants; v++) {
      const user = `Generate one specification whose defining challenge is: ${challenge}.
Variant ${v + 1} of ${variants} — make it materially different from other variants (different content, structure, and slug).`;
      try {
        const { parsed, raw } = await chatJson({
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: user },
          ],
          temperature: 0.8,
        });
        let name = String(parsed.name || '').trim() || `spec-${ok}`;
        // Ensure unique, filesystem-safe slug.
        name = name
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-')
          .replace(/^-+|-+$/g, '');
        let unique = name;
        let n = 2;
        while (seen.has(unique)) unique = `${name}-${n++}`;
        seen.add(unique);
        parsed.name = unique;
        // Raw response for provenance; parsed spec for the builder.
        dumpRaw(path.join(SPEC_DIR, `${unique}.raw.json`), raw);
        dumpRaw(path.join(SPEC_DIR, `${unique}.json`), parsed);
        ok++;
        console.log(`✓ ${unique} — ${challenge}`);
      } catch (err) {
        console.warn(`✗ skipped (${challenge}): ${err.message}`);
      }
    }
  }
  console.log(
    `\nWrote ${ok} spec(s) to ${path.relative(process.cwd(), SPEC_DIR)}`,
  );
}

await main();
