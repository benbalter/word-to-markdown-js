// --- Off-main-thread conversion --------------------------------------------
// The docx→Markdown pipeline is CPU-bound; running it in a Web Worker
// (src/converter.worker.ts) keeps the page responsive (no frozen tab) on large
// or complex documents. The converter's dependencies (mammoth, turndown,
// jszip, domino, prettier, markdownlint: ~400KB gzipped) load with the worker,
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
// WORKER_SILENCE_TIMEOUT). The clock starts when a conversion is requested, not when
// the worker is prefetched, and is generous because the worker downloads the
// same heavy deps the fallback would: on a slow link, falling back only adds a
// second download.
const WORKER_READY_TIMEOUT = 15000;

// How long the worker may stay silent, while a conversion is pending, before
// we declare it dead. A worker that runs out of memory can die without firing
// onerror, which would otherwise leave the page spinning forever.
//
// Silence, not total time: the worker reports each pipeline stage as it
// starts (src/progress.ts) and each document of a batch as it arrives, and any
// message resets the clock. A slow conversion keeps talking and gets its
// result however long it takes; a dead worker goes quiet and fails after this
// window. The slow stages are synchronous CPU work, so the window has to
// outlast the longest single stage, not the conversion. The window was sized
// when the worst stage was markdownlint on table-heavy documents (an 80 KB
// .docx of 40 tables of 100 rows), measured in Chromium's worker on a fast
// laptop: it grew faster than linearly with table rows, about 2 s for 20 such
// tables, 8 s for 40, and 23 s for 80. Two minutes covered the 80-table
// document on a device five times slower than that laptop. Since then,
// markdownlint 0.42 (micromark-extension-gfm-table 2.1.2) made lint's table
// parsing linear, and caching each table's rows for Turndown's GFM plugin
// (addTableRowsCacheRule in src/main.ts) did the same for Turndown, which had
// taken another 8 s on the 80-table document. In Node, no stage of that
// document now takes more than about 0.6 s. The window now has far more
// headroom than it needs, while a dead worker still fails sooner than the
// 3-minute floor of the size-based timeout this replaces. A file's size
// predicted its conversion time poorly anyway, since the XML compresses so
// well.
//
// There's deliberately no overall cap. Every stage is finite and reports when
// the next one starts, so a cap could only catch a worker that keeps
// reporting progress forever, which this pipeline can't do; a hang inside a
// stage is silence, and this catches it.
const WORKER_SILENCE_TIMEOUT = 120000;

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

// One silence timer for the worker, not one per conversion: the worker
// handles requests in turn, so a queued document hears nothing of its own
// while the one ahead of it is busy, yet the worker is plainly alive. Armed
// while any conversion is pending; every message from the worker restarts it.
let silenceTimer: number | undefined;
// What the worker last reported (a pipeline stage that started, `start` for a
// request it picked up, `reply`, or `request` if it hasn't spoken since the
// page sent one), logged if it then goes silent. Not sent anywhere: kept to
// help tell a stage that's merely slow from a worker that died, should
// timeouts need a closer look.
let lastHeard: string | undefined;

function stopSilenceTimer(): void {
  window.clearTimeout(silenceTimer);
  silenceTimer = undefined;
}

function startSilenceTimer(): void {
  stopSilenceTimer();
  if (pendingConversions.size === 0) return;
  silenceTimer = window.setTimeout(() => {
    const seconds = Math.round(WORKER_SILENCE_TIMEOUT / 1000);
    console.warn(
      `The conversion worker went silent for ${seconds} s after "${lastHeard ?? 'unknown'}", so it's treated as dead.`,
    );
    resetWorker(new ConversionTimeoutError('conversion worker went silent'));
  }, WORKER_SILENCE_TIMEOUT);
}

// The worker said something, so it's alive: restart the silence clock.
function heardFromWorker(stage: string): void {
  lastHeard = stage;
  startSilenceTimer();
}

// Distinguishes a worker that failed to load/run (→ fall back to the main
// thread) from a genuine conversion error (→ surface it to the user).
class WorkerInfraError extends Error {}

// The main-thread converter's chunk failed to download (offline, or a deploy
// replaced it while the tab was open). Named so the page can count it as a
// load failure rather than a conversion error.
class ConverterLoadError extends Error {
  name = 'ConverterLoadError';
}

// A worker that went silent for WORKER_SILENCE_TIMEOUT mid-conversion. Not a WorkerInfraError: the
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
  stopSilenceTimer();
  lastHeard = undefined;
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
      if (data?.type === 'progress') {
        heardFromWorker(String(data.stage));
        return;
      }
      const { id, ok, result, error } = data;
      const pending = pendingConversions.get(id);
      if (!pending) return;
      pendingConversions.delete(id);
      // A reply is a sign of life too: the next queued conversion, if any,
      // gets a full window.
      heardFromWorker('reply');
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

function convertViaWorker(request: WorkerRequest): Promise<ConversionResult> {
  const worker = getConverterWorker();
  const id = ++workerMessageId;
  return new Promise<ConversionResult>((resolve, reject) => {
    pendingConversions.set(id, { resolve, reject });
    // Start the clock if the worker was idle. If it's already busy, don't
    // restart it: a new request is no sign of life from the worker.
    if (silenceTimer === undefined) heardFromWorker('request');
    // Structured-clone (don't transfer) the buffer so it stays valid for a
    // main-thread fallback if the worker turns out to be unavailable.
    worker.postMessage({ id, ...request });
  });
}

// Convert in the worker when possible, with a transparent main-thread fallback
// (older browsers, or a worker that never loads). A genuine conversion error,
// or a timeout, propagates; only infrastructure failures fall back.
async function convertWithFallback(
  request: WorkerRequest,
  onMainThread: (main: typeof import('./main.js')) => Promise<ConversionResult>,
): Promise<ConversionResult> {
  if (typeof Worker !== 'undefined' && !workerUnavailable) {
    try {
      getConverterWorker();
      await waitForWorker(); // rejects (WorkerInfraError) on timeout/failure
      return await convertViaWorker(request);
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
  return convertWithFallback({ html }, async ({ convertHtml }) => ({
    markdown: await convertHtml(html),
    warnings: [],
    warningDetails: [],
  }));
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
