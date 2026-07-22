import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Integration tests for the `w2m` CLI (src/cli.ts → build/cli.js). The converter
// itself is covered by the unit suites; this pins the CLI's contract: Markdown
// goes to stdout, problems go to stderr with a non-zero exit. It exercises the
// real built entrypoint (shebang, commander wiring, process.exit) as a
// subprocess rather than importing the module, which would call process.exit().

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const cliPath = path.join(root, 'build/cli.js');
const tscPath = path.join(root, 'node_modules/typescript/bin/tsc');
const fixture = (name: string): string =>
  path.join(root, 'src/__fixtures__', name);

// build/ is gitignored. CI runs `check-builds` (a full build) before the tests,
// and local dev usually has build/ already, but build it here if it's missing
// so the suite is self-contained on a fresh clone.
beforeAll(() => {
  if (!existsSync(cliPath)) {
    execFileSync(process.execPath, [tscPath], { cwd: root, stdio: 'inherit' });
  }
}, 60000);

interface CliResult {
  stdout: string;
  stderr: string;
  status: number;
}

function runCli(args: string[]): CliResult {
  try {
    const stdout = execFileSync(process.execPath, [cliPath, ...args], {
      cwd: root,
      encoding: 'utf8',
      // Pipe stderr (don't inherit) so warning/error output is captured for
      // assertions instead of being echoed into the test runner's console.
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', status: 0 };
  } catch (error) {
    // execFileSync throws on a non-zero exit; the thrown error carries the
    // captured streams and the exit status.
    const e = error as {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      status?: number;
    };
    return {
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
      status: typeof e.status === 'number' ? e.status : 1,
    };
  }
}

describe('w2m CLI', () => {
  it('converts a .docx and writes Markdown to stdout (clean exit, empty stderr)', () => {
    const result = runCli([fixture('h1.docx')]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('# Heading 1');
    // No document warnings for this fixture, so stderr stays empty.
    expect(result.stderr.trim()).toBe('');
  });

  it('rejects a .doc file with a non-zero exit and a message on stderr', () => {
    // Extension is validated before any file read, so the path need not exist.
    const result = runCli([fixture('does-not-exist.doc')]);
    expect(result.status).toBe(1);
    expect(result.stdout.trim()).toBe('');
    // The message names the unsupported/supported formats; assert on ".docx"
    // rather than the full sentence so copy tweaks don't break the test.
    expect(result.stderr).toMatch(/\.docx/);
  });

  it('exits non-zero when the input file does not exist', () => {
    const result = runCli([fixture('does-not-exist.docx')]);
    expect(result.status).toBe(1);
    expect(result.stderr.trim()).not.toBe('');
  });
});
