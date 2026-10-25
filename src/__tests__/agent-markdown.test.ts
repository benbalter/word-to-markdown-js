import { readdirSync, readFileSync } from 'node:fs';
import { markdownTwin, prefersMarkdown } from '../../worker/index.js';

// Markdown for agents: the Worker's content negotiation helpers, and the
// route list it depends on. web/agent/markdown.ts (which needs astro:content,
// so Jest can't import it) gives the home page and every guide and legal page a
// Markdown twin; each of those URLs must be in wrangler.jsonc's
// run_worker_first, or the Worker never sees the request to negotiate it.
// The generated files themselves are checked in e2e/agents.spec.ts.

const root = new URL('../../', import.meta.url);

function runWorkerFirst(): string[] {
  const wrangler = readFileSync(new URL('wrangler.jsonc', root), 'utf8');
  const match = /"run_worker_first":\s*(\[[^\]]*\])/.exec(wrangler);
  if (!match) throw new Error('run_worker_first not found in wrangler.jsonc');
  // JSONC allows a trailing comma, which JSON.parse doesn't; just take the
  // quoted strings.
  return [...match[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
}

// The headers public/_headers gives `path`, matching rules the way Static
// Assets does: `*` is a splat (any characters), `:name` one path segment.
function headersFor(path: string): string[] {
  const file = readFileSync(new URL('public/_headers', root), 'utf8');
  return file
    .split(/\n(?=\S)/)
    .filter((block) => !block.startsWith('#'))
    .flatMap((block) => {
      const [pattern, ...lines] = block.split('\n');
      const regex = new RegExp(
        `^${pattern
          .trim()
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/:[A-Za-z]\w*/g, '[^/]+')}$`,
      );
      return regex.test(path) ? lines.map((line) => line.trim()) : [];
    })
    .filter(Boolean);
}

describe('Markdown twins', () => {
  const pagesIn = (dir: string): string[] =>
    readdirSync(new URL(`web/content/${dir}/`, root))
      .filter((f) => f.endsWith('.md'))
      .map((f) => `/${f.replace(/\.md$/, '')}/`);

  it.each(['/', ...pagesIn('guides'), ...pagesIn('legal')])(
    'routes %s through the Worker so it can serve Markdown',
    (path) => {
      expect(runWorkerFirst()).toContain(path);
    },
  );

  it.each([
    ['/index.md', 'text/markdown'],
    ...pagesIn('guides').map((p) => [`${p.slice(0, -1)}.md`, 'text/markdown']),
    ...pagesIn('legal').map((p) => [`${p.slice(0, -1)}.md`, 'text/markdown']),
    ['/llms.txt', 'text/plain'],
    ['/llms-full.txt', 'text/plain'],
  ])('serves %s as %s in UTF-8', (path, type) => {
    // Static Assets labels files by extension with no charset; browsers read
    // unlabeled text/plain as windows-1252, garbling non-ASCII text.
    expect(headersFor(path)).toContain(`Content-Type: ${type}; charset=utf-8`);
  });

  it('maps page paths to their twins', () => {
    expect(markdownTwin('/')).toBe('/index.md');
    expect(markdownTwin('/privacy/')).toBe('/privacy.md');
    expect(markdownTwin('/api/event')).toBeNull();
    expect(markdownTwin('/_astro/x.js')).toBeNull();
    expect(markdownTwin('/a/b/')).toBeNull();
    expect(markdownTwin('/de/')).toBeNull();
  });
});

describe('prefersMarkdown', () => {
  it.each([
    ['text/markdown', true],
    ['text/markdown, text/html;q=0.9, */*;q=0.8', true],
    ['text/html, text/markdown', true],
    ['text/plain, text/markdown;q=0.5', true],
  ])('prefers Markdown for %p', (accept, expected) => {
    expect(prefersMarkdown(accept)).toBe(expected);
  });

  it.each([
    // What Chrome sends for a navigation
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    '*/*',
    'text/html, text/markdown;q=0.5',
    'text/markdown;q=0',
    '',
  ])('serves HTML for %p', (accept) => {
    expect(prefersMarkdown(accept)).toBe(false);
  });

  it('serves HTML with no Accept header', () => {
    expect(prefersMarkdown(null)).toBe(false);
  });
});
