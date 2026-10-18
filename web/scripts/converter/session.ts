import type { BatchEntry } from './batch.ts';

// State shared by the converter UI's modules, kept on one object because an
// imported `let` can't be reassigned by the module that imports it.
export const session = {
  // Incremented per conversion (and by "Convert another"): only the most
  // recent one may show its result, so a superseded conversion's result,
  // error, or preview is discarded.
  activeConversion: 0,
  // The most recently converted Markdown, the copy and download source. Kept
  // here rather than read back from the rendered #output, whose innerText
  // depends on layout.
  lastMarkdown: '',
  // The most recently converted document's bytes, retained so "Download .zip"
  // can re-run the conversion in extract mode (the on-screen Markdown inlines
  // images as base64; the zip needs them as separate files). Null for pasted
  // HTML, which has no file to re-convert.
  lastConvertedBuffer: null as ArrayBuffer | null,
  // The files converted together, when two or more were given at once (empty
  // otherwise): the source of the list and of "Download all".
  batch: [] as BatchEntry[],
};
