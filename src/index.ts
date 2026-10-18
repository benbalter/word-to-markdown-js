// The word2md.com converter UI: wires the file input, drag-and-drop, paste,
// and result buttons to the conversion worker. The pieces live in their own
// modules: the worker client next to the worker it drives (src/), the UI
// under web/scripts/converter/. Like them, this file runs only in the
// browser: Astro/Vite bundles it, and tsc leaves it out of build/.
import {
  convertBuffer,
  convertPastedHtml,
  prefetchWorker,
  type ConversionResult,
} from './worker-client.ts';
import {
  conversionErrorMessage,
  showConversionError,
  showError,
  showWarnings,
} from '../web/scripts/converter/alerts.ts';
import { recordConversion } from '../web/scripts/converter/analytics.ts';
import {
  MAX_BATCH_FILES,
  markSelected,
  renderBatchList,
  setBatchMode,
  uniqueBaseNames,
  type BatchEntry,
} from '../web/scripts/converter/batch.ts';
import {
  announce,
  flashConfirmed,
  hasInlineImages,
  primaryAction,
  replayClass,
  setImageMode,
} from '../web/scripts/converter/dom.ts';
import {
  downloadAll,
  downloadMarkdown,
  downloadZip,
} from '../web/scripts/converter/downloads.ts';
import { rejectionFor } from '../web/scripts/converter/files.ts';
import {
  prefetchRenderer,
  renderPreview,
} from '../web/scripts/converter/preview.ts';
import { session } from '../web/scripts/converter/session.ts';
import { fillCounts, uiString } from '../web/scripts/converter/strings.ts';
import { localizeWarnings } from '../web/scripts/converter/warnings.ts';

// Speculatively start the conversion worker so the first conversion resolves
// from cache instead of waiting on a download. Runs at most once, only on user
// intent or browser idle — never on initial paint, so it never competes with
// critical resources. The preview renderer isn't part of this: it loads when a
// conversion starts (see startBusy).
let converterWarmed = false;
function prefetchConverter(): void {
  if (converterWarmed) return;
  converterWarmed = true;
  prefetchWorker();
}

// Copy the converted Markdown with the async Clipboard API. The write starts
// synchronously inside the click handler (no await before it) so browsers that
// require transient user activation, notably iOS Safari, still honor it.
function copyMarkdown(): void {
  const markdown = session.lastMarkdown;
  if (!markdown) return;
  const copyFailed = (): void => {
    // Clipboard access can be denied (permissions policy, insecure context,
    // older browsers). Say so instead of failing silently; the alert's
    // role="alert" announces it.
    showError(uiString('copyFailed'));
  };
  // navigator.clipboard is undefined outside secure contexts.
  if (typeof navigator.clipboard?.writeText !== 'function') {
    copyFailed();
    return;
  }
  navigator.clipboard.writeText(markdown).then(() => {
    flashConfirmed('copy-button', 'copy-label', uiString('copied'));
    // Light up the Markdown panel: that's exactly what's on the clipboard now.
    replayClass(document.querySelector('.md-panel'), 'is-lit');
  }, copyFailed);
}

// Enter a busy state before reading (a large file takes a moment to read):
// mark the input region busy, spin the dropzone icon, and announce progress,
// so a slow conversion isn't a silent, frozen-looking wait. The dropzone stays
// visible until the results reveal, so the spinner is the immediate visual
// feedback for the drop. The preview renderer downloads alongside the
// conversion, so a visitor who never converts never fetches it, and it's
// usually ready by the result.
function startBusy(status: string): void {
  prefetchRenderer();
  document.getElementById('error-alert')?.remove();
  document.getElementById('input')?.setAttribute('aria-busy', 'true');
  document.getElementById('dropzone')?.classList.add('is-converting');
  announce(status);
}

