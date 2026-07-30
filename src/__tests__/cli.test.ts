import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'fs';
import os from 'os';
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

  it('--strip-images removes embedded images', () => {
    const withImages = runCli([fixture('image.docx')]);
    expect(withImages.stdout).toContain('data:image/png;base64');

    const stripped = runCli(['--strip-images', fixture('image.docx')]);
    expect(stripped.status).toBe(0);
    expect(stripped.stdout).not.toContain('data:image');
    expect(stripped.stdout).toContain('Text after image.');
  });

  it('--image-dir extracts images to files and links them relatively', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'w2m-images-'));
    try {
      const result = runCli(['--image-dir', dir, fixture('image.docx')]);
      expect(result.status).toBe(0);
      // No base64 in the Markdown; a relative link to the written file instead.
      // (runCli only captures stderr on a non-zero exit, so the "Wrote N image"
      // notice isn't asserted here — the written file below is the real proof.)
      expect(result.stdout).not.toContain('data:image');
      expect(result.stdout).toContain(`${dir}/image1.png`);
      // The file exists on disk with real bytes.
      expect(existsSync(path.join(dir, 'image1.png'))).toBe(true);
      expect(statSync(path.join(dir, 'image1.png')).size).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps numbered lists numbered by default', () => {
    const result = runCli([fixture('ol.docx')]);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^\s*1\.\s+One/m);
    expect(result.stdout).not.toContain('- One');
  });

  it('--bullet-lists converts numbered lists to bullets', () => {
    const result = runCli(['--bullet-lists', fixture('ol.docx')]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('- One');
    expect(result.stdout).not.toMatch(/^\s*1\.\s/m);
  });
});
