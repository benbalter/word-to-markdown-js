import { convertBuffer } from '../../../src/worker-client.ts';
import { showConversionError } from './alerts.ts';
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

// Guards "Download .zip" against re-entry while it re-converts (the button
// stays enabled, and focused, so keyboard and screen-reader users keep their
// place).
let zipInProgress = false;

// Download a .zip containing the Markdown (with relative image links) plus an
// images/ folder. Re-runs the conversion in extract mode against the retained
// source bytes, then bundles the result with JSZip (already a dependency).
export async function downloadZip(): Promise<void> {
  const buffer = session.lastConvertedBuffer;
  if (!buffer || zipInProgress) return;
  const button = document.getElementById('download-zip-button');
  const baseName = downloadBaseName();

  // Mark the button busy rather than disabling it: disabling a focused button
  // drops focus to <body>. The re-conversion can take a moment, so say so.
  zipInProgress = true;
  button?.setAttribute('aria-disabled', 'true');
  button?.setAttribute('aria-busy', 'true');
  announce(uiString('converting'));
  try {
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

    flashConfirmed(
      'download-zip-button',
      'download-zip-label',
      uiString('downloadedZip'),
    );
  } catch (error) {
    showConversionError(error);
  } finally {
    zipInProgress = false;
    button?.removeAttribute('aria-disabled');
    button?.removeAttribute('aria-busy');
  }
}
