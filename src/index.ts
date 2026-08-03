import type { ExtractedImage } from './main.js';

// Upper bound on the file we'll attempt to read into memory and convert
// client-side. Comfortably above any real Word document; guards against a
// mistaken drop of a huge file freezing the tab.
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// Captured default label + reset timer for the download button's transient
// "Downloaded" confirmation (mirrors the copy button). Initialized on load.
let downloadLabelDefault = '';
let downloadResetTimer: number | undefined;
// Same, for the "Download .zip" button (shown only when a doc has images).
let downloadZipLabelDefault = '';
let downloadZipResetTimer: number | undefined;
// The most recently converted document's bytes, retained so "Download .zip" can
// re-run the conversion in extract mode (the on-screen Markdown inlines images
// as base64; the zip needs them as separate files).
let lastConvertedBuffer: ArrayBuffer | null = null;

// The Word→Markdown converter and the Markdown→HTML renderer pull in heavy
// dependencies (mammoth, turndown, jszip, unified/remark/rehype, prettier,
// markdownlint — ~400KB gzipped). They are dynamically imported on first use so
// the landing page paints without that payload; the chunk loads only once a
// file is actually provided.

// Render Markdown to sanitized HTML for the preview pane.
async function renderMarkdown(markdown: string): Promise<string> {
  const [
    { unified },
    { default: remarkParse },
    { default: remarkGfm },
    { default: remarkRehype },
    { default: rehypeSanitize },
    { default: rehypeStringify },
  ] = await Promise.all([
    import('unified'),
    import('remark-parse'),
    import('remark-gfm'),
    import('remark-rehype'),
    import('rehype-sanitize'),
    import('rehype-stringify'),
  ]);

  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize)
    .use(rehypeStringify)
    .process(markdown);

  return String(result);
}

// Fill the preview pane with the rendered Markdown, kept off the interaction's
// critical path. A frame is yielded first so the results reveal (the raw
// Markdown) paints before this main-thread render/parse begins — on a large or
// complex document the unified/rehype pass plus its innerHTML parse is a
// multi-second long task. A failure here is non-fatal: the raw Markdown (the
// primary output, and the copy/download source) is already on screen.
async function renderPreview(
  target: HTMLElement | null,
  markdown: string,
): Promise<void> {
  if (!target) return;
  try {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    target.innerHTML = await renderMarkdown(markdown);
  } catch (error) {
    console.error(error);
  }
}

// --- Off-main-thread conversion --------------------------------------------
// The docx→Markdown pipeline is CPU-bound; running it in a Web Worker keeps the
// page responsive (no frozen tab) on large or complex documents.
interface ConversionResult {
  markdown: string;
  warnings: string[];
  images?: ExtractedImage[];
}

// How long to wait for the worker to signal it has loaded before giving up and
// converting on the main thread instead. Only guards a broken/hung worker load,
// not the conversion itself (which is unbounded — it runs off-thread).
const WORKER_READY_TIMEOUT = 5000;

let converterWorker: Worker | null = null;
let workerReady: Promise<void> | null = null;
// Latches once the worker proves unusable, so we stop paying the readiness
// timeout on every subsequent conversion and go straight to the main thread.
let workerUnavailable = false;
let workerMessageId = 0;
const pendingConversions = new Map<
  number,
  { resolve: (r: ConversionResult) => void; reject: (e: unknown) => void }
>();

// Distinguishes a worker that failed to load/run (→ fall back to the main
// thread) from a genuine conversion error (→ surface it to the user).
class WorkerInfraError extends Error {}

// Reject and clear all in-flight conversions, then drop the worker so the next
// attempt uses the main-thread fallback.
function failWorker(reason: string): void {
  for (const [id, pending] of pendingConversions) {
    pendingConversions.delete(id);
    pending.reject(new WorkerInfraError(reason));
  }
  converterWorker = null;
  workerReady = null;
  workerUnavailable = true;
}

