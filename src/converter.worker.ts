/// <reference lib="webworker" />
// Runs the .docx → Markdown conversion off the main thread so a large or
// complex document doesn't freeze the UI. The heavy dependencies (mammoth,
// turndown, prettier, markdownlint, jszip) load in this worker's context rather
// than on the page. Excluded from tsc (see tsconfig.json); Astro/Vite bundles
// it via the `new Worker(new URL(...))` reference in src/index.ts.
import { convertWithWarnings } from './main.js';

interface ConvertRequest {
  id: number;
  buffer: ArrayBuffer;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// Signal that the module (and its heavy deps) finished loading. The main thread
// waits for this before sending work; if it never arrives, it falls back to
// converting on the main thread rather than hanging.
ctx.postMessage({ type: 'ready' });

ctx.onmessage = async (event: MessageEvent<ConvertRequest>): Promise<void> => {
  const { id, buffer } = event.data;
  try {
    // The web UI keeps numbered lists numbered — the intuitive default for a
    // point-and-click tool. (The library/CLI still default to bullets for
    // backwards compatibility; see convertOptions in main.ts.)
    const result = await convertWithWarnings(buffer, {
      numberedLists: 'ordered',
    });
    ctx.postMessage({ id, ok: true, result });
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
