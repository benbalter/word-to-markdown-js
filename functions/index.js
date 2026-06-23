// Cloudflare Pages Function for the site root ("/").
//
// Runs ONLY on "/" (the file path `functions/index.js` maps to that route), so
// it never touches localized pages, assets, or the legal pages. On a first
// visit with no language cookie, it sends the visitor to the best-matching
// localized home based on their Accept-Language header; otherwise it serves the
// English root unchanged.
//
// This file is inert on GitHub Pages (Functions only run on Cloudflare Pages),
// so it can live in the repo before the migration is activated.
//
// SEO notes: the redirect is a 302 (temporary), every locale is independently
// crawlable and listed in the sitemap with self-referential hreflang, and the
// decision is based solely on Accept-Language (no user-agent cloaking). A
// `lang` cookie — set on every page by a tiny inline script (see Layout.astro)
// — disables the auto-redirect after the first visit so the language switcher
// stays in control and there is never a redirect loop.

// Non-default locales we can redirect to. English is the default and lives at
// the root, so it is intentionally absent (a match for English means "stay").
// Keep in sync with `locales` in web/i18n/index.ts.
export const SUPPORTED_LOCALES = ['id', 'vi', 'pt', 'es', 'de', 'fr'];

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

export async function onRequest(context) {
  const { request, next } = context;

  // Respect an existing choice — don't auto-redirect once a language is known.
  const cookie = request.headers.get('Cookie') || '';
  if (/(?:^|;\s*)lang=/.test(cookie)) return next();

  const locale = pickLocale(request.headers.get('Accept-Language'));
  if (!locale) return next();

  const url = new URL(request.url);
  return new Response(null, {
    status: 302,
    headers: {
      // Preserve any query string (e.g. ?utm_source=…) across the redirect.
      Location: `${url.origin}/${locale}/${url.search}`,
      // Set the cookie now so the redirect happens at most once.
      'Set-Cookie': `lang=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`,
      'Cache-Control': 'no-store',
      Vary: 'Accept-Language, Cookie',
    },
  });
}
