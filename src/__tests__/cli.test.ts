import { spawnSync } from 'child_process';
import { Document, Packer, Paragraph } from 'docx';
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
const fixture = (name: string): string =>
  path.join(root, 'src/__fixtures__', name);

// build/ is gitignored; jest.global-setup.mjs builds it (once, before any
// worker starts) if it's missing or older than the sources.

interface CliResult {
  stdout: string;
  stderr: string;
  status: number;
}

function runCli(args: string[], stdin?: Buffer): CliResult {
  // spawnSync (unlike execFileSync) captures stderr on success too, so
  // assertions about warnings on a clean exit actually see the stream. Its
  // stdin is a pipe, never a TTY, and `stdin` (if given) is written to it.
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: root,
    encoding: 'utf8',
    input: stdin,
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

  it('reads the .docx from stdin with - or with no file argument', () => {
    const docx = readFileSync(fixture('h1.docx'));
    for (const args of [['-'], []]) {
      const result = runCli(args, docx);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('# Heading 1');
    }
  });

  it('explains an empty stdin instead of failing obscurely', () => {
    const result = runCli(['-'], Buffer.alloc(0));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Nothing was piped to stdin');
  });

  it('keeps the typed errors for bad bytes on stdin', () => {
    const result = runCli(['-'], Buffer.from('not a zip'));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid file');
  });

  it('-o - writes to stdout rather than a file named "-"', () => {
    const result = runCli(['-o', '-', fixture('h1.docx')]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('# Heading 1');
    expect(result.stderr).not.toContain('Wrote Markdown');
    expect(existsSync(path.join(root, '-'))).toBe(false);
  });

  it('--quiet hides warnings and progress notes but not errors', () => {
    const warned = runCli(['--quiet', fixture('dropped-content.docx')]);
    expect(warned.status).toBe(0);
    expect(warned.stderr.trim()).toBe('');
    expect(warned.stdout.length).toBeGreaterThan(0);
    const failed = runCli(['--quiet', fixture('does-not-exist.docx')]);
    expect(failed.status).toBe(1);
    expect(failed.stderr).toContain('Error:');
  });

  it('--strict exits 2 when there are warnings, still writing the Markdown', () => {
    const warned = runCli(['--strict', fixture('dropped-content.docx')]);
    expect(warned.status).toBe(2);
    expect(warned.stdout.length).toBeGreaterThan(0);
    expect(warned.stderr).toContain('Warning:');
    expect(runCli(['--strict', fixture('h1.docx')]).status).toBe(0);
  });

  it('--help shows usage examples, and points at the full option list', () => {
    for (const args of [['--help'], ['convert', '--help']]) {
      const result = runCli(args);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Examples:');
      expect(result.stdout).toContain('cat report.docx | w2m');
    }
    expect(runCli(['--help']).stdout).toContain('w2m convert --help');
    expect(runCli(['convert', '--help']).stdout).toContain('--strict');
  });

  it('--bullet-lists converts numbered lists to bullets', () => {
    const result = runCli(['--bullet-lists', fixture('ol.docx')]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('- One');
    expect(result.stdout).not.toMatch(/^\s*1\.\s/m);
  });

  it('--quotes picks how curly quotes are treated', async () => {
    const docx = await Packer.toBuffer(
      new Document({
        sections: [
          {
            children: [
              new Paragraph('会议指出：“各单位要按照《通知》要求，及时上报。”'),
            ],
          },
        ],
      }),
    );
    expect(runCli([], docx).stdout).toContain('“各单位');
    expect(runCli(['--quotes', 'ascii'], docx).stdout).toContain('"各单位');
    const rejected = runCli(['--quotes', 'smart'], docx);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain('auto, ascii, preserve');
  });
});
