// How a conversion started, the `source` dimension of the anonymous conversion
// counter. Shared by the browser beacon (analytics.ts) and the Worker
// (worker/index.js), which bounds the beacon's `s` parameter to this list, so
// keep it pure data. Each value counts one converted document:
//   drop    a single file dropped on the page or chosen with the file picker
//   paste   rich text, or a single .docx file, pasted onto the page
//   batch   each file of two or more dropped, chosen, or pasted together
//   webmcp  an AI agent using the page's WebMCP convert_docx_to_markdown tool
export const CONVERSION_SOURCES = ['drop', 'paste', 'batch', 'webmcp'] as const;

export type ConversionSource = (typeof CONVERSION_SOURCES)[number];
