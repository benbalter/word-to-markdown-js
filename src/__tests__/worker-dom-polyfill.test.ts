import { jest } from '@jest/globals';

// Unit tests for the side-effect-only DOM shim (src/worker-dom-polyfill.ts).
// The module installs a minimal `window`/`document` (backed by domino) so
// turndown's browser build can load inside a Web Worker, which has no `window`.
// It's gated on `typeof window === 'undefined'` and must be a no-op wherever a
// real `window` already exists. Both branches run once at import time, so each
// case resets the module registry and dynamic-imports after arranging globals.
// `jest` is imported explicitly because it is not a global under ESM.

interface Globals {
  window?: unknown;
  document?: unknown;
}
const globals = globalThis as Globals;

describe('worker DOM polyfill', () => {
  afterEach(() => {
    // Undo any globals the import installed so cases don't leak into each other.
    delete globals.window;
    delete globals.document;
    jest.resetModules();
  });

  it('installs window.DOMParser and document when no window exists', async () => {
    delete globals.window;
    delete globals.document;
    jest.resetModules();

    await import('../worker-dom-polyfill.js');

    // A window with a working DOMParser is now present.
    const win = globals.window as { DOMParser: new () => unknown };
    expect(win).toBeDefined();
    expect(typeof win.DOMParser).toBe('function');
    expect(globals.document).toBeDefined();

    // The installed DOMParser parses markup into a real (domino) Document whose
    // DOM API works — this is the fast path turndown relies on.
    const parser = new win.DOMParser() as {
      parseFromString: (m: string) => Document;
    };
    const doc = parser.parseFromString(
      '<!DOCTYPE html><html><body><p>hi</p></body></html>',
    );
    expect(doc.querySelector('p')?.textContent).toBe('hi');
  });

  it('backs document with a DOM that supports createElement/innerHTML', async () => {
    delete globals.window;
    delete globals.document;
    jest.resetModules();

    await import('../worker-dom-polyfill.js');

    // decode-named-character-reference (bundled here) decodes entities via an
    // element's innerHTML, so the shimmed document must support that.
    const doc = globals.document as Document;
    const el = doc.createElement('div');
    el.innerHTML = '&amp;';
    expect(el.textContent).toBe('&');
  });

  it('is a no-op when a window already exists (browser main thread)', async () => {
    const sentinelWindow = { marker: 'real-window' };
    const sentinelDocument = { marker: 'real-document' };
    globals.window = sentinelWindow;
    globals.document = sentinelDocument;
    jest.resetModules();

    await import('../worker-dom-polyfill.js');

    // The existing globals are left untouched — no domino shim installed over them.
    expect(globals.window).toBe(sentinelWindow);
    expect(globals.document).toBe(sentinelDocument);
  });
});