function getConverterWorker(): Worker {
  if (converterWorker) return converterWorker;
  const worker = new Worker(new URL('./converter.worker.ts', import.meta.url), {
    type: 'module',
  });
  workerReady = new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new WorkerInfraError('worker did not become ready'));
      failWorker('worker did not become ready');
    }, WORKER_READY_TIMEOUT);
    worker.onmessage = (event: MessageEvent): void => {
      const data = event.data;
      if (data?.type === 'ready') {
        window.clearTimeout(timer);
        resolve();
        return;
      }
      const { id, ok, result, error } = data;
      const pending = pendingConversions.get(id);
      if (!pending) return;
      pendingConversions.delete(id);
      if (ok) pending.resolve(result as ConversionResult);
      else pending.reject(error);
    };
    worker.onerror = (): void => {
      window.clearTimeout(timer);
      reject(new WorkerInfraError('conversion worker failed'));
      failWorker('conversion worker failed');
    };
  });
  // A rejected readiness promise is handled by whoever awaits it in
  // convertBuffer; attach a no-op catch so it isn't an unhandled rejection.
  workerReady.catch(() => {});
  converterWorker = worker;
  return worker;
}

function convertViaWorker(
  buffer: ArrayBuffer,
  extract = false,
): Promise<ConversionResult> {
  const worker = getConverterWorker();
  const id = ++workerMessageId;
  return new Promise<ConversionResult>((resolve, reject) => {
    pendingConversions.set(id, { resolve, reject });
    // Structured-clone (don't transfer) the buffer so it stays valid for a
    // main-thread fallback if the worker turns out to be unavailable.
    worker.postMessage({ id, buffer, extract });
  });
}

// Convert an ArrayBuffer to Markdown, off the main thread when possible, with a
// transparent main-thread fallback (older browsers, or a worker that never
// loads or hangs). A genuine conversion error propagates; only infrastructure
// failures fall back.
async function convertBuffer(
  buffer: ArrayBuffer,
  extract = false,
): Promise<ConversionResult> {
  if (typeof Worker !== 'undefined' && !workerUnavailable) {
    try {
      getConverterWorker();
      await workerReady; // rejects (WorkerInfraError) on load timeout/failure
      return await convertViaWorker(buffer, extract);
    } catch (error) {
      if (!(error instanceof WorkerInfraError)) throw error;
    }
  }
  const { convertWithWarnings } = await import('./main.js');
  return convertWithWarnings(
    buffer,
    extract ? { images: 'extract' } : undefined,
  );
}

// True for legacy .doc files. Checked on the main thread because the worker
// only sees the file's bytes, not its name. Mirrors validateFileExtension.
function isLegacyDocFile(name: string): boolean {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  return dot !== -1 && lower.slice(dot) === '.doc';
}

// Conversion errors thrown in the worker arrive as { name, message } (class
// identity doesn't survive the boundary). Map known names back to their
// already-localized messages; anything else is an unexpected failure.
const CONVERSION_ERROR_NAMES = new Set([
  'UnsupportedFileError',
  'InvalidFileError',
  'ConversionError',
]);

function showConversionError(error: unknown): void {
  const name = (error as { name?: string })?.name;
  const message = (error as { message?: string })?.message;
  if (name && message && CONVERSION_ERROR_NAMES.has(name)) {
    showError(message);
    return;
  }
  showError(
    uiString(
      'errorGeneric',
      'An unexpected error occurred while converting the document. Please try again.',
    ),
  );
  console.error(error);
}