// Leave the busy state (the batch progress line too). `clearStatus` also
// clears the "Converting…" announcement, for when no result replaces it.
function endBusy(clearStatus = false): void {
  document.getElementById('input')?.removeAttribute('aria-busy');
  document.getElementById('dropzone')?.classList.remove('is-converting');
  document.getElementById('batch-progress')?.classList.add('hidden');
  if (clearStatus) announce('');
}

// Convert a single file. Shared by the file-input change handler and the
// drag-and-drop handler so both entry points behave identically.
async function processFile(file: File | undefined): Promise<void> {
  if (!file) return;
  // Paste and page-wide drops skip the dropzone's intent listeners, and the idle
  // prefetch is skipped on low-data connections, so warm (and bind the copy
  // button) here too. Idempotent.
  prefetchConverter();

  const rejection = rejectionFor(file);
  if (rejection) {
    // A rejected file still supersedes a conversion in flight: otherwise that
    // result lands later, hides the input, and this error with it.
    if (document.getElementById('input')?.hasAttribute('aria-busy')) {
      session.activeConversion++;
      endBusy(true);
    }
    showError(rejection, file.name);
    return;
  }

  await runConversion(file.name, async () => {
    const buffer = await file.arrayBuffer();
    return { buffer, result: await convertBuffer(buffer) };
  });
}

// Convert HTML pasted onto the page (copied from Word, Google Docs, or a web
// page). The result is named like a file so the downloads have a name.
function processPastedHtml(html: string): void {
  prefetchConverter();
  void runConversion(PASTED_NAME, async () => ({
    buffer: null,
    result: await convertPastedHtml(html),
  }));
}

const PASTED_NAME = 'pasted.md';

// A paste into a text field belongs to the field, not the converter.
function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement)
  );
}

// Put one converted document in the result panels: its warnings (dropping a
// previous document's), name, and Markdown, with "Download .zip" offered only
// when it has images (inline mode embeds them as base64 data URIs) and there's
// a .docx to re-convert. The raw Markdown is the primary output, and the
// copy/download source; the HTML preview is rendered afterwards, off the
// critical path, so its render doesn't sit between the drop and the user
// seeing their result. The previous document's preview is cleared first so it
// can't linger if this render fails. textContent, not innerText: the <pre>
// keeps the newlines, and innerText would build a <br> per line (slow on a long
// document).
function showDocument(
  fileName: string,
  markdown: string,
  warnings: { lines: string[]; technical: string[] },
  buffer: ArrayBuffer | null,
): void {
  document.getElementById('warning-alert')?.remove();
  if (warnings.lines.length > 0) {
    showWarnings(warnings.lines, warnings.technical);
  }

  session.lastMarkdown = markdown;
  const outputElement = document.getElementById('output');
  if (outputElement) outputElement.textContent = markdown;
  const renderedElement = document.getElementById('rendered');
  if (renderedElement) renderedElement.innerHTML = '';

  const filenameElement = document.getElementById('filename');
  if (filenameElement) filenameElement.textContent = fileName;

  // In a batch, the combined .zip covers every file's images instead.
  session.lastConvertedBuffer = buffer;
  if (session.batch.length === 0) {
    setImageMode(buffer !== null && hasInlineImages(markdown));
  }
}

// Swap the input for the results, and say so.
function revealResults(announcement: string): void {
  document.getElementById('input')?.classList.add('hidden');

  const resultsElement = document.getElementById('results');
  resultsElement?.classList.remove('hidden');

  // Hide the pre-conversion sections (How It Works, the conversion table,
  // the CLI callout, the FAQ) and the standalone promo card: the page is now
  // about this result. The results pane carries its own quiet Open & Async
  // pitch, so this also avoids stacking two asks.
  document.getElementById('pre-result')?.classList.add('hidden');

  // Announce success to assistive tech (the results reveal is otherwise
  // silent) and move focus to the first result action so keyboard users
  // aren't stranded on the now-hidden file input.
  announce(announcement);
  // Bring the result into view: it lands where the dropzone was, below the
  // hero, which on a phone leaves it entirely off screen. Scroll first, then
  // focus without scrolling so the two don't fight. scrollIntoView and
  // matchMedia are optional chained so a browser lacking either still shows
  // the result.
  const reduceMotion = window.matchMedia?.(
    '(prefers-reduced-motion: reduce)',
  )?.matches;
  resultsElement?.scrollIntoView?.({
    behavior: reduceMotion ? 'auto' : 'smooth',
    block: 'start',
  });
  primaryAction()?.focus({ preventScroll: true });
  // The finished result lights up like an added diff hunk (decoration only;
  // nothing above waits on it).
  replayClass(document.querySelector('.md-panel'), 'is-lit');
  replayClass(document.getElementById('filename'), 'is-lit');
}

