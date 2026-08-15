import { jest } from '@jest/globals';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Unit tests for the Web Worker wrapper (src/converter.worker.ts). The converter
// itself is covered by main.test.ts (~90%); this pins the *wrapper contract*:
// the ready signal on load, the request → postMessage response shape, the
// `extract` flag routing to `{ images: 'extract' }`, and — the part nothing else
// tests — how errors are serialized across the worker boundary (name + message,
// not a class instance).
//
// The module references bare `self` at load and posts `{ type: 'ready' }` during
// import, so `globalThis.self` (a postMessage mock + settable onmessage) must be
// arranged *before* a dynamic import. `jest` is imported explicitly (not a global
// under ESM). The module transitively imports worker-dom-polyfill, which installs
// a domino-backed `window`/`document`; that's faithful to how the worker runs.

interface WorkerResponse {
  id: number;
  ok: boolean;
  result?: { markdown: string; warnings: string[]; images?: unknown[] };
  error?: { name: string; message: string };
  type?: string;
}
type MessageHandler = (event: {
  data: { id: number; buffer: ArrayBuffer; extract?: boolean };
}) => Promise<void>;

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
function fixtureBuffer(name: string): ArrayBuffer {
  const buf = readFileSync(path.join(root, 'src/__fixtures__', name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

const postMessage = jest.fn<(msg: WorkerResponse) => void>();
let onmessage: MessageHandler;
let readyMessages: WorkerResponse[];

beforeAll(async () => {
  // Stand in for DedicatedWorkerGlobalScope before the module reads `self`.
  // Point `self` at the real `globalThis` rather than a bare object: mammoth's
  // jszip pulls in `setimmediate`, which binds its global to `self` when present
  // and picks an implementation by feature-detecting it. A bare object hides
  // Node's `process`, sending setimmediate down the browser `postMessage` branch
  // (which then calls `global.attachEvent`). Reusing `globalThis` keeps `process`
  // visible so it selects `process.nextTick`, the correct Node path.
  const g = globalThis as typeof globalThis & {
    self?: unknown;
    postMessage?: unknown;
    onmessage?: MessageHandler;
  };
  g.self = g;
  g.postMessage = postMessage;
  await import('../converter.worker.js');
  // converter.worker assigns its handler to `self.onmessage` (i.e. globalThis).
  onmessage = g.onmessage as MessageHandler;
  // Snapshot what was posted during import before beforeEach clears the mock, so
  // the ready-signal assertion survives the per-test reset.
  readyMessages = postMessage.mock.calls.map((c) => c[0]);
});

describe('converter worker', () => {
  it('posts a ready signal once the module (and its deps) finish loading', () => {
    // The ready message is posted at import time, before any request arrives.
    expect(readyMessages).toContainEqual({ type: 'ready' });
    expect(onmessage).toBeInstanceOf(Function);
  });

  beforeEach(() => {
    // Drop the ready call (and any prior request) so each case asserts in isolation.
    postMessage.mockClear();
  });

  it('converts a valid buffer and posts { id, ok: true, result } with markdown', async () => {
    await onmessage({ data: { id: 7, buffer: fixtureBuffer('h1.docx') } });

    expect(postMessage).toHaveBeenCalledTimes(1);
    const msg = postMessage.mock.calls[0][0];
    expect(msg.id).toBe(7);
    expect(msg.ok).toBe(true);
    // Real conversion, not just a truthy flag: the heading survives the round trip.
    expect(msg.result?.markdown).toContain('# Heading 1');
    expect(Array.isArray(msg.result?.warnings)).toBe(true);
  });

  it('routes the extract flag to image extraction (result.images present)', async () => {
    await onmessage({
      data: { id: 8, buffer: fixtureBuffer('image.docx'), extract: true },
    });

    const msg = postMessage.mock.calls[0][0];
    expect(msg.ok).toBe(true);
    // extract → images returned as files instead of inlined base64 data URIs.
    expect(Array.isArray(msg.result?.images)).toBe(true);
    expect(msg.result?.images?.length).toBeGreaterThan(0);
    expect(msg.result?.markdown).not.toContain('data:image');
  });

  it('inlines images as base64 when extract is not set', async () => {
    await onmessage({ data: { id: 9, buffer: fixtureBuffer('image.docx') } });

    const msg = postMessage.mock.calls[0][0];
    expect(msg.ok).toBe(true);
    expect(msg.result?.markdown).toContain('data:image');
  });

  it('serializes a failed conversion as { id, ok: false, error: { name, message } }', async () => {
    // A non-.docx buffer trips the converter; the thrown error class can't cross
    // the worker boundary, so only its name + message are forwarded.
    const notADocx = new TextEncoder().encode('this is not a docx').buffer;
    await onmessage({ data: { id: 42, buffer: notADocx } });

    expect(postMessage).toHaveBeenCalledTimes(1);
    const msg = postMessage.mock.calls[0][0];
    expect(msg.id).toBe(42);
    expect(msg.ok).toBe(false);
    expect(typeof msg.error?.name).toBe('string');
    expect(msg.error?.name.length).toBeGreaterThan(0);
    expect(typeof msg.error?.message).toBe('string');
    // Serialized as a plain object, never a class instance or Error.
    expect(msg.error).not.toBeInstanceOf(Error);
    expect(msg.result).toBeUndefined();
  });
});
