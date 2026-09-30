// Cloudflare Workers (Static Assets) config. The Worker serves the static Astro
// output (./dist, set in wrangler.config.ts) through the ASSETS binding.
// `runWorkerFirst` runs worker/index.js (instead of serving an asset) for the
// listed routes: "/" applies the Accept-Language redirect (or tags the page
// with a language suggestion), and "/api/event" is the anonymous conversion
// counter. Every other path is served directly from assets. `name` matches the
// Cloudflare project created from the repo.
import { bindings, defineConfig } from 'cf/config';

export default defineConfig({
  worker: {
    name: 'word-to-markdown-js',
    compatibilityDate: '2026-06-01',
    entrypoint: 'worker/index.js',
    // Real-time issue detection: groups uncaught exceptions, 5xx responses, and
    // console.error() calls into Issues in the dashboard. Set here because a
    // dashboard-only toggle is turned off by the next deploy.
    // https://developers.cloudflare.com/workers/observability/issues/
    observability: {
      issues: {
        enabled: true,
      },
    },
    assets: {
      // Unknown paths get dist/404.html with a 404 status instead of a bare
      // Cloudflare error page.
      notFoundHandling: '404-page',
      runWorkerFirst: ['/', '/api/event'],
    },
    env: {
      // Workers Analytics Engine dataset backing the conversion counter. The
      // Worker writes one fire-and-forget data point per conversion (no
      // content, filename, size, IP, or per-user id). Query totals via the SQL
      // API:
      //   SELECT SUM(double1) FROM word2md_events WHERE blob1 = 'convert'
      EVENTS: bindings.analyticsEngineDataset({
        name: 'word2md_events',
      }),
      ASSETS: bindings.assets(),
    },
  },
});
