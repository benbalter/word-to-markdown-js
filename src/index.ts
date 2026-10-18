import type { ExtractedImage, WarningDetail } from './main.js';
// Named imports, so the bundle keeps only these of en.json's strings.
import {
  errorGeneric,
  docFileError,
  invalidFileError,
  notWordFileError,
  protectedFileError,
  copyFailed,
  dismiss,
  copiedButton,
  downloadedButton,
  downloadedZipButton,
  fileTooLargeError,
  conversionAnnouncement,
  convertingStatus,
  onlyFirstFile,
  warnings,
} from '../web/i18n/en.json';

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
// The most recently converted Markdown, the download source. Kept here rather
// than read back from the rendered #output, whose innerText depends on layout.
let lastMarkdown = '';
// Guards "Download .zip" against re-entry while it re-converts (the button
// stays enabled, and focused, so keyboard and screen-reader users keep their
// place).
let zipInProgress = false;

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
    { default: rehypeSanitize, defaultSchema },
    { default: rehypeStringify },
  ] = await Promise.all([
    import('unified'),
    import('remark-parse'),
    import('remark-gfm'),
    import('remark-rehype'),
    import('rehype-sanitize'),
    import('rehype-stringify'),
  ]);

  // remark-rehype already namespaces footnote ids/hrefs with `user-content-`
  // consistently. rehype-sanitize's default clobberPrefix re-prefixes *ids* (but
  // not href fragments), double-prefixing footnote targets and breaking the
  // in-page jump/backlinks. Disable its clobbering; the ids remain namespaced
  // (and thus clobber-safe) by remark-rehype.
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize, { ...defaultSchema, clobberPrefix: '' })
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
  token: number,
): Promise<void> {
  if (!target) return;
  try {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    const html = await renderMarkdown(markdown);
    // A newer document replaced this one while it rendered.
    if (token !== activeConversion) return;
    target.innerHTML = html;
    // Open the document's own links in a new tab so following one doesn't
    // navigate away from (and discard) the conversion. In-page footnote links
    // (#user-content-fn-…) stay as they are.
    target
      .querySelectorAll<HTMLAnchorElement>('a[href^="http"]')
      .forEach((link) => {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      });
    hideSpacerImages(target);
  } catch (error) {
    console.error(error);
  }
}

// A 1×1 image (a spacer or tracking pixel, common in pasted web content)
// renders as an invisible dot wrapped in Typography's image margins: a blank
// gap in the preview. Hide those once they decode. The Markdown keeps them,
// since that's the document's content.
function hideSpacerImages(target: HTMLElement): void {
  for (const image of target.querySelectorAll('img')) {
    const check = (): void => {
      if (image.naturalWidth > 1 || image.naturalHeight > 1) return;
      image.hidden = true;
      // An image alone in its paragraph leaves the paragraph's margins
      // behind as the same blank gap, so hide that too.
      const parent = image.parentElement;
      if (
        parent?.tagName === 'P' &&
        parent.children.length === 1 &&
        !parent.textContent?.trim()
      ) {
        parent.hidden = true;
      }
    };
    if (image.complete && image.naturalWidth > 0) check();
    else image.addEventListener('load', check, { once: true });
  }
}

// --- Off-main-thread conversion --------------------------------------------
// The docx→Markdown pipeline is CPU-bound; running it in a Web Worker keeps the
// page responsive (no frozen tab) on large or complex documents.
interface ConversionResult {
  markdown: string;
  warnings: string[];
  warningDetails: WarningDetail[];
  images?: ExtractedImage[];
}

// How long a conversion waits for the worker to signal it has loaded before
// giving up and converting on the main thread instead. Only guards a
// broken/hung worker load, not the conversion itself (see
// conversionTimeout). The clock starts when a conversion is requested, not when
// the worker is prefetched, and is generous because the worker downloads the
// same heavy deps the fallback would: on a slow link, falling back only adds a
// second download.
const WORKER_READY_TIMEOUT = 15000;

// How long the worker gets to convert one input before we give up on it. A
// worker that runs out of memory can die without firing onerror, which would
// otherwise leave the page spinning forever. Real documents convert in
// seconds; this allows minutes, scaled by size (30 s + 15 s per MB, so about
// 5.5 minutes for a 20 MB file).
function conversionTimeout(bytes: number): number {
  return 30000 + (bytes / (1024 * 1024)) * 15000;
}

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