// Speculatively warm the heavy converter + Markdown-renderer chunks (~340KB
// gzipped) so the first conversion resolves from cache instead of waiting on a
// download. Runs at most once, only on user intent or browser idle — never on
// initial paint, so it never competes with critical resources.
let converterWarmed = false;
function prefetchConverter(): void {
  if (converterWarmed) return;
  converterWarmed = true;
  const ignore = (): void => {};
  // Warm the conversion worker (loads mammoth/turndown/jszip/etc. off-thread),
  // falling back to a main-thread import where Workers are unavailable so the
  // deps are still cached before the first conversion.
  if (typeof Worker !== 'undefined') {
    try {
      getConverterWorker();
    } catch {
      import('./main.js').catch(ignore);
    }
  } else {
    import('./main.js').catch(ignore);
  }
  // The Markdown-preview renderer still runs on the main thread.
  import('unified').catch(ignore);
  import('remark-parse').catch(ignore);
  import('remark-gfm').catch(ignore);
  import('remark-rehype').catch(ignore);
  import('rehype-sanitize').catch(ignore);
  import('rehype-stringify').catch(ignore);
  // ClipboardJS powers the post-conversion copy button. Load it lazily here
  // (never in the initial bundle) and bind it now — prefetchConverter always
  // runs on idle within a few seconds of load, well before any conversion
  // result gives the user something to copy.
  setupClipboard();
}

// Bind the copy button to ClipboardJS, importing the library on demand. Runs at
// most once; safe to call before the copy button is visible (it exists in the
// static markup from load).
let clipboardBound = false;
function setupClipboard(): void {
  if (clipboardBound) return;
  const copyButton = document.getElementById('copy-button');
  if (copyButton === null) return;
  clipboardBound = true;
  const copyLabel = document.getElementById('copy-label');
  const copyLabelDefault = copyLabel?.textContent ?? '';
  let copyResetTimer: number | undefined;
  void import('clipboard')
    .then(({ default: ClipboardJS }) => {
      const clipboard = new ClipboardJS('#copy-button');
      clipboard.on('success', (event) => {
        event.clearSelection();
        if (!copyLabel) return;
        // Flip the label to a transient confirmation, then restore it. Guard the
        // captured default against rapid re-clicks by resetting the timer.
        copyLabel.textContent = uiString('copied', 'Copied!');
        window.clearTimeout(copyResetTimer);
        copyResetTimer = window.setTimeout(() => {
          copyLabel.textContent = copyLabelDefault;
        }, 2000);
      });
    })
    .catch(() => {
      // If the clipboard chunk fails to load, the button simply does nothing
      // extra; the Markdown is still selectable manually.
      clipboardBound = false;
    });
}

// Record an anonymous "a conversion happened" signal so the hosted site can
// gauge whether the tool is still being used (and worth continuing to improve).
// It carries NO document content, filename, size, or any identifier — only the
// outcome (success/error) and the page's language, as a fire-and-forget ping to
// the Worker (worker/index.js), which writes a single Analytics Engine data
// point. Gated to the production host so self-hosted and local builds send
// nothing (the privacy policy promises no analytics when self-hosted), and fully
// guarded so a failure can never interfere with the conversion itself.
function recordConversion(outcome: 'success' | 'error'): void {
  try {
    if (window.location.hostname !== 'word2md.com') return;
    // Base language tag (e.g. "pt-BR" → "pt") to match the Worker's locale keys.
    const locale = (document.documentElement.lang || 'en').split('-')[0];
    const url = `/api/event?o=${outcome}&l=${encodeURIComponent(locale)}`;
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(url);
    } else {
      void fetch(url, { method: 'POST', keepalive: true }).catch(() => {});
    }
  } catch {
    /* analytics must never break a conversion */
  }
}

