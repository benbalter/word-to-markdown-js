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
  // When true, extract images to relative files (returned on result.images)
  // instead of inlining them as base64. Used by the "Download .zip" action.
  extract?: boolean;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// Signal that the module (and its heavy deps) finished loading. The main thread
// waits for this before sending work; if it never arrives, it falls back to
// converting on the main thread rather than hanging.
ctx.postMessage({ type: 'ready' });

ctx.onmessage = async (event: MessageEvent<ConvertRequest>): Promise<void> => {
  const { id, buffer, extract } = event.data;
  try {
    const result = await convertWithWarnings(
      buffer,
      extract ? { images: 'extract' } : undefined,
    );
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
