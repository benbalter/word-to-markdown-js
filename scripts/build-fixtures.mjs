// A2 (no credits): turn generated specs into committed .docx fixtures.
//
// For each spec in .gen-cache/specs/*.json: build a .docx, round-trip it through
// the real converter, and keep it ONLY if conversion succeeds. Surviving
// fixtures are written to src/__fixtures__/eval/<name>.docx alongside a golden
// snapshot <name>.md (the converter's current output) and a manifest carrying
// each fixture's description. Dropped fixtures are logged, never silently cut.
//
// Prereq: npm run build:js (the round-trip guard imports build/main.js).
// Run: node scripts/build-fixtures.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { specToMarkdown } from './lib/roundtrip.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPEC_DIR = path.join(__dirname, '.gen-cache', 'specs');
const OUT_DIR = path.join(__dirname, '..', 'src', '__fixtures__', 'eval');

async function main() {
  if (!fs.existsSync(SPEC_DIR)) {
    throw new Error(
      `No specs at ${SPEC_DIR}. Run gen-fixture-specs.mjs first.`,
    );
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const specFiles = fs
    .readdirSync(SPEC_DIR)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.raw.json'));

  const manifest = [];
  const dropped = [];
  for (const file of specFiles) {
    const spec = JSON.parse(fs.readFileSync(path.join(SPEC_DIR, file), 'utf8'));
    const name = spec.name || path.basename(file, '.json');
    try {
      const { buffer, markdown } = await specToMarkdown(spec);
      if (!markdown.trim()) throw new Error('empty conversion output');
      fs.writeFileSync(path.join(OUT_DIR, `${name}.docx`), buffer);
      fs.writeFileSync(path.join(OUT_DIR, `${name}.md`), markdown);
      manifest.push({ name, description: spec.description ?? '' });
      console.log(`✓ ${name}`);
    } catch (err) {
      dropped.push({ name, reason: err.message });
      console.warn(`✗ dropped ${name}: ${err.message}`);
    }
  }

  manifest.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(
    path.join(OUT_DIR, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  console.log(
    `\nBuilt ${manifest.length} fixture(s); dropped ${dropped.length}.` +
      (dropped.length
        ? `\nDropped: ${dropped.map((d) => d.name).join(', ')}`
        : ''),
  );
}

await main();
