import { convertBuffer } from '../../../src/worker-client.ts';
import { showConversionError } from './alerts.ts';
import { zipLayout } from './batch.ts';
import { announce, flashConfirmed } from './dom.ts';
import { session } from './session.ts';
import { uiString } from './strings.ts';

// Save a Blob to the user's device under the given filename, via a temporary
// object URL and a synthetic <a download> click.
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking synchronously can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// The source document's name without its .docx extension, used to name
// downloads.
function downloadBaseName(): string {
  const sourceName =
    document.getElementById('filename')?.textContent ?? 'document';
  // .md too: pasted HTML is shown as pasted.md.
  return sourceName.replace(/\.(?:docx|md)$/i, '') || 'document';
}

// Download the converted Markdown as a .md file named after the source document.
export function downloadMarkdown(): void {
  const markdown = session.lastMarkdown;
  if (!markdown) return;
  saveBlob(
    new Blob([markdown], { type: 'text/markdown;charset=utf-8' }),
    `${downloadBaseName()}.md`,
  );
  // Briefly confirm the download on the button label.
  flashConfirmed('download-button', 'download-label', uiString('downloaded'));
}

// Guards "Download .zip" and "Download all" against re-entry while they
// re-convert (the button stays enabled, and focused, so keyboard and
// screen-reader users keep their place).
let zipInProgress = false;

// Run a .zip download: mark its button busy rather than disabling it
// (disabling a focused button drops focus to <body>), say that it's working,
// since the re-conversion can take a moment, and confirm or report the result.
async function zipDownload(
  buttonId: string,
  labelId: string,
  build: () => Promise<void>,
): Promise<void> {
  if (zipInProgress) return;
  const button = document.getElementById(buttonId);
  zipInProgress = true;
  button?.setAttribute('aria-disabled', 'true');
  button?.setAttribute('aria-busy', 'true');
  announce(uiString('converting'));
  try {
    await build();
    flashConfirmed(buttonId, labelId, uiString('downloadedZip'));
  } catch (error) {
    showConversionError(error);
  } finally {
    zipInProgress = false;
    button?.removeAttribute('aria-disabled');
    button?.removeAttribute('aria-busy');
  }
}

// Download a .zip containing the Markdown (with relative image links) plus an
// images/ folder. Re-runs the conversion in extract mode against the retained
// source bytes, then bundles the result with JSZip (already a dependency).
export async function downloadZip(): Promise<void> {
  const buffer = session.lastConvertedBuffer;
  if (!buffer) return;
  const baseName = downloadBaseName();
  await zipDownload('download-zip-button', 'download-zip-label', async () => {
    const [{ default: JSZip }, result] = await Promise.all([
      import('jszip'),
      convertBuffer(buffer, true),
    ]);

    const zip = new JSZip();
    zip.file(`${baseName}.md`, result.markdown);
    for (const image of result.images ?? []) {
      zip.file(image.path, image.bytes);
    }
    saveBlob(await zip.generateAsync({ type: 'blob' }), `${baseName}.zip`);
  });
}

// Download one .zip of every file in the batch that converted: each one's
// Markdown at the top level, with its images (re-converted from the retained
// bytes, as in downloadZip) in a folder of its own. A file without images
// needs no re-conversion: its on-screen Markdown is the same either way.
export async function downloadAll(): Promise<void> {
  const converted = session.batch.filter(
    (entry) => entry.markdown !== undefined,
  );
  if (converted.length === 0) return;
  await zipDownload('download-all-button', 'download-all-label', async () => {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const layout = zipLayout(converted.map((entry) => entry.base));
    for (const [index, entry] of converted.entries()) {
      const { markdown, imageDir } = layout[index];
      if (!entry.buffer) {
        zip.file(markdown, entry.markdown ?? '');
        continue;
      }
      // One at a time, like the conversions themselves, to bound memory.
      const result = await convertBuffer(entry.buffer, true, imageDir);
      zip.file(markdown, result.markdown);
      for (const image of result.images ?? []) {
        zip.file(image.path, image.bytes);
      }
    }
    saveBlob(await zip.generateAsync({ type: 'blob' }), 'markdown.zip');
  });
}
