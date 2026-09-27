import { execFileSync, spawnSync } from 'child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
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

// build/ is gitignored. CI runs `npm run build` before the tests,
// and local dev usually has build/ already, but build it here if it's missing
// or older than the sources, so the suite never exercises a stale CLI.
const isStale = (): boolean =>
  !existsSync(cliPath) ||
  ['src/cli.ts', 'src/main.ts'].some(
    (src) => statSync(path.join(root, src)).mtimeMs > statSync(cliPath).mtimeMs,
  );

beforeAll(() => {
  if (isStale()) {
    execFileSync(process.execPath, [tscPath], { cwd: root, stdio: 'inherit' });
  }
}, 60000);

interface CliResult {
  stdout: string;
  stderr: string;
  status: number;
}

function runCli(args: string[]): CliResult {
  // spawnSync (unlike execFileSync) captures stderr on success too, so
  // assertions about warnings on a clean exit actually see the stream.
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status ?? 1,
  };
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

  it('-o writes Markdown to a file, creating its directory', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'w2m-cli-'));
    try {
      const out = path.join(dir, 'nested', 'doc.md');
      const { stdout, status } = runCli([fixture('h1.docx'), '-o', out]);
      expect(status).toBe(0);
      expect(stdout).toBe('');
      const written = readFileSync(out, 'utf8');
      expect(written).toContain('# Heading 1');
      expect(written.endsWith('\n')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('-o with --image-dir writes images next to the Markdown file', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'w2m-cli-'));
    try {
      const out = path.join(dir, 'out', 'doc.md');
      const { status } = runCli([
        fixture('image.docx'),
        '-o',
        out,
        '--image-dir',
        'img/',
        '--strip-images',
      ]);
      expect(status).toBe(0);
      // The link is relative to doc.md, so the file must live beside it.
      expect(readFileSync(out, 'utf8')).toContain('](img/image1.png)');
      expect(existsSync(path.join(dir, 'out', 'img', 'image1.png'))).toBe(true);
      expect(existsSync(path.join(root, 'img'))).toBe(false);
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

  it('prints conversion warnings to stderr on a clean exit', () => {
    const result = runCli([fixture('dropped-content.docx')]);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('Warning:');
    expect(result.stdout).not.toContain('Warning:');
  });

  it('drops underlines by default and keeps them with --underline', () => {
    expect(runCli([fixture('underline.docx')]).stdout).not.toContain('<u>');
    const result = runCli(['--underline', fixture('underline.docx')]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('<u>underlined</u>');
  });

  it('--preserve-footnotes keeps raw footnote markup', () => {
    expect(runCli([fixture('footnote.docx')]).stdout).toContain('[^1]');
    const result = runCli(['--preserve-footnotes', fixture('footnote.docx')]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('#footnote-1');
    expect(result.stdout).not.toContain('[^1]');
  });

  it('--verbose adds the underlying cause to a failure', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'w2m-cli-'));
    try {
      const bad = path.join(dir, 'bad.docx');
      writeFileSync(bad, 'not a zip');
      const quiet = runCli([bad]);
      expect(quiet.status).toBe(1);
      expect(quiet.stderr).not.toContain('Caused by:');
      const verbose = runCli(['--verbose', bad]);
      expect(verbose.status).toBe(1);
      expect(verbose.stderr).toContain('Invalid file');
      expect(verbose.stderr).toContain('Caused by:');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--bullet-lists converts numbered lists to bullets', () => {
    const result = runCli(['--bullet-lists', fixture('ol.docx')]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('- One');
    expect(result.stdout).not.toMatch(/^\s*1\.\s/m);
  });
});
