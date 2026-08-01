import fs from 'fs';
import convert from '../main.js';

// Golden-snapshot regression suite over the adversarial eval corpus in
// src/__fixtures__/eval/. Each <name>.docx is machine-generated from an LLM spec
// (scripts/build-fixtures.mjs) and paired with a committed <name>.md capturing
// the converter's reviewed output. This locks current behavior against
// regressions; docs/converter-quality-report.md tracks where that behavior is
// still short of ideal. To intentionally update goldens after a converter
// change, re-run: npm run build:js && node scripts/build-fixtures.mjs
const EVAL_DIR = 'src/__fixtures__/eval';

const fixtures = fs.existsSync(EVAL_DIR)
  ? fs
      .readdirSync(EVAL_DIR)
      .filter((f) => f.endsWith('.docx'))
      .map((f) => f.replace(/\.docx$/, ''))
  : [];

// The corpus is a credit-generated asset (scripts/build-fixtures.mjs). When it
// hasn't been generated yet (fresh clone before `npm run gen:fixtures`) there's
// nothing to guard, so skip rather than fail. Once fixtures are committed these
// become exact-match regression checks.
describe('eval corpus', () => {
  if (fixtures.length === 0) {
    // eslint-disable-next-line jest/no-disabled-tests, jest/expect-expect
    it.skip('no generated fixtures yet — run `npm run gen:fixtures`', () => {});
    return;
  }
  for (const name of fixtures) {
    it(`converts "${name}" to its golden Markdown`, async () => {
      const expected = fs.readFileSync(`${EVAL_DIR}/${name}.md`, 'utf8');
      const md = await convert(`${EVAL_DIR}/${name}.docx`);
      expect(md).toEqual(expected);
    });
  }
});
