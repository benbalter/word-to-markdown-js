// Step 0 spike: prove the docx-build → mammoth → convert() half of the loop on a
// hand-written adversarial spec BEFORE spending any credits on batch generation.
// Run: npm run build:js && node scripts/spike.mjs
import { specToMarkdown } from './lib/roundtrip.mjs';

const spec = {
  name: 'spike-adversarial',
  description:
    'Merged-cell table + footnote + nested ordered list + mixed inline styles',
  blocks: [
    { type: 'heading', level: 2, text: 'Quarterly Report' },
    {
      type: 'paragraph',
      runs: [
        { text: 'Revenue grew ' },
        { text: 'significantly', bold: true },
        { text: ' this quarter' },
        { text: '', footnote: 'Compared to the same quarter last year.' },
        { text: '. See ' },
        { text: 'the appendix', link: 'https://example.com/appendix' },
        { text: ' for details.' },
      ],
    },
    {
      type: 'table',
      rows: [
        {
          cells: [
            { text: 'Region', header: true },
            { text: 'H1 / H2', header: true, colSpan: 2 },
          ],
        },
        {
          cells: [
            { text: 'North', rowSpan: 2 },
            { text: '10' },
            { text: '12' },
          ],
        },
        {
          cells: [{ rowSpan: 0 }, { text: '8' }, { text: '9' }],
        },
      ],
    },
    {
      type: 'list',
      ordered: true,
      items: [
        { runs: [{ text: 'First step' }], level: 0 },
        { runs: [{ text: 'Sub-step A' }], level: 1 },
        { runs: [{ text: 'Sub-step B' }], level: 1 },
        { runs: [{ text: 'Second step' }], level: 0 },
      ],
    },
  ],
};

const { markdown } = await specToMarkdown(spec);
console.log('--- CONVERTED MARKDOWN ---');
console.log(markdown);
console.log('--- END (spike round-trip OK) ---');