// Leave batch mode for a single document's result.
function endBatch(): void {
  session.batch = [];
  document.getElementById('batch-list')?.replaceChildren();
  document.getElementById('batch-note')?.classList.add('hidden');
  setBatchMode(false);
}

// Run a conversion and show its result, shared by files and pasted HTML.
// `fileName` is shown with the result; `buffer`, a .docx's bytes, is kept for
// "Download .zip" (null for pasted HTML, which has no file to re-convert).
async function runConversion(
  fileName: string,
  convert: () => Promise<{
    buffer: ArrayBuffer | null;
    result: ConversionResult;
  }>,
): Promise<void> {
  // Only the most recent file wins: a result (or error) from a conversion that
  // was superseded by a newer drop is discarded.
  const token = ++session.activeConversion;
  const isCurrent = (): boolean => token === session.activeConversion;

  startBusy(uiString('converting'));
  try {
    const { buffer, result } = await convert();
    if (!isCurrent()) return;
    endBusy();
    endBatch();
    showDocument(
      fileName,
      result.markdown,
      localizeWarnings(result.warningDetails),
      buffer,
    );
    revealResults(uiString('conversionAnnouncement'));
    recordConversion('success');

    // Render the HTML preview last, off the interaction's critical path.
    void renderPreview(
      document.getElementById('rendered'),
      result.markdown,
      isCurrent,
    );
  } catch (error) {
    if (!isCurrent()) return;
    endBusy(true);
    recordConversion('error');
    // Pasted HTML has no file for the error to name.
    showConversionError(error, fileName === PASTED_NAME ? undefined : fileName);
  }
}

// Convert several files, one after another in the same worker (so only one
// document's pipeline is in memory at a time), then list them all: one bad
// file is reported in its row without stopping the rest. Up to
// MAX_BATCH_FILES; any beyond that are left out, and the note says so.
async function processBatch(files: File[]): Promise<void> {
  prefetchConverter();
  const token = ++session.activeConversion;
  const isCurrent = (): boolean => token === session.activeConversion;

  const batch = files.slice(0, MAX_BATCH_FILES);
  const bases = uniqueBaseNames(batch.map((file) => file.name));
  const progress = document.getElementById('batch-progress');
  const entries: BatchEntry[] = [];
  for (const [index, file] of batch.entries()) {
    // Announced, and shown under the spinning dropzone (aria-hidden there, so
    // it isn't read twice).
    const status = fillCounts(uiString('batchProgress'), {
      current: index + 1,
      total: batch.length,
    });
    if (index === 0) startBusy(status);
    else announce(status);
    if (progress) {
      progress.textContent = status;
      progress.classList.remove('hidden');
    }

    const entry: BatchEntry = { name: file.name, base: bases[index] };
    const rejection = rejectionFor(file);
    if (rejection) {
      entry.error = rejection;
    } else {
      try {
        const buffer = await file.arrayBuffer();
        const result = await convertBuffer(buffer);
        entry.markdown = result.markdown;
        entry.warnings = localizeWarnings(result.warningDetails);
        // Only a document with images needs its bytes again, for the .zip.
        entry.buffer = hasInlineImages(result.markdown) ? buffer : null;
        recordConversion('success');
      } catch (error) {
        entry.error = conversionErrorMessage(error, file.name);
        recordConversion('error');
      }
      // A newer drop, or Convert another, replaced this batch.
      if (!isCurrent()) return;
    }
    entries.push(entry);
  }
  endBusy();
  showBatch(entries, files.length > batch.length);
}