// A conversion that outlived conversionTimeout. Not a WorkerInfraError: the
// same input would likely hang or exhaust memory on the main thread too, so
// it's surfaced (as the generic error) rather than retried there.
class ConversionTimeoutError extends Error {
  name = 'ConversionTimeoutError';
}

// Reject and clear all in-flight conversions with `error`, then stop and drop
// the worker. The next conversion starts a fresh one.
function resetWorker(error: Error): void {
  for (const [id, pending] of pendingConversions) {
    pendingConversions.delete(id);
    pending.reject(error);
  }
  converterWorker?.terminate();
  converterWorker = null;
  workerReady = null;
}

// Like resetWorker, but for a worker that can't work at all: later attempts
// go straight to the main-thread fallback.
function failWorker(reason: string): void {
  resetWorker(new WorkerInfraError(reason));
  workerUnavailable = true;
}

function getConverterWorker(): Worker {
  if (converterWorker) return converterWorker;
  const worker = new Worker(new URL('./converter.worker.ts', import.meta.url), {
    type: 'module',
  });
  // Settles when the worker loads or fails; convertBuffer bounds the wait.
  workerReady = new Promise<void>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent): void => {
      const data = event.data;
      if (data?.type === 'ready') {
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
      reject(new WorkerInfraError('conversion worker failed'));
      failWorker('conversion worker failed');
    };
    // A reply that can't be deserialized never reaches onmessage, so its
    // conversion would wait forever.
    worker.onmessageerror = (): void => {
      failWorker('conversion worker reply was unreadable');
    };
  });
  // A rejected readiness promise is handled by whoever awaits it in
  // convertBuffer; attach a no-op catch so it isn't an unhandled rejection.
  workerReady.catch(() => {});
  converterWorker = worker;
  return worker;
}

// Wait for the worker to load, but no longer than WORKER_READY_TIMEOUT from now.
function waitForWorker(): Promise<void> {
  const ready = workerReady;
  if (!ready) return Promise.reject(new WorkerInfraError('no worker'));
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      failWorker('worker did not become ready');
      reject(new WorkerInfraError('worker did not become ready'));
    }, WORKER_READY_TIMEOUT);
  });
  return Promise.race([ready, timeout]).finally(() =>
    window.clearTimeout(timer),
  );
}

// What the worker converts: a .docx's bytes (see src/converter.worker.ts), or
// pasted HTML.
type WorkerRequest =
  { buffer: ArrayBuffer; extract: boolean } | { html: string };

function convertViaWorker(
  request: WorkerRequest,
  size: number,
): Promise<ConversionResult> {
  const worker = getConverterWorker();
  const id = ++workerMessageId;
  let timer: number | undefined;
  return new Promise<ConversionResult>((resolve, reject) => {
    pendingConversions.set(id, { resolve, reject });
    timer = window.setTimeout(() => {
      resetWorker(new ConversionTimeoutError('conversion timed out'));
    }, conversionTimeout(size));
    // Structured-clone (don't transfer) the buffer so it stays valid for a
    // main-thread fallback if the worker turns out to be unavailable.
    worker.postMessage({ id, ...request });
  }).finally(() => window.clearTimeout(timer));
}

// Convert in the worker when possible, with a transparent main-thread fallback
// (older browsers, or a worker that never loads). A genuine conversion error,
// or a timeout, propagates; only infrastructure failures fall back.
async function convertWithFallback(
  request: WorkerRequest,
  size: number,
  onMainThread: (main: typeof import('./main.js')) => Promise<ConversionResult>,
): Promise<ConversionResult> {
  if (typeof Worker !== 'undefined' && !workerUnavailable) {
    try {
      getConverterWorker();
      await waitForWorker(); // rejects (WorkerInfraError) on timeout/failure
      return await convertViaWorker(request, size);
    } catch (error) {
      if (!(error instanceof WorkerInfraError)) throw error;
    }
  }
  return onMainThread(await import('./main.js'));
}

// Convert a .docx's bytes to Markdown.
function convertBuffer(
  buffer: ArrayBuffer,
  extract = false,
): Promise<ConversionResult> {
  return convertWithFallback(
    { buffer, extract },
    buffer.byteLength,
    ({ convertWithWarnings }) =>
      convertWithWarnings(buffer, extract ? { images: 'extract' } : undefined),
  );
}