// Convert a single file. Shared by the file-input change handler and the
// drag-and-drop handler so both entry points behave identically.
async function processFile(file: File | undefined): Promise<void> {
  if (!file) return;

  // Reject legacy .doc files up front with the friendlier localized "save as
  // .docx" guidance. Done here (not in the worker) since only the main thread
  // sees the filename, and it avoids loading the converter for a doomed file.
  if (isLegacyDocFile(file.name)) {
    showError(
      uiString(
        'docFileError',
        'This tool reads modern .docx files, not older .doc files. In Word, open your document and choose File → Save As → Word Document (.docx), then drop the .docx here.',
      ),
    );
    return;
  }

  // Guard against files too large to convert comfortably in the browser —
  // reading a huge ArrayBuffer and running the pipeline can exhaust memory or
  // hang the tab, so fail fast with friendly guidance instead.
  if (file.size > MAX_FILE_SIZE) {
    showError(
      uiString(
        'fileTooLarge',
        'This file is too large to convert in your browser. Please try a .docx smaller than 20 MB.',
      ),
    );
    return;
  }

  const reader = new FileReader();
  reader.readAsArrayBuffer(file);
  reader.onload = async (): Promise<void> => {
    // Enter a busy state: mark the input region busy, spin the dropzone icon,
    // and announce progress, so a slow conversion (large/complex doc) isn't a
    // silent, frozen-looking wait. The dropzone stays visible until the results
    // reveal, so the spinner is the immediate visual feedback for the drop.
    const inputRegion = document.getElementById('input');
    const dropzone = document.getElementById('dropzone');
    const srStatus = document.getElementById('sr-status');
    inputRegion?.setAttribute('aria-busy', 'true');
    dropzone?.classList.add('is-converting');
    if (srStatus) {
      srStatus.textContent = uiString('converting', 'Converting…');
    }
    try {
      const result = await convertBuffer(reader.result as ArrayBuffer);
      inputRegion?.removeAttribute('aria-busy');
      dropzone?.classList.remove('is-converting');

      // Display warnings if any
      if (result.warnings.length > 0) {
        showWarnings(result.warnings);
      }

      // Reveal the results with the raw Markdown (the primary output, and the
      // copy/download source) straight away; the HTML preview is rendered
      // afterwards via renderPreview(), off the critical path, so its render
      // doesn't sit between the drop and the user seeing their result.
      const outputElement = document.getElementById('output');
      outputElement.innerText = result.markdown;

      const filenameElement = document.getElementById('filename');
      filenameElement.innerText = file.name;

      // Retain the source bytes and offer "Download .zip" only when the document
      // actually has images (inline mode embeds them as base64 data URIs).
      lastConvertedBuffer = reader.result as ArrayBuffer;
      const zipButton = document.getElementById('download-zip-button');
      if (zipButton) {
        zipButton.style.display = result.markdown.includes('data:image')
          ? 'inline-flex'
          : 'none';
      }

      const inputElement = document.getElementById('input');
      inputElement.classList.add('hidden');

      const resultsElement = document.getElementById('results');
      resultsElement.classList.remove('hidden');

      // The results pane carries its own contextual Open & Async pitch, so hide
      // the standalone promo card to avoid stacking two asks. The card stays for
      // visitors who never convert (it lives in the page flow below the input).
      // Set display inline rather than toggling `.hidden`: the card's scoped CSS
      // sets `display: flex` at equal specificity, so a class wouldn't reliably win.
      const promoCard = document.getElementById('promo-card');
      if (promoCard) promoCard.style.display = 'none';

      // Announce success to assistive tech (the results reveal is otherwise
      // silent) and move focus to the first result action so keyboard users
      // aren't stranded on the now-hidden file input.
      const status = document.getElementById('sr-status');
      if (status) {
        status.textContent = uiString(
          'conversionAnnouncement',
          'Conversion complete. Your Markdown is ready.',
        );
      }
      document.getElementById('copy-button')?.focus();

      recordConversion('success');

      // Render the HTML preview last, off the interaction's critical path.
      void renderPreview(document.getElementById('rendered'), result.markdown);
    } catch (error) {
      // Leave the busy state and clear the "Converting…" announcement.
      inputRegion?.removeAttribute('aria-busy');
      dropzone?.classList.remove('is-converting');
      if (srStatus) srStatus.textContent = '';
      recordConversion('error');
      showConversionError(error);
    }
  };
}