// Show a finished batch: the list, the first converted file in the panels,
// and "Download all" as the next action.
function showBatch(entries: BatchEntry[], leftSomeOut: boolean): void {
  const converted = entries.filter((entry) => entry.markdown !== undefined);
  session.batch = entries;
  setBatchMode(true, converted.length > 0);

  const list = document.getElementById('batch-list');
  const select = (entry: BatchEntry): void => {
    // Supersede the previous file's preview render.
    const token = ++session.activeConversion;
    showDocument(
      entry.name,
      entry.markdown ?? '',
      entry.warnings ?? { lines: [], technical: [] },
      entry.buffer ?? null,
    );
    if (list) markSelected(list, entries.indexOf(entry));
    void renderPreview(
      document.getElementById('rendered'),
      entry.markdown ?? '',
      () => token === session.activeConversion,
    );
  };
  if (list) renderBatchList(list, entries, select);

  const note = document.getElementById('batch-note');
  if (note) {
    note.textContent = leftSomeOut
      ? fillCounts(uiString('tooManyFiles'), { max: MAX_BATCH_FILES })
      : '';
    note.classList.toggle('hidden', !leftSomeOut);
  }

  document.getElementById('warning-alert')?.remove();
  if (converted.length > 0) {
    select(converted[0]);
  } else {
    // Nothing to show: drop the previous document, whose panels are hidden.
    session.lastMarkdown = '';
    session.lastConvertedBuffer = null;
    const rendered = document.getElementById('rendered');
    if (rendered) rendered.innerHTML = '';
  }

  const failed = converted.length < entries.length;
  revealResults(
    converted.length === 0
      ? uiString('batchSomeFailed')
      : failed
        ? `${uiString('conversionAnnouncement')} ${uiString('batchSomeFailed')}`
        : uiString('conversionAnnouncement'),
  );
}

// Convert the given files: one as a single document, several as a batch.
function processFiles(files: ArrayLike<File> | null | undefined): void {
  if (!files || files.length === 0) return;
  if (files.length === 1) void processFile(files[0]);
  else void processBatch(Array.from(files));
}

function initDragAndDrop(dropzone: HTMLElement): void {
  // A drop anywhere on the page converts, not just on the dropzone: a near-miss,
  // or a second document dropped onto the results after the input is hidden.
  // Cancelling the default also stops the browser opening the file and
  // discarding the page. Drops on the dropzone are handled (once) below.
  window.addEventListener('dragover', (event: DragEvent) => {
    event.preventDefault();
  });
  window.addEventListener('drop', (event: DragEvent) => {
    event.preventDefault();
    if (dropzone.contains(event.target as Node)) return;
    processFiles(event.dataTransfer?.files);
  });

  const activate = (event: DragEvent): void => {
    event.preventDefault();
    dropzone.classList.add('is-dragover');
  };

  dropzone.addEventListener('dragenter', activate);
  dropzone.addEventListener('dragover', activate);

  dropzone.addEventListener('dragleave', (event: DragEvent) => {
    // Ignore dragleave events bubbling from child elements.
    if (!dropzone.contains(event.relatedTarget as Node)) {
      dropzone.classList.remove('is-dragover');
    }
  });

  dropzone.addEventListener('drop', (event: DragEvent) => {
    event.preventDefault();
    dropzone.classList.remove('is-dragover');
    processFiles(event.dataTransfer?.files);
  });
}

