import { readdirSync, readFileSync } from 'node:fs';
import { markdownTwin, prefersMarkdown } from '../../worker/index.js';

// Markdown for agents: the Worker's content negotiation helpers, and the
// route list it depends on. web/agent/markdown.ts (which needs astro:content,
// so Jest can't import it) gives the home page and every legal page a
// Markdown twin; each of those URLs must be in wrangler.jsonc's
// run_worker_first, or the Worker never sees the request to negotiate it.
// The generated files themselves are checked in e2e/agents.spec.ts.

const root = new URL('../../', import.meta.url);

function runWorkerFirst(): string[] {
  const wrangler = readFileSync(new URL('wrangler.jsonc', root), 'utf8');
  const match = /"run_worker_first":\s*(\[[^\]]*\])/.exec(wrangler);
  if (!match) throw new Error('run_worker_first not found in wrangler.jsonc');
  return JSON.parse(match[1]) as string[];
}

describe('Markdown twins', () => {
  const legalPages = readdirSync(new URL('web/content/legal/', root))
    .filter((f) => f.endsWith('.md'))
    .map((f) => `/${f.replace(/\.md$/, '')}/`);

  it.each(['/', ...legalPages])(
    'routes %s through the Worker so it can serve Markdown',
    (path) => {
      expect(runWorkerFirst()).toContain(path);
    },
  );

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
