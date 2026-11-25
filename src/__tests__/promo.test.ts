import { readdirSync, readFileSync } from 'node:fs';
import {
  PROMO_END,
  PROMO_START,
  promoEnabled,
  stripPromo,
  withoutPromo,
} from '../../web/promo.ts';

// The build-time switch that leaves the Open & Async plug out of a copy
// hosted inside a company (W2M_PROMO=off). The build itself is checked by
// hand; these cover the parts each plug's removal depends on.

const guides = new URL('../../web/content/guides/', import.meta.url);

describe('promoEnabled', () => {
  it.each([undefined, '', 'on', 'true', '1'])('keeps the plug for %j', (v) => {
    expect(promoEnabled(v)).toBe(true);
  });

  it.each(['off', 'OFF', 'false', '0', 'no', ' off '])(
    'drops the plug for %j',
    (value) => {
      expect(promoEnabled(value)).toBe(false);
    },
  );
});

const sample = `# Guide

Before.

${PROMO_START}

## Plug

Buy the book.

${PROMO_END}

## After

Text.
`;

describe('stripPromo', () => {
  it('drops each fenced section and nothing else', () => {
    expect(stripPromo(sample)).toBe(
      '# Guide\n\nBefore.\n\n## After\n\nText.\n',
    );
  });
});

describe('withoutPromo', () => {
  type Entry = {
    id: string;
    body?: string;
    digest?: string;
    rendered?: unknown;
  };
  const load = async (enabled: boolean): Promise<Entry[]> => {
    const store = new Map<string, Entry>();
    const inner = {
      name: 'fake',
      load: async () => {
        store.set('guide', { id: 'guide', body: sample, digest: 'file' });
        store.set('plain', { id: 'plain', body: 'No plug.', digest: 'file' });
      },
    };
    const context = {
      store: {
        values: () => [...store.values()],
        set: (entry: Entry) => store.set(entry.id, entry),
      },
      renderMarkdown: async (body: string) => ({ html: `<rendered>${body}` }),
      generateDigest: (data: unknown) => JSON.stringify(data),
    };
    // The fakes cover only what withoutPromo touches, a sliver of Astro's
    // Loader and LoaderContext, so they're cast rather than built out in full.
    await withoutPromo(inner as never, enabled).load(context as never);
    return [...store.values()];
  };

  it('strips the body, re-renders it, and changes the digest', async () => {
    const [guide, plain] = await load(false);
    expect(guide.body).toBe(stripPromo(sample));
    expect(guide.rendered).toEqual({ html: `<rendered>${stripPromo(sample)}` });
    expect(guide.digest).not.toBe('file');
    // An entry without a plug is left exactly as the inner loader stored it.
    expect(plain).toEqual({ id: 'plain', body: 'No plug.', digest: 'file' });
  });

  it('changes nothing when the plug is on', async () => {
    const [guide] = await load(true);
    expect(guide).toEqual({ id: 'guide', body: sample, digest: 'file' });
  });
});

describe('guides', () => {
  const files = readdirSync(guides).filter((name) => name.endsWith('.md'));

  it.each(files)(
    '%s fences its plug with balanced markers on lines of their own',
    (name) => {
      const text = readFileSync(new URL(name, guides), 'utf8');
      const markers = text
        .split('\n')
        .filter(
          (line) => line.includes('<!-- promo') || line.includes('<!-- /promo'),
        );
      expect(
        markers.every((line) => line === PROMO_START || line === PROMO_END),
      ).toBe(true);
      // Balanced and in order: start, end, start, end…
      expect(markers).toEqual(
        markers.map((_, i) => (i % 2 === 0 ? PROMO_START : PROMO_END)),
      );
      expect(markers.length % 2).toBe(0);
    },
  );

  it('leaves no mention of the book once stripped', () => {
    for (const name of files) {
      const text = stripPromo(readFileSync(new URL(name, guides), 'utf8'));
      expect(text).not.toMatch(/open-and-async|Open and Async/i);
    }
  });
});
