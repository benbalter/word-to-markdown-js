// Whether this build plugs Open & Async, the maker's book. word2md.com does;
// a copy hosted inside a company (say, on an intranet) can leave it out by
// building with `W2M_PROMO=off npm run build`. It's read at build time, so the
// plug isn't hidden in the page, it isn't in the page at all.
//
// One switch covers every plug: the promo card (web/components/home/Promo.astro),
// the line under a result (Converter.astro), the Book in the home page's
// structured data (Home.astro), the llms.txt mentions (web/agent/markdown.ts),
// and sections of the guides fenced with PROMO_START and PROMO_END, which
// withoutPromo removes as web/content.config.ts loads them.
//
// Kept free of Astro runtime imports (types only), so Jest can import it.
import type { Loader } from 'astro/loaders';

/** Whether a `W2M_PROMO` value keeps the plug: anything but off/false/0/no. */
export function promoEnabled(value: string | undefined): boolean {
  return !/^(?:off|false|0|no)$/i.test((value ?? '').trim());
}

export const showPromo = promoEnabled(process.env.W2M_PROMO);

// A guide's plug sits between these two lines (HTML comments, so they don't
// show when the guide renders with the plug on).
export const PROMO_START = '<!-- promo -->';
export const PROMO_END = '<!-- /promo -->';

/** Drop each PROMO_START…PROMO_END section from Markdown text. */
export function stripPromo(markdown: string): string {
  const start = PROMO_START.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const end = PROMO_END.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return markdown
    .replace(new RegExp(`${start}[\\s\\S]*?${end}\\n*`, 'g'), '')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Wrap a content loader so that, with the plug off, each entry's fenced
 * sections are gone from both its body (which the Markdown twins and
 * llms-full.txt reuse) and its rendered HTML. The new digest also keeps
 * Astro's content cache honest: switching the setting either way makes the
 * next build render the guide again instead of reusing the other version.
 */
export function withoutPromo(
  inner: Loader,
  enabled: boolean = showPromo,
): Loader {
  return {
    ...inner,
    async load(context) {
      await inner.load(context);
      if (enabled) return;
      for (const entry of context.store.values()) {
        if (!entry.body?.includes(PROMO_START)) continue;
        const body = stripPromo(entry.body);
        context.store.set({
          ...entry,
          body,
          rendered: await context.renderMarkdown(body),
          digest: context.generateDigest({ body, promo: 'off' }),
        });
      }
    },
  };
}