// Convert pasted HTML to Markdown. There's no document to inspect, so no
// warnings.
function convertPastedHtml(html: string): Promise<ConversionResult> {
  return convertWithFallback(
    { html },
    html.length,
    async ({ convertHtml }) => ({
      markdown: await convertHtml(html),
      warnings: [],
      warningDetails: [],
    }),
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
// identity doesn't survive the boundary). The library's messages are English,
// so map the actionable ones to localized strings by name; anything else
// (including ConversionError, a generic "try again") gets the generic message.
const CONVERSION_ERROR_STRINGS = {
  InvalidFileError: 'invalidFileError',
  UnsupportedFileError: 'protectedFileError',
} as const satisfies Record<string, UIStringKey>;

// `note` is appended to the message (e.g. the "only the first file" notice,
// which would otherwise be lost when the conversion fails). `fileName`, when
// the error is about a file the visitor just gave us, is shown with it.
function showConversionError(
  error: unknown,
  note = '',
  fileName?: string,
): void {
  const name = (error as { name?: string })?.name;
  // Something that isn't a Word file at all (README.md, a PDF, a spreadsheet)
  // fails as unreadable or as an unsupported container. "Open it in Word and
  // save it again" would be wrong advice for it, so say what it is instead.
  if (
    fileName &&
    !/\.docx?$/i.test(fileName) &&
    (name === 'InvalidFileError' || name === 'UnsupportedFileError')
  ) {
    showError(withNote(uiString('notWordFileError'), note), fileName);
    return;
  }
  if (name && Object.hasOwn(CONVERSION_ERROR_STRINGS, name)) {
    const key =
      CONVERSION_ERROR_STRINGS[name as keyof typeof CONVERSION_ERROR_STRINGS];
    showError(withNote(uiString(key), note), fileName);
    return;
  }
  showError(withNote(uiString('errorGeneric'), note), fileName);
  console.error(error);
}

function withNote(message: string, note: string): string {
  return note ? `${message} ${note}` : message;
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
}

// Copy the converted Markdown with the async Clipboard API. The write starts
// synchronously inside the click handler (no await before it) so browsers that
// require transient user activation, notably iOS Safari, still honor it.
let copyLabelDefault = '';
let copyResetTimer: number | undefined;
function copyMarkdown(): void {
  const markdown = lastMarkdown;
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
    const copyLabel = document.getElementById('copy-label');
    if (!copyLabel) return;
    // Flip the label to a transient confirmation, then restore it. Guard the
    // captured default against rapid re-clicks by resetting the timer.
    copyLabel.textContent = uiString('copied');
    announce(copyLabel.textContent);
    const copyButton = document.getElementById('copy-button');
    copyButton?.classList.add('is-confirmed');
    // Light up the Markdown panel: that's exactly what's on the clipboard now.
    replayClass(document.querySelector('.md-panel'), 'is-lit');
    window.clearTimeout(copyResetTimer);
    copyResetTimer = window.setTimeout(() => {
      copyLabel.textContent = copyLabelDefault;
      copyButton?.classList.remove('is-confirmed');
    }, 2000);
  }, copyFailed);
}

