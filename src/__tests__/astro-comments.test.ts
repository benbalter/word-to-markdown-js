import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Astro ships <!-- HTML comments --> verbatim to every page, so developer notes
// in templates must use {/* JSX comments */}, which are stripped at build.

const webDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../web',
);

const astroFiles = readdirSync(webDir, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.astro'))
  .sort();

describe('.astro templates', () => {
  it('finds the templates', () => {
    expect(astroFiles.length).toBeGreaterThan(0);
  });

  it.each(astroFiles)('%s has no HTML comments', (file) => {
    expect(readFileSync(path.join(webDir, file), 'utf8')).not.toContain('<!--');
  });
});
