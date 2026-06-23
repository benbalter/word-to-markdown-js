# Migrating word2md.com to Cloudflare Pages

This repo is preconfigured for Cloudflare Pages:

- `wrangler.jsonc` — sets the build output dir (`dist`) and project name.
- `functions/index.js` — an edge Function that locale-redirects `/` based on
  `Accept-Language` (inert until deployed on Cloudflare Pages).
- The site stays a static Astro build (`output: 'static'`); no SSR adapter.

Everything below is done in the Cloudflare dashboard and your DNS — there's no
more code to write. The steps are ordered so the live site never breaks: you
stand up Cloudflare in parallel, verify it on its `*.pages.dev` URL, and only
then move the domain.

## 1. Create the Pages project (no DNS change yet)

1. Sign up at <https://dash.cloudflare.com> (free).
2. **Workers & Pages → Create → Pages → Connect to Git**, authorize GitHub, and
   pick `benbalter/word-to-markdown-js`.
3. Build settings:
   - **Production branch:** `main`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - Framework preset: Astro (or "None" — `wrangler.jsonc` already sets the
     output dir).
4. Save & Deploy. You'll get a `https://word2md.pages.dev` URL.

## 2. Verify on the pages.dev URL before touching DNS

- Open `https://word2md.pages.dev/` and a few localized paths (`/id/`, `/vi/`,
  `/de/`). Confirm pages render and the language switcher works.
- Test the edge redirect (it only runs on Cloudflare, not locally):
  ```sh
  # Should 302 to /de/ (no cookie, German preferred):
  curl -sI -H 'Accept-Language: de-DE,de;q=0.9' https://word2md.pages.dev/ | grep -i location
  # Should NOT redirect (English preferred):
  curl -sI -H 'Accept-Language: en-US,en;q=0.9' https://word2md.pages.dev/ | grep -i -E 'HTTP|location'
  # Should NOT redirect (cookie already set):
  curl -sI -H 'Accept-Language: de' -H 'Cookie: lang=en' https://word2md.pages.dev/ | grep -i -E 'HTTP|location'
  ```

## 3. Move the domain

Apex domains (`word2md.com`) need Cloudflare to manage DNS (for CNAME
flattening). Recommended path:

1. In Cloudflare: **Add a site** → `word2md.com` → it scans existing DNS records.
2. At your domain registrar, change the **nameservers** to the two Cloudflare
   gives you. (Propagation: minutes to a few hours.)
3. Back in the Pages project: **Custom domains → Set up a custom domain** →
   `word2md.com` (and optionally `www`). Cloudflare adds the records
   automatically once it manages the zone.
4. Wait for the custom domain to show **Active** and HTTPS to provision.

> If you'd rather not move nameservers, you can instead use a `CNAME` to
> `word2md.pages.dev` on a subdomain, but the apex (`word2md.com`) really wants
> Cloudflare-managed DNS. Moving nameservers is the clean option.

## 4. Decommission GitHub Pages (after Cloudflare is live)

Once `https://word2md.com` is served by Cloudflare and verified:

1. Repo **Settings → Pages** → set Source to **None** (disables GitHub Pages).
2. Delete `.github/workflows/static.yml` in a follow-up PR (it deploys to GitHub
   Pages and is now redundant). Cloudflare's Git integration handles deploys.

## Rollback

If anything looks wrong after the DNS move, revert the nameservers (or the
custom-domain record) back to GitHub Pages. Because GitHub Pages stays enabled
until step 4, the old deployment is still there as a fallback.

## Notes & options

- **Build command:** `npm run build` runs the library `tsc` step too; `npm run
build:site` alone also produces `dist` if you prefer a leaner Pages build.
- **No auto-redirect, if you prefer:** the language switcher already gives full
  manual control. If you'd rather not auto-redirect at all (the most
  conservative SEO choice), delete `functions/index.js` and the inline cookie
  script in `web/layouts/Layout.astro`; everything else still works.
- **Tuning the redirect:** supported locales live in `SUPPORTED_LOCALES` in
  `functions/index.js`; keep it in sync with `web/i18n/index.ts`.
