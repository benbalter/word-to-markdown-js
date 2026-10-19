/// <reference lib="webworker" />
// Runs the .docx → Markdown conversion off the main thread so a large or
// complex document doesn't freeze the UI. The heavy dependencies (mammoth,
// turndown, prettier, markdownlint, jszip) load in this worker's context rather
// than on the page. Excluded from tsc (see tsconfig.json); Astro/Vite bundles
// it via the `new Worker(new URL(...))` reference in src/index.ts.
//
// The DOM shim MUST be imported before the converter: turndown reads
// `window.DOMParser` at load and a worker has no `window`. See
// ./worker-dom-polyfill.ts for why this is a separate module.
import './worker-dom-polyfill.js';
import {
  convertHtml,
  convertWithWarnings,
  type ConvertResult,
} from './main.js';
import { setProgressReporter } from './progress.js';

type ConvertRequest =
  | {
      id: number;
      buffer: ArrayBuffer;
      // When true, extract images to relative files (returned on
      // result.images) instead of inlining them as base64. Used by the
      // "Download .zip" action.
      extract?: boolean;
      // Where extracted images go (default `images`). "Download all" gives
      // each document in a batch its own folder.
      imageDir?: string;
    }
  // Pasted HTML (copied from Word, Google Docs, or a web page).
  | { id: number; html: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// Heartbeats: tell the page each time a pipeline stage starts, so it can tell
// a slow conversion (still reporting) from a dead worker (silent). See
// src/worker-client.ts.
setProgressReporter((stage) => ctx.postMessage({ type: 'progress', stage }));

ctx.onmessage = async (event: MessageEvent<ConvertRequest>): Promise<void> => {
  const request = event.data;
  const { id } = request;
  // A heartbeat as soon as a request arrives, before any work, so the page
  // hears from a worker that picks up a queued document.
  ctx.postMessage({ type: 'progress', stage: 'start' });
  try {
    const result: ConvertResult =
      'html' in request
        ? {
            markdown: await convertHtml(request.html),
            warnings: [],
            warningDetails: [],
          }
        : await convertWithWarnings(
            request.buffer,
            request.extract
              ? { images: 'extract', imageDir: request.imageDir }
              : undefined,
          );
    // Transfer extracted image bytes rather than copying them to the page. A
    // buffer may appear in a transfer list only once, hence the Set.
    const transfer = [
      ...new Set(
        (result.images ?? []).map((image) => image.bytes.buffer as ArrayBuffer),
      ),
    ];
    ctx.postMessage({ id, ok: true, result }, transfer);
  } catch (error) {
    // Errors can't cross the worker boundary as class instances, so forward the
    // name + message; src/index.ts maps the name back to user-facing copy.
    const serialized =
      error instanceof Error
        ? { name: error.name, message: error.message }
        : { name: 'Error', message: String(error) };
    ctx.postMessage({ id, ok: false, error: serialized });
  }
};

// Signal that the module (and its heavy deps) finished loading. The main thread
// waits for this before sending work; if it never arrives, it falls back to
// converting on the main thread rather than hanging. Posted after onmessage is
// wired up so no early message can be missed.
ctx.postMessage({ type: 'ready' });
