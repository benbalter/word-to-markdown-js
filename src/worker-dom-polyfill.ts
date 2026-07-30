/// <reference lib="webworker" />
// Side-effect-only module: installs a minimal `window.DOMParser` for the
// conversion worker. Imported *first* by converter.worker.ts, before the
// converter (and therefore turndown) loads.
//
// Turndown's browser build — the one Vite bundles for the worker — reads
// `window.DOMParser` at module-init to choose its HTML parser, and its fallback
// path touches `document.implementation` / `window.ActiveXObject`. A Web Worker
// has no `window`, `document`, or `DOMParser`, so loading the converter threw
// "window is not defined" at load: the worker never became ready and every
// conversion silently fell back to the main thread. Giving turndown a
// domino-backed `DOMParser` (the same pure-JS DOM its Node build uses) makes its
// native-parse fast path succeed so it never reaches the browser-only branches.
//
// This lives in its own module (rather than inline in converter.worker.ts)
// because static `import`s hoist above any code in the same module — the shim
// must be installed before `./main.js` is evaluated, and a separate module
// imported ahead of it guarantees that ordering. It's a no-op wherever a real
// `window` already exists (e.g. a browser main-thread fallback).
import domino from '@mixmark-io/domino';

const globals = globalThis as { window?: unknown; document?: unknown };

if (typeof globals.window === 'undefined') {
  // Some browser builds bundled here call `document.createElement(...)` at load
  // (e.g. decode-named-character-reference decodes entities via an element's
  // innerHTML). A worker has no `document`, so back one with domino — a faithful
  // pure-JS DOM that implements innerHTML/textContent/createElement the same way.
  const doc = domino.createDocument(
    '<!DOCTYPE html><html><head></head><body></body></html>',
  );
  class DominoDOMParser {
    parseFromString(markup: string): Document {
      return domino.createDocument(markup) as unknown as Document;
    }
  }
  globals.document = doc;
  globals.window = { DOMParser: DominoDOMParser, document: doc };
}