// Localized UI strings are rendered into the page as data-* attributes on the
// #input element (see Home.astro), keeping this module framework- and
// language-agnostic. Falls back to English when the attribute is absent (e.g.
// in unit tests that mount a bare DOM).
function uiString(
  key:
    | 'errorGeneric'
    | 'docFileError'
    | 'dismiss'
    | 'copied'
    | 'downloaded'
    | 'downloadedZip'
    | 'fileTooLarge'
    | 'conversionAnnouncement'
    | 'converting',
  fallback: string,
): string {
  const input = document.getElementById('input');
  const value = input?.dataset[key];
  return value && value.length > 0 ? value : fallback;
}

function showError(message: string): void {
  // Create or update error alert
  let errorElement = document.getElementById('error-alert');
  if (!errorElement) {
    errorElement = document.createElement('div');
    errorElement.id = 'error-alert';
    errorElement.setAttribute('role', 'alert');
    errorElement.className =
      'relative mb-4 flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-left text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200';

    const messageSpan = document.createElement('span');
    messageSpan.id = 'error-message';
    messageSpan.className = 'flex-1';

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', uiString('dismiss', 'Dismiss'));
    closeButton.className =
      'shrink-0 leading-none text-red-500/70 transition-colors hover:text-red-700 dark:hover:text-red-100';
    closeButton.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    closeButton.addEventListener('click', () => errorElement.remove());

    errorElement.appendChild(messageSpan);
    errorElement.appendChild(closeButton);

    const inputElement = document.getElementById('input');
    if (inputElement) {
      inputElement.insertBefore(errorElement, inputElement.firstChild);
    }
  }

  const messageElement = document.getElementById('error-message');
  messageElement.textContent = message;
  errorElement.classList.remove('hidden');
}

function showWarnings(warnings: string[]): void {
  // Remove any existing warning alerts
  const existingWarnings = document.getElementById('warning-alert');
  if (existingWarnings) {
    existingWarnings.remove();
  }

  const warningElement = document.createElement('div');
  warningElement.id = 'warning-alert';
  // role="alert" already implies an assertive live region; a separate
  // aria-live="polite" would conflict, so we rely on the role alone.
  warningElement.setAttribute('role', 'alert');
  warningElement.className =
    'relative mt-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200';

  const warningList = document.createElement('ul');
  warningList.className = 'flex-1 list-disc space-y-1 pl-4';
  warnings.forEach((warning) => {
    const listItem = document.createElement('li');
    listItem.textContent = warning;
    warningList.appendChild(listItem);
  });

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', uiString('dismiss', 'Dismiss'));
  closeButton.className =
    'shrink-0 leading-none text-amber-600/70 transition-colors hover:text-amber-800 dark:hover:text-amber-100';
  closeButton.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  closeButton.addEventListener('click', () => warningElement.remove());

  warningElement.appendChild(warningList);
  warningElement.appendChild(closeButton);

  const resultsElement = document.getElementById('results');
  if (resultsElement) {
    resultsElement.insertBefore(warningElement, resultsElement.firstChild);
  }
}

function initDragAndDrop(dropzone: HTMLElement): void {
  // Prevent the browser's default "open the dropped file" behaviour for drops
  // anywhere outside the dropzone — otherwise a near-miss (or any drop after the
  // input is hidden) navigates away and discards the page.
  const cancel = (event: DragEvent): void => event.preventDefault();
  window.addEventListener('dragover', cancel);
  window.addEventListener('drop', cancel);

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
    void processFile(event.dataTransfer?.files?.[0]);
  });
}

// Reset the converter back to its initial state so another document can be
// dropped without reloading the page.
function resetConverter(): void {
  // Clear the file input so re-selecting the same file still fires "change".
  const fileInput = document.getElementById('file') as HTMLInputElement | null;
  if (fileInput) fileInput.value = '';

  // Drop the retained bytes and re-hide the zip button for the next document.
  lastConvertedBuffer = null;
  const zipButton = document.getElementById('download-zip-button');
  if (zipButton) zipButton.style.display = 'none';

  document.getElementById('error-alert')?.remove();
  document.getElementById('warning-alert')?.remove();

  document.getElementById('results')?.classList.add('hidden');
  document.getElementById('input')?.classList.remove('hidden');

  // Restore the standalone promo card that a successful conversion hid.
  const promoCard = document.getElementById('promo-card');
  if (promoCard) promoCard.style.display = '';

  // Clear the live status region so a prior success isn't re-announced.
  const status = document.getElementById('sr-status');
  if (status) status.textContent = '';

  // Return focus to the file input (inside the dropzone) for keyboard users.
  fileInput?.focus();
}