// Restart a one-shot CSS animation keyed to a class (the result highlights in
// global.css): drop the class, force a reflow so the browser forgets the
// finished run, then add it back. A second conversion or Copy replays it.
function replayClass(element: Element | null, className: string): void {
  if (!(element instanceof HTMLElement)) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
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
    // The site's locale key (e.g. "pt", "zh-hant"), which the Worker validates.
    const locale = document.documentElement.dataset.locale || 'en';
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
async function processFile(
  file: File | undefined,
  ignoredFiles = 0,
): Promise<void> {
  if (!file) return;
  // Paste and page-wide drops skip the dropzone's intent listeners, and the idle
  // prefetch is skipped on low-data connections, so warm (and bind the copy
  // button) here too. Idempotent.
  prefetchConverter();

  const inputRegion = document.getElementById('input');
  const dropzone = document.getElementById('dropzone');
  const srStatus = document.getElementById('sr-status');
  const endBusy = (): void => {
    inputRegion?.removeAttribute('aria-busy');
    dropzone?.classList.remove('is-converting');
  };
  const ignoredNote = ignoredFiles > 0 ? uiString('onlyFirstFile') : '';

  // Reject legacy .doc files up front with the friendlier localized "save as
  // .docx" guidance. Done here (not in the worker) since only the main thread
  // sees the filename, and it avoids loading the converter for a doomed file.
  // Also guard against files too large to convert comfortably in the browser —
  // reading a huge ArrayBuffer and running the pipeline can exhaust memory or
  // hang the tab, so fail fast with friendly guidance instead.
  const rejection = isLegacyDocFile(file.name)
    ? uiString('docFileError')
    : file.size > MAX_FILE_SIZE
      ? uiString('fileTooLarge')
      : null;
  if (rejection) {
    // A rejected file still supersedes a conversion in flight: otherwise that
    // result lands later, hides the input, and this error with it.
    if (inputRegion?.hasAttribute('aria-busy')) {
      activeConversion++;
      endBusy();
      if (srStatus) srStatus.textContent = '';
    }
    showError(withNote(rejection, ignoredNote), file.name);
    return;
  }

  await runConversion(file.name, ignoredNote, async () => {
    const buffer = await file.arrayBuffer();
    return { buffer, result: await convertBuffer(buffer) };
  });
}

// Convert HTML pasted onto the page (copied from Word, Google Docs, or a web
// page). The result is named like a file so the downloads have a name.
function processPastedHtml(html: string): void {
  prefetchConverter();
  void runConversion(PASTED_NAME, '', async () => ({
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

// Run a conversion and show its result, shared by files and pasted HTML.
// `fileName` is shown with the result; `buffer`, a .docx's bytes, is kept for
// "Download .zip" (null for pasted HTML, which has no file to re-convert).
async function runConversion(
  fileName: string,
  ignoredNote: string,
  convert: () => Promise<{
    buffer: ArrayBuffer | null;
    result: ConversionResult;
  }>,
): Promise<void> {
  const inputRegion = document.getElementById('input');
  const dropzone = document.getElementById('dropzone');
  const srStatus = document.getElementById('sr-status');
  const endBusy = (): void => {
    inputRegion?.removeAttribute('aria-busy');
    dropzone?.classList.remove('is-converting');
  };

  // Only the most recent file wins: a result (or error) from a conversion that
  // was superseded by a newer drop is discarded.
  const token = ++activeConversion;

  // Enter a busy state before reading (a large file takes a moment to read):
  // mark the input region busy, spin the dropzone icon, and announce progress,
  // so a slow conversion isn't a silent, frozen-looking wait. The dropzone stays
  // visible until the results reveal, so the spinner is the immediate visual
  // feedback for the drop.
  document.getElementById('error-alert')?.remove();
  inputRegion?.setAttribute('aria-busy', 'true');
  dropzone?.classList.add('is-converting');
  if (srStatus) {
    srStatus.textContent = uiString('converting');
  }
  try {
    const { buffer, result } = await convert();
    if (token !== activeConversion) return;
    endBusy();

    // Display warnings if any (and drop a previous document's)
    document.getElementById('warning-alert')?.remove();
    const { lines, technical } = localizeWarnings(result.warningDetails);
    if (ignoredNote) lines.push(ignoredNote);
    if (lines.length > 0) {
      showWarnings(lines, technical);
    }

    // Reveal the results with the raw Markdown (the primary output, and the
    // copy/download source) straight away; the HTML preview is rendered
    // afterwards via renderPreview(), off the critical path, so its render
    // doesn't sit between the drop and the user seeing their result. Clear the
    // previous document's preview first so it can't linger if this render fails.
    // textContent, not innerText: the <pre> keeps the newlines, and innerText
    // would build a <br> per line (slow on a long document).
    lastMarkdown = result.markdown;
    const outputElement = document.getElementById('output');
    outputElement.textContent = result.markdown;
    const renderedElement = document.getElementById('rendered');
    if (renderedElement) renderedElement.innerHTML = '';

    const filenameElement = document.getElementById('filename');
    filenameElement.textContent = fileName;

    // Retain the source bytes and offer "Download .zip" only when the document
    // actually has images (inline mode embeds them as base64 data URIs). Match
    // Markdown image syntax, not a bare "data:image" that could be document text.
    lastConvertedBuffer = buffer;
    setImageMode(buffer !== null && INLINE_IMAGE.test(result.markdown));

    const inputElement = document.getElementById('input');
    inputElement.classList.add('hidden');

    const resultsElement = document.getElementById('results');
    resultsElement.classList.remove('hidden');

    // Hide the pre-conversion sections (How It Works, the conversion table,
    // the CLI callout, the FAQ) and the standalone promo card: the page is now
    // about this result. The
    // results pane carries its own quiet Open & Async pitch, so this also
    // avoids stacking two asks.
    document.getElementById('pre-result')?.classList.add('hidden');

    // Announce success to assistive tech (the results reveal is otherwise
    // silent) and move focus to the first result action so keyboard users
    // aren't stranded on the now-hidden file input.
    announce(uiString('conversionAnnouncement'));
    // Bring the result into view: it lands where the dropzone was, below the
    // hero, which on a phone leaves it entirely off screen. Scroll first, then
    // focus without scrolling so the two don't fight. Both APIs are optional
    // chained because jsdom (unit tests) implements neither.
    const reduceMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    )?.matches;
    resultsElement.scrollIntoView?.({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start',
    });
    primaryAction()?.focus({ preventScroll: true });
    // The finished result lights up like an added diff hunk (decoration only;
    // nothing above waits on it).
    replayClass(document.querySelector('.md-panel'), 'is-lit');
    replayClass(filenameElement, 'is-lit');

    recordConversion('success');

    // Render the HTML preview last, off the interaction's critical path.
    void renderPreview(renderedElement, result.markdown, token);
  } catch (error) {
    if (token !== activeConversion) return;
    // Leave the busy state and clear the "Converting…" announcement.
    endBusy();
    if (srStatus) srStatus.textContent = '';
    recordConversion('error');
    // Pasted HTML has no file for the error to name.
    showConversionError(
      error,
      ignoredNote,
      fileName === PASTED_NAME ? undefined : fileName,
    );
  }
}

// Match an inline (base64) image in Markdown image syntax.
const INLINE_IMAGE = /!\[[^\]]*\]\(data:image\//;

// When a document has images, the Markdown carries them as long base64
// strings, so the .zip (Markdown plus an images/ folder) is the better next
// step: it takes the filled accent and the leading spot from Copy, and a note
// says why. Without images, Copy leads and the .zip button is hidden.
function setImageMode(hasImages: boolean): void {
  const copyButton = document.getElementById('copy-button');
  const zipButton = document.getElementById('download-zip-button');
  if (!copyButton || !zipButton) return;
  zipButton.style.display = hasImages ? 'inline-flex' : 'none';
  copyButton.classList.toggle('btn-accent', !hasImages);
  copyButton.classList.toggle('btn-secondary', hasImages);
  zipButton.classList.toggle('btn-accent', hasImages);
  zipButton.classList.toggle('btn-secondary', !hasImages);
  if (hasImages) copyButton.before(zipButton);
  else document.getElementById('download-button')?.after(zipButton);
  document
    .getElementById('images-note')
    ?.classList.toggle('hidden', !hasImages);
}

// The result action that carries the accent (see setImageMode), where focus
// lands after a conversion.
function primaryAction(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('#results .btn-accent') ??
    document.getElementById('copy-button')
  );
}

// Incremented per processFile call; see the token check there.
let activeConversion = 0;

// Put a message in the polite live region for screen readers.
function announce(message: string): void {
  const status = document.getElementById('sr-status');
  if (status) status.textContent = message;
}

// English copy, the fallback for each string below. Read from en.json (the
// source the localized pages render from) so the two can't drift apart.
const ENGLISH_STRINGS = {
  errorGeneric,
  docFileError,
  invalidFileError,
  notWordFileError,
  protectedFileError,
  copyFailed,
  dismiss,
  copied: copiedButton,
  downloaded: downloadedButton,
  downloadedZip: downloadedZipButton,
  fileTooLarge: fileTooLargeError,
  conversionAnnouncement,
  converting: convertingStatus,
  onlyFirstFile,
  warningEncrypted: warnings.encrypted,
  warningSensitivity: warnings.sensitivity,
  warningConfidentiality: warnings.confidentiality,
  warningProtected: warnings.protected,
  warningContentLoss: warnings.contentLoss,
  warningContentLossItems: warnings.contentLossItems,
  warningKindEquations: warnings.contentKinds.equations,
  warningKindImages: warnings.contentKinds.images,
  warningKindSymbols: warnings.contentKinds.symbols,
  warningKindObjects: warnings.contentKinds.objects,
  warningKindOther: warnings.contentKinds.other,
  warningKindComments: warnings.contentKinds.comments,
  warningKindHeadersFooters: warnings.contentKinds.headersFooters,
  warningKindTextBoxes: warnings.contentKinds.textBoxes,
  warningTechnical: warnings.technical,
} satisfies Record<string, string>;

type UIStringKey = keyof typeof ENGLISH_STRINGS;

// Localized UI strings are rendered into the page as data-* attributes on the
// #input element (see Converter.astro), keeping this module framework- and
// language-agnostic. Falls back to English when the attribute is absent (e.g.
// in unit tests that mount a bare DOM).
function uiString(key: UIStringKey): string {
  const input = document.getElementById('input');
  const value = input?.dataset[key];
  return value && value.length > 0 ? value : ENGLISH_STRINGS[key];
}

// Show an error alert. `fileName` names the file it's about, on its own line
// above the message, so a visitor who dropped several files in turn knows
// which one failed.
function showError(message: string, fileName?: string): void {
  // Create or update error alert
  let errorElement = document.getElementById('error-alert');
  if (!errorElement) {
    errorElement = document.createElement('div');
    errorElement.id = 'error-alert';
    errorElement.setAttribute('role', 'alert');
    errorElement.className =
      'relative mb-4 flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-start text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200';

    const body = document.createElement('div');
    body.className = 'flex-1';

    // <bdi> so a right-to-left filename (or a Latin one on an RTL page)
    // doesn't reorder the punctuation around it.
    const fileLine = document.createElement('bdi');
    fileLine.id = 'error-file';
    fileLine.className = 'mb-0.5 block font-mono text-xs font-medium break-all';

    const messageSpan = document.createElement('span');
    messageSpan.id = 'error-message';
    messageSpan.className = 'block';

    body.append(fileLine, messageSpan);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', uiString('dismiss'));
    closeButton.className =
      '-m-1 shrink-0 p-1 leading-none text-red-700 transition-colors hover:text-red-900 dark:text-red-200 dark:hover:text-red-50';
    closeButton.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    closeButton.addEventListener('click', () => dismissAlert(errorElement));

    errorElement.appendChild(body);
    errorElement.appendChild(closeButton);
  }

  // Show the alert in whichever region is on screen: the input before a
  // conversion, the results after one (e.g. a failed "Download .zip"). An alert
  // left inside the hidden region would be invisible and never announced.
  const results = document.getElementById('results');
  const container =
    results && !results.classList.contains('hidden')
      ? results
      : document.getElementById('input');
  if (container && errorElement.parentElement !== container) {
    container.insertBefore(errorElement, container.firstChild);
  }

  const fileElement = document.getElementById('error-file');
  if (fileElement) {
    fileElement.textContent = fileName ?? '';
    fileElement.hidden = !fileName;
  }
  const messageElement = document.getElementById('error-message');
  messageElement.textContent = message;
  errorElement.classList.remove('hidden');
}

// Remove an alert. If focus was inside it (its close button), move focus to
// the current primary control instead of letting it fall back to <body>.
function dismissAlert(alert: HTMLElement): void {
  const hadFocus = alert.contains(document.activeElement);
  alert.remove();
  if (!hadFocus) return;
  const results = document.getElementById('results');
  const target =
    results && !results.classList.contains('hidden')
      ? primaryAction()
      : document.getElementById('file');
  target?.focus();
}

// Turn the converter's structured warnings into localized lines for the UI.
// The converter's own English strings are written for the CLI and library;
// mammoth's raw messages (e.g. "An unrecognised element was ignored:
// w:someUnknownElement") collapse into one plain line, with the raw text kept
// for a "Technical details" disclosure.
function localizeWarnings(details: readonly WarningDetail[] = []): {
  lines: string[];
  technical: string[];
} {
  const lines: string[] = [];
  const technical: string[] = [];
  for (const warning of details) {
    const label = warning.detail ?? '';
    switch (warning.kind) {
      case 'encrypted':
        lines.push(uiString('warningEncrypted'));
        break;
      case 'sensitivity':
        lines.push(
          uiString('warningSensitivity').replace('{label}', () => label),
        );
        break;
      case 'confidentiality':
        lines.push(
          uiString('warningConfidentiality').replace('{label}', () => label),
        );
        break;
      case 'protected':
        lines.push(uiString('warningProtected'));
        break;
      case 'content-loss':
        technical.push(label);
        break;
    }
  }
  if (technical.length > 0) {
    lines.push(describeContentLoss(technical));
  }
  return { lines, technical };
}

// What kind of content each of mammoth's raw messages is about, so the
// warning can say what's missing ("equations and images") rather than only
// that something is. The converter de-duplicates identical messages, so this
// names kinds, not counts. Mammoth names elements by prefix for the
// namespaces it knows (w:, v:, wp:, mc:, …) and as {namespace-uri}name for
// the rest, Office Math among them.
const CONTENT_KINDS = [
  // Content the converter finds dropped itself, named by its own detail
  // strings ("comments (2)", "headers and footers", "text boxes (1)"). A
  // text box mammoth reports itself ({…wordprocessingShape}txbx) is the same
  // kind, and must match here before "objects" does.
  ['comments', /^comments \(/],
  ['headersFooters', /^headers and footers$/],
  [
    'textBoxes',
    /^(?:text boxes \(|An unrecognised element was ignored: \{[^}]*\/wordprocessingShape\}txbx$)/,
  ],
  // Office Math: <m:oMath>, <m:oMathPara>.
  ['equations', /oMath/],
  // "Image of type … is unlikely to display", "Could not find image file
  // for a:blip element", an unlinked v:imagedata.
  ['images', /image|a:blip/i],
  // <w:sym> with a character mammoth can't map.
  ['symbols', /\bw:sym\b/],
  // An element outside Word's own w: namespace: VML shapes, DrawingML text
  // boxes and groups, charts, embedded objects.
  ['objects', /ignored: (?:\{|(?!w:)[\w-]+:)/],
] as const;

const KIND_KEYS = {
  equations: 'warningKindEquations',
  images: 'warningKindImages',
  symbols: 'warningKindSymbols',
  objects: 'warningKindObjects',
  comments: 'warningKindComments',
  headersFooters: 'warningKindHeadersFooters',
  textBoxes: 'warningKindTextBoxes',
  other: 'warningKindOther',
} as const satisfies Record<string, UIStringKey>;

function describeContentLoss(details: readonly string[]): string {
  const kinds = new Map<keyof typeof KIND_KEYS, string>();
  for (const detail of details) {
    const match = CONTENT_KINDS.find(([, pattern]) => pattern.test(detail));
    const kind = match ? match[0] : 'other';
    if (!kinds.has(kind)) kinds.set(kind, uiString(KIND_KEYS[kind]));
  }
  // Only unrecognized elements: nothing specific to name.
  if (kinds.size === 1 && kinds.has('other')) {
    return uiString('warningContentLoss');
  }
  // "Other elements" reads best last.
  const other = kinds.get('other');
  kinds.delete('other');
  const names = [...kinds.values(), ...(other ? [other] : [])];
  return uiString('warningContentLossItems').replace('{items}', () =>
    formatList(names),
  );
}

// Join names in the page's language ("a, b, and c"; "a、b、c").
function formatList(items: string[]): string {
  try {
    return new Intl.ListFormat(document.documentElement.lang || 'en', {
      type: 'conjunction',
    }).format(items);
  } catch {
    return items.join(', ');
  }
}

function showWarnings(warnings: string[], technical: string[] = []): void {
  // Remove any existing warning alerts
  const existingWarnings = document.getElementById('warning-alert');
  if (existingWarnings) {
    existingWarnings.remove();
  }

  const warningElement = document.createElement('div');
  warningElement.id = 'warning-alert';
  // A polite status, not an assertive alert: warnings arrive with the success
  // announcement and focus move, and an alert would cut those off.
  warningElement.setAttribute('role', 'status');
  warningElement.className =
    'relative mt-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-start text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200';

  const warningList = document.createElement('ul');
  warningList.className = 'list-disc space-y-1 ps-4';
  warnings.forEach((warning) => {
    const listItem = document.createElement('li');
    listItem.textContent = warning;
    warningList.appendChild(listItem);
  });

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', uiString('dismiss'));
  closeButton.className =
    '-m-1 shrink-0 p-1 leading-none text-amber-800 transition-colors hover:text-amber-950 dark:text-amber-200 dark:hover:text-amber-50';
  closeButton.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  closeButton.addEventListener('click', () => dismissAlert(warningElement));

  const body = document.createElement('div');
  body.className = 'flex-1';
  body.appendChild(warningList);
  if (technical.length > 0) {
    const disclosure = document.createElement('details');
    disclosure.className = 'mt-2';
    const summary = document.createElement('summary');
    summary.className =
      'cursor-pointer text-xs font-medium underline decoration-amber-400 underline-offset-2';
    summary.textContent = uiString('warningTechnical');
    const technicalList = document.createElement('ul');
    technicalList.className =
      'mt-1.5 space-y-0.5 font-mono text-[0.72rem] break-words';
    technicalList.dir = 'ltr';
    technical.forEach((line) => {
      const item = document.createElement('li');
      item.textContent = line;
      technicalList.appendChild(item);
    });
    disclosure.append(summary, technicalList);
    body.appendChild(disclosure);
  }

  warningElement.appendChild(body);
  warningElement.appendChild(closeButton);

  const resultsElement = document.getElementById('results');
  if (resultsElement) {
    resultsElement.insertBefore(warningElement, resultsElement.firstChild);
  }
}

// Convert the first of the given files (converting several at once isn't
// supported), noting how many others were ignored.
function processFiles(files: ArrayLike<File> | null | undefined): void {
  if (!files || files.length === 0) return;
  void processFile(files[0], files.length - 1);
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
  activeConversion++;
  const rendered = document.getElementById('rendered');
  if (rendered) rendered.innerHTML = '';

  // Drop the retained bytes, and hand the accent back to Copy (re-hiding the
  // zip button and its note) for the next document.
  lastConvertedBuffer = null;
  lastMarkdown = '';
  setImageMode(false);

  document.getElementById('error-alert')?.remove();
  document.getElementById('warning-alert')?.remove();

  document.getElementById('results')?.classList.add('hidden');
  document.getElementById('input')?.classList.remove('hidden');

  // Restore the pre-conversion sections that a successful conversion hid.
  document.getElementById('pre-result')?.classList.remove('hidden');

  // Clear the live status region so a prior success isn't re-announced.
  const status = document.getElementById('sr-status');
  if (status) status.textContent = '';

  // Return focus to the file input (inside the dropzone) for keyboard users.
  fileInput?.focus();
}

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
  // .md too: pasted HTML is shown as PASTED_NAME.
  return sourceName.replace(/\.(?:docx|md)$/i, '') || 'document';
}

// Download the converted Markdown as a .md file named after the source document.
function downloadMarkdown(): void {
  const markdown = lastMarkdown;
  if (!markdown) return;
  const baseName = downloadBaseName();
  saveBlob(
    new Blob([markdown], { type: 'text/markdown;charset=utf-8' }),
    `${baseName}.md`,
  );

  // Briefly confirm the download on the button label.
  const label = document.getElementById('download-label');
  if (label) {
    label.textContent = uiString('downloaded');
    announce(label.textContent);
    const downloadButton = document.getElementById('download-button');
    downloadButton?.classList.add('is-confirmed');
    window.clearTimeout(downloadResetTimer);
    downloadResetTimer = window.setTimeout(() => {
      label.textContent = downloadLabelDefault;
      downloadButton?.classList.remove('is-confirmed');
    }, 2000);
  }
}

// Download a .zip containing the Markdown (with relative image links) plus an
// images/ folder. Re-runs the conversion in extract mode against the retained
// source bytes, then bundles the result with JSZip (already a dependency).
async function downloadZip(): Promise<void> {
  if (!lastConvertedBuffer || zipInProgress) return;
  const button = document.getElementById('download-zip-button');
  const label = document.getElementById('download-zip-label');
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
      convertBuffer(lastConvertedBuffer, true),
    ]);

    const zip = new JSZip();
    zip.file(`${baseName}.md`, result.markdown);
    for (const image of result.images ?? []) {
      zip.file(image.path, image.bytes);
    }
    saveBlob(await zip.generateAsync({ type: 'blob' }), `${baseName}.zip`);

    if (label) {
      label.textContent = uiString('downloadedZip');
      announce(label.textContent);
      button?.classList.add('is-confirmed');
      window.clearTimeout(downloadZipResetTimer);
      downloadZipResetTimer = window.setTimeout(() => {
        label.textContent = downloadZipLabelDefault;
        button?.classList.remove('is-confirmed');
      }, 2000);
    }
  } catch (error) {
    showConversionError(error);
  } finally {
    zipInProgress = false;
    button?.removeAttribute('aria-disabled');
    button?.removeAttribute('aria-busy');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const inputElement = document.getElementById('file') as HTMLInputElement;
  inputElement.addEventListener(
    'change',
    function (this: HTMLInputElement): void {
      const file = this.files?.[0];
      // Clear the input so picking the same file again (e.g. after fixing it
      // following an error) still fires "change". The File stays readable.
      this.value = '';
      void processFile(file);
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

  const copyButton = document.getElementById('copy-button');
  if (copyButton !== null) {
    copyLabelDefault = document.getElementById('copy-label')?.textContent ?? '';
    copyButton.addEventListener('click', copyMarkdown);
  }

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
