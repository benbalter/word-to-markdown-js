// Shared round-trip guard: build a .docx from a spec, convert it, and return the
// resulting Markdown (or throw). Used by the spike and build-fixtures so a
// generated fixture is only kept if the real converter can read it.
import os from 'os';
import fs from 'fs';
import path from 'path';
import { docxFromSpec } from './docx-from-spec.mjs';

// The compiled Node converter (run `npm run build:js` first).
const { convert } = await import('../../build/main.js').then((m) => ({
  convert: m.default,
}));

/** Build a spec to .docx bytes and return { buffer, markdown }. Throws on failure. */
export async function specToMarkdown(spec) {
  const buffer = await docxFromSpec(spec);
  const tmp = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'w2m-eval-')),
    `${spec.name || 'fixture'}.docx`,
  );
  fs.writeFileSync(tmp, buffer);
  try {
    const markdown = await convert(tmp);
    return { buffer, markdown };
  } finally {
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  }
}
