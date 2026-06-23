# Migrating word2md.com to Cloudflare Workers

This repo is preconfigured for **Cloudflare Workers (Static Assets)** — the
model Cloudflare's Git integration now uses for sites (it runs `wrangler
deploy`, not the older `wrangler pages deploy`).

- `wrangler.jsonc` — serves `dist/` via the `ASSETS` binding and runs the Worker
  first only on `/`.
- `worker/index.js` — the Worker: locale-redirects `/` based on
  `Accept-Language`, and falls through to static assets via `env.ASSETS.fetch()`.
- The site stays a static Astro build (`output: 'static'`); no SSR adapter.

Everything below is done in the Cloudflare dashboard and your DNS — there's no
more code to write. Steps are ordered so the live site never breaks: stand up
Cloudflare in parallel, verify it on its `*.workers.dev` URL, then move the
domain.

> If you connected the repo and the first build failed with _"you have run
> `wrangler deploy` on a Pages project"_ — that was the old Pages-style
> `wrangler.jsonc`. This doc's config fixes it; re-run the build after merging.

## 1. Create the Worker (no DNS change yet)

1. Sign up at <https://dash.cloudflare.com> (free).
2. **Workers & Pages → Create → Import a repository**, authorize GitHub, and
   pick `benbalter/word-to-markdown-js`.
3. Build settings:
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy` (the default)
   - Output is taken from `wrangler.jsonc` (`assets.directory: ./dist`).
4. Deploy. You'll get a `https://word-to-markdown-js.<your-subdomain>.workers.dev`
   URL.

## 2. Verify on the workers.dev URL before touching DNS

- Open the `*.workers.dev` URL and a few localized paths (`/id/`, `/vi/`,
  `/de/`). Confirm pages render and the language switcher works.
- Test the edge redirect (it only runs on Cloudflare, not in a local static
  preview):
  ```sh
  WD=https://word-to-markdown-js.<your-subdomain>.workers.dev
  # 302 to /de/ (no cookie, German preferred):
  curl -sI -H 'Accept-Language: de-DE,de;q=0.9' "$WD/" | grep -i location
  # No redirect (English preferred):
  curl -sI -H 'Accept-Language: en-US,en;q=0.9' "$WD/" | grep -iE 'HTTP|location'
  # No redirect (cookie already set):
  curl -sI -H 'Accept-Language: de' -H 'Cookie: lang=en' "$WD/" | grep -iE 'HTTP|location'
  # Localized path is NOT intercepted:
  curl -sI "$WD/de/" | grep -i HTTP
  ```

## 3. Move the domain

Apex domains (`word2md.com`) need Cloudflare to manage DNS (for CNAME
flattening). Recommended path:

1. In Cloudflare: **Add a site** → `word2md.com` → it scans existing DNS records.
2. At your domain registrar, change the **nameservers** to the two Cloudflare
   gives you. (Propagation: minutes to a few hours.)
3. In the Worker: **Settings → Domains & Routes → Add → Custom domain** →
   `word2md.com` (and optionally `www`). Cloudflare adds the records
   automatically once it manages the zone.
4. Wait for the domain to show **Active** and HTTPS to provision.

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

- **Local check:** `npx wrangler dev` runs the Worker + assets on miniflare
  (`http://localhost:8787`) so you can curl the redirect behavior without
  deploying.
- **Build command:** `npm run build` runs the library `tsc` step too; `npm run
build:site` alone also produces `dist` if you prefer a leaner build.
- **No auto-redirect, if you prefer:** the language switcher already gives full
  manual control. To disable auto-redirect entirely (the most conservative SEO
  choice), set `run_worker_first` to `[]` in `wrangler.jsonc` (or remove
  `worker/index.js` and the `main`/`run_worker_first` keys) and drop the inline
  cookie script in `web/layouts/Layout.astro`.
- **Tuning the redirect:** supported locales live in `SUPPORTED_LOCALES` in
  `worker/index.js`; keep it in sync with `web/i18n/index.ts`.
