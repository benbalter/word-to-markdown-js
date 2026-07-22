// Cloudflare Worker entry for the site (Workers Static Assets model).
//
// The static Astro output in ./dist is served via the ASSETS binding. This
// Worker runs first on "/" and "/api/event" (see `run_worker_first` in
// wrangler.jsonc): on a first visit to "/" with no language cookie it sends the
// visitor to the best Accept-Language match among the non-default locales
// (otherwise it falls through to the static English root), and "/api/event" is
// the anonymous conversion counter. Every other path (localized pages, assets,
// legal pages) is served directly from assets and never reaches here.
//
// Inert on GitHub Pages, which serves only ./dist and never runs this Worker.
//
// SEO: the redirect is a 302 (temporary), every locale is independently
// crawlable and listed in the sitemap with self-referential hreflang, and the
// decision is based solely on Accept-Language (no user-agent cloaking). A
// `lang` cookie — set on every page by a tiny inline script (see Layout.astro)
// — disables the auto-redirect after the first visit so the language switcher
// stays in control and there is never a redirect loop.

// Non-default locales we can redirect to. English is the default and lives at
// the root, so it is intentionally absent (a match for English means "stay").
// Keep in sync with `locales` in web/i18n/index.ts.
export const SUPPORTED_LOCALES = ['id', 'vi', 'pt', 'es', 'de', 'fr'];

// All site locales including the default, used to bound the analytics `locale`
// dimension (a superset of SUPPORTED_LOCALES, which excludes the default).
export const LOCALES = ['en', ...SUPPORTED_LOCALES];

// Pick the highest-priority supported locale from an Accept-Language header.
// Returns a locale string, or null to stay on the English default (either
// because English ranks highest or nothing matched).
export function pickLocale(acceptLanguage) {
  if (!acceptLanguage) return null;
  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam ? parseFloat(qParam.split('=')[1]) : 1;
      return {
        base: tag.trim().toLowerCase().split('-')[0],
        q: Number.isNaN(q) ? 0 : q,
      };
    })
    .filter((entry) => entry.base && entry.base !== '*')
    .sort((a, b) => b.q - a.q);

  for (const { base } of ranked) {
    if (base === 'en') return null; // English preferred → stay on the root.
    if (SUPPORTED_LOCALES.includes(base)) return base;
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Anonymous conversion counter. The browser fires a content-free beacon here
    // when a conversion finishes (see src/index.ts). We record only THAT a
    // conversion happened, its outcome, and the page language — no document
    // content, filename, size, IP, or per-user identifier — as a single
    // Analytics Engine data point. Example queries (SQL API):
    //   total:      SELECT SUM(double1) FROM word2md_events WHERE blob1='convert'
    //   by outcome: SELECT blob2, SUM(double1) ... GROUP BY blob2
    //   by locale:  SELECT blob3, SUM(double1) ... GROUP BY blob3
    if (url.pathname === '/api/event') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      // The endpoint is public, so never write caller-supplied strings verbatim:
      // bound `outcome` to success/error and `locale` to a known site locale
      // (anything else → 'other') to keep the dataset's cardinality fixed.
      const outcome =
        url.searchParams.get('o') === 'error' ? 'error' : 'success';
      const requestedLocale = url.searchParams.get('l');
      const locale = LOCALES.includes(requestedLocale)
        ? requestedLocale
        : 'other';
      // The binding is absent on deploys without Analytics Engine (and the
      // endpoint is unreachable on GitHub Pages, which never runs this Worker),
      // so guard with `?.` to degrade to a no-op rather than throwing.
      env.EVENTS?.writeDataPoint({
        blobs: ['convert', outcome, locale],
        doubles: [1],
      });
      return new Response(null, { status: 204 });
    }

    // Only the root is a candidate for the locale redirect. (run_worker_first
    // also lists "/api/event" above, but that path returned already.)
    if (url.pathname === '/') {
      const cookie = request.headers.get('Cookie') || '';
      const hasLangCookie = /(?:^|;\s*)lang=/.test(cookie);
      if (!hasLangCookie) {
        const locale = pickLocale(request.headers.get('Accept-Language'));
        if (locale) {
          return new Response(null, {
            status: 302,
            headers: {
              // Preserve any query string (e.g. ?utm_source=…) on the redirect.
              Location: `${url.origin}/${locale}/${url.search}`,
              // Set the cookie now so the redirect happens at most once.
              'Set-Cookie': `lang=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`,
              'Cache-Control': 'no-store',
              Vary: 'Accept-Language, Cookie',
            },
          });
        }
      }
    }

    // Serve the matching static asset (index.html for "/", etc.).
    return env.ASSETS.fetch(request);
  },
};