// Reset the converter back to its initial state so another document can be
// dropped without reloading the page.
function resetConverter(): void {
  // Clear the file input so re-selecting the same file still fires "change".
  const fileInput = document.getElementById('file') as HTMLInputElement | null;
  if (fileInput) fileInput.value = '';

  // Discard any in-flight conversion or preview render, and the old preview.
  session.activeConversion++;
  const rendered = document.getElementById('rendered');
  if (rendered) rendered.innerHTML = '';

  // Drop the retained bytes (and a batch's results), and hand the accent back
  // to Copy (re-hiding the zip button and its note) for the next document.
  endBatch();
  session.lastConvertedBuffer = null;
  session.lastMarkdown = '';
  setImageMode(false);

  document.getElementById('error-alert')?.remove();
  document.getElementById('warning-alert')?.remove();

  document.getElementById('results')?.classList.add('hidden');
  document.getElementById('input')?.classList.remove('hidden');

  // Restore the pre-conversion sections that a successful conversion hid.
  document.getElementById('pre-result')?.classList.remove('hidden');

  // Clear the live status region so a prior success isn't re-announced.
  announce('');

  // Return focus to the file input (inside the dropzone) for keyboard users.
  fileInput?.focus();
}

document.addEventListener('DOMContentLoaded', () => {
  const inputElement = document.getElementById(
    'file',
  ) as HTMLInputElement | null;
  inputElement?.addEventListener(
    'change',
    function (this: HTMLInputElement): void {
      // Copy the list before clearing the input, which empties it; the Files
      // stay readable. Clearing means picking the same file again (e.g. after
      // fixing it following an error) still fires "change".
      const files = Array.from(this.files ?? []);
      this.value = '';
      processFiles(files);
    },
    false,
  );

  // Pasting a copied .docx (e.g. from Finder or Explorer) converts it. Only
  // Word files count: copying from Word or Excel often puts an image rendition
  // on the clipboard too, and plain-text pastes carry no files at all.
  // Without a .docx, pasted rich text (copied from Word, Google Docs, or a web
  // page arrives as text/html) converts too. Plain text has no structure to
  // convert, so it's left alone.
  document.addEventListener('paste', (event: ClipboardEvent) => {
    const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
      /\.docx?$/i.test(file.name),
    );
    if (files.length > 0) {
      event.preventDefault();
      processFiles(files);
      return;
    }
    const html = event.clipboardData?.getData('text/html') ?? '';
    if (!html.trim() || isEditable(event.target)) return;
    event.preventDefault();
    processPastedHtml(html);
  });

  const dropzone = document.getElementById('dropzone');
  if (dropzone) {
    initDragAndDrop(dropzone);
    // Warm the converter on intent — hovering, focusing, or dragging onto the
    // dropzone all signal an imminent conversion.
    for (const evt of ['pointerenter', 'focusin', 'dragenter']) {
      dropzone.addEventListener(evt, prefetchConverter, {
        once: true,
        passive: true,
      });
    }
  }

  // ...and during idle time even without interaction, unless the visitor is on
  // a metered/slow connection (don't spend their data speculatively).
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  const lowData =
    connection?.saveData === true ||
    /(^|-)2g$/.test(connection?.effectiveType ?? '');
  if (!lowData) {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(prefetchConverter, { timeout: 4000 });
    } else {
      window.setTimeout(prefetchConverter, 2000);
    }
  }

  // The output panels are focusable (tabindex) so a click focuses them; scope
  // Ctrl/Cmd+A to the focused panel instead of selecting the whole page.
  for (const panel of document.querySelectorAll<HTMLElement>(
    '[data-select-all]',
  )) {
    panel.addEventListener('keydown', (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== 'a' ||
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }
      event.preventDefault();
      window.getSelection()?.selectAllChildren(panel);
    });
  }

  document
    .getElementById('copy-button')
    ?.addEventListener('click', copyMarkdown);
  document
    .getElementById('download-button')
    ?.addEventListener('click', downloadMarkdown);
  document
    .getElementById('download-zip-button')
    ?.addEventListener('click', () => void downloadZip());
  document
    .getElementById('download-all-button')
    ?.addEventListener('click', () => void downloadAll());
  document
    .getElementById('convert-another')
    ?.addEventListener('click', resetConverter);

  // Theme changes are handled automatically by CSS using prefers-color-scheme.
});
