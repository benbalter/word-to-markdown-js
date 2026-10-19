import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import * as markdownlint from 'markdownlint/sync';

// markdownlint parses Markdown with micromark, and micromark-extension-gfm-table
// before 2.1.2 resolved tables in time quadratic in the total number of table
// rows in a document (a linear scan per edit in its EditMap; see
// https://github.com/micromark/micromark-extension-gfm-table/pull/17). For
// word2md that made lint the slowest stage on table-heavy documents: 80 tables
// of 100 rows spent over 20 s there. markdownlint 0.42 pins the fixed version.
// These guard against a lockfile change or downgrade bringing it back.

function tableMarkdown(rows: number): string {
  const body = Array.from(
    { length: rows },
    (_, r) => `| ${r} | Item ${r} | ${r * 3} |`,
  ).join('\n');
  return `| ID | Name | Value |\n| --- | --- | --- |\n${body}\n`;
}

describe('markdownlint table parsing performance', () => {
  it('locks micromark-extension-gfm-table at a version with the linear-time fix', () => {
    // Read the lockfile, which is what `npm ci` installs: the copy nested
    // under markdownlint if there is one, since that's the one it loads, else
    // the hoisted one.
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as {
      packages: Record<string, { version: string }>;
    };
    const { version } =
      lock.packages[
        'node_modules/markdownlint/node_modules/micromark-extension-gfm-table'
      ] ?? lock.packages['node_modules/micromark-extension-gfm-table'];
    const [major, minor, patch] = version.split('.').map(Number);
    expect(major * 1e6 + minor * 1e3 + patch).toBeGreaterThanOrEqual(
      2 * 1e6 + 1 * 1e3 + 2,
    );
  });

  it('lints a table of 12,000 rows quickly', () => {
    // On a fast laptop this took about 15 s before the fix and about 0.4 s
    // after (about 0.9 s under coverage with other suites running), so the
    // bound fails reliably on the old version while leaving headroom for slow
    // CI machines.
    const md = tableMarkdown(12_000);
    const start = performance.now();
    const result = markdownlint.lint({ strings: { md } });
    const elapsed = performance.now() - start;
    expect(result['md']).toBeDefined();
    expect(elapsed).toBeLessThan(5000);
  });
});
