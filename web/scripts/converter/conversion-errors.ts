// Why a conversion failed, the `error` dimension of the anonymous conversion
// counter, sent only with outcome=error. Shared by the browser
// (alerts.ts maps each error to one of these where it picks the message the
// visitor sees, and analytics.ts sends it) and the Worker (worker/index.js),
// which bounds the beacon's `e` parameter to this list, so keep it pure data.
// Only conversions that were attempted are counted: a file refused before
// converting (a legacy .doc, one too large) isn't, so it has no kind here.
//   not-docx    not a Word file at all (a PDF, a README.md)
//   protected   password-protected, or a legacy .doc renamed to .docx
//   invalid     a corrupt or unreadable .docx
//   timeout     the conversion outlived its time limit in the Web Worker
//   load        the converter's code couldn't be downloaded
//   conversion  anything else (the generic "something went wrong")
export const CONVERSION_ERROR_KINDS = [
  'not-docx',
  'protected',
  'invalid',
  'timeout',
  'load',
  'conversion',
] as const;

export type ConversionErrorKind = (typeof CONVERSION_ERROR_KINDS)[number];