// Download the converted Markdown as a .md file named after the source document.
function downloadMarkdown(): void {
  const markdown = document.getElementById('output')?.innerText ?? '';
  if (!markdown) return;
  const sourceName =
    document.getElementById('filename')?.innerText ?? 'document';
  const baseName = sourceName.replace(/\.docx$/i, '') || 'document';
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${baseName}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  // Briefly confirm the download on the button label.
  const label = document.getElementById('download-label');
  if (label) {
    label.textContent = uiString('downloaded', 'Downloaded');
    window.clearTimeout(downloadResetTimer);
    downloadResetTimer = window.setTimeout(() => {
      label.textContent = downloadLabelDefault;
    }, 2000);
  }
}

// Download a .zip containing the Markdown (with relative image links) plus an
// images/ folder. Re-runs the conversion in extract mode against the retained
// source bytes, then bundles the result with JSZip (already a dependency).
async function downloadZip(): Promise<void> {
  if (!lastConvertedBuffer) return;
  const button = document.getElementById(
    'download-zip-button',
  ) as HTMLButtonElement | null;
  const label = document.getElementById('download-zip-label');
  const sourceName =
    document.getElementById('filename')?.innerText ?? 'document';
  const baseName = sourceName.replace(/\.docx$/i, '') || 'document';

  if (button) button.disabled = true;
  try {
    const [{ default: JSZip }, result] = await Promise.all([
      import('jszip'),
      convertBuffer(lastConvertedBuffer, true),
    ]);

    const zip = new JSZip();
    zip.file(`${baseName}.md`, result.markdown);
    for (const image of result.images ?? []) {
      zip.file(image.path, image.bytes);
    }
    const blob = await zip.generateAsync({ type: 'blob' });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${baseName}.zip`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    if (label) {
      label.textContent = uiString('downloadedZip', 'Downloaded');
      window.clearTimeout(downloadZipResetTimer);
      downloadZipResetTimer = window.setTimeout(() => {
        label.textContent = downloadZipLabelDefault;
      }, 2000);
    }
  } catch (error) {
    showConversionError(error);
  } finally {
    if (button) button.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const inputElement = document.getElementById('file') as HTMLInputElement;
  inputElement.addEventListener(
    'change',
    function (this: HTMLInputElement): void {
      void processFile(this.files?.[0]);
    },
    false,
  );

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

  // Note: the copy button is bound by setupClipboard(), invoked from
  // prefetchConverter() on idle/intent — never here at DOMContentLoaded, so the
  // clipboard chunk stays off the initial-paint critical path. prefetchConverter
  // always runs within a few seconds (unconditional idle/timeout fallback below)
  // and on the first dropzone interaction, so the binding is in place well before
  // any conversion produces something to copy.

  const downloadButton = document.getElementById('download-button');
  if (downloadButton !== null) {
    downloadLabelDefault =
      document.getElementById('download-label')?.textContent ?? '';
    downloadButton.addEventListener('click', downloadMarkdown);
  }

  const downloadZipButton = document.getElementById('download-zip-button');
  if (downloadZipButton !== null) {
    downloadZipLabelDefault =
      document.getElementById('download-zip-label')?.textContent ?? '';
    downloadZipButton.addEventListener('click', () => void downloadZip());
  }

  const convertAnotherButton = document.getElementById('convert-another');
  if (convertAnotherButton !== null) {
    convertAnotherButton.addEventListener('click', resetConverter);
  }

  // Theme changes are handled automatically by CSS using prefers-color-scheme.
});
