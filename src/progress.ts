// Internal progress reports from the conversion pipeline (src/main.ts), so the
// web worker (src/converter.worker.ts) can tell the page it's still alive.
// The pipeline's slow stages are synchronous CPU work, so a timer in the
// worker can't fire mid-stage; a report between stages is the only heartbeat
// a busy worker can give. Not part of the package's public API: package.json
// exports only build/main.js, and nothing there re-exports this module.

// A pipeline stage that's about to start.
export type ConversionStage =
  | 'load'
  | 'properties'
  | 'equations'
  | 'mammoth'
  | 'process-html'
  | 'turndown'
  | 'normalize'
  | 'lint'
  | 'prettier'
  | 'restore-equations';

let reporter: ((stage: ConversionStage) => void) | undefined;

// Set (or, with undefined, clear) the one listener for progress reports. The
// worker sets it once at load; elsewhere (Node, the CLI, the main-thread
// fallback) nothing listens and a report costs a function call.
export function setProgressReporter(
  listener: ((stage: ConversionStage) => void) | undefined,
): void {
  reporter = listener;
}

// Report that `stage` is starting. A listener's failure must never fail the
// conversion it's reporting on.
export function reportProgress(stage: ConversionStage): void {
  try {
    reporter?.(stage);
  } catch {
    // Ignore: progress is advisory.
  }
}
