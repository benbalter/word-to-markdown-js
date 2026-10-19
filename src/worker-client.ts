// --- Off-main-thread conversion --------------------------------------------
// The docx→Markdown pipeline is CPU-bound; running it in a Web Worker
// (src/converter.worker.ts) keeps the page responsive (no frozen tab) on large
// or complex documents. The converter's dependencies (mammoth, turndown,
// jszip, domino, prettier, markdownlint: ~355KB gzipped) load with the worker,
// so the landing page paints without them. Like the worker, this module runs
// only in the browser: Astro/Vite bundles it, and tsc leaves it out of build/.
import type { ExtractedImage, WarningDetail } from './main.js';

export interface ConversionResult {
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
// otherwise leave the page spinning forever. This only needs to catch a dead
// worker, so it errs long: a slow conversion that would have finished is a
// failure the visitor sees, while a dead one waiting longer costs only time.
// A .docx's size predicts its conversion time poorly, because the XML
// compresses so well: an 80 KB document of 40 long tables takes about 15 s on
// a fast laptop, and conversion time grows faster than linearly with table
// rows, so a slower phone could easily blow through the old 30 s floor. Hence
// 3 minutes plus 30 s per MB (about 13 minutes for a 20 MB file).
function conversionTimeout(bytes: number): number {
  return 180000 + (bytes / (1024 * 1024)) * 30000;
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

// The main-thread converter's chunk failed to download (offline, or a deploy
// replaced it while the tab was open). Named so the page can count it as a
// load failure rather than a conversion error.
class ConverterLoadError extends Error {
  name = 'ConverterLoadError';
}

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
  | { buffer: ArrayBuffer; extract: boolean; imageDir?: string }
  | { html: string };

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
  let main: typeof import('./main.js');
  try {
    main = await import('./main.js');
  } catch (error) {
    throw new ConverterLoadError('the converter failed to load', {
      cause: error,
    });
  }
  return onMainThread(main);
}

// Convert a .docx's bytes to Markdown. With `extract`, images come back as
// files under `imageDir` (default `images`) instead of inline.
export function convertBuffer(
  buffer: ArrayBuffer,
  extract = false,
  imageDir?: string,
): Promise<ConversionResult> {
  return convertWithFallback(
    { buffer, extract, imageDir },
    buffer.byteLength,
    ({ convertWithWarnings }) =>
      convertWithWarnings(
        buffer,
        extract ? { images: 'extract', imageDir } : undefined,
      ),
  );
}

// Convert pasted HTML to Markdown. There's no document to inspect, so no
// warnings.
export function convertPastedHtml(html: string): Promise<ConversionResult> {
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

// Start the worker (which loads mammoth/turndown/jszip/etc. off-thread) so the
// first conversion resolves from cache instead of waiting on a download.
// Where Workers are unavailable, warm the main-thread converter instead, so
// the deps are still cached before the first conversion.
export function prefetchWorker(): void {
  const ignore = (): void => {};
  if (typeof Worker !== 'undefined') {
    try {
      getConverterWorker();
    } catch {
      import('./main.js').catch(ignore);
    }
  } else {
    import('./main.js').catch(ignore);
  }
}
