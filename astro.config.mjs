import {
  defineConfig,
  fontProviders,
  passthroughImageService,
} from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import checks from '@nuasite/checks';

// The site is deployed to GitHub Pages at the custom domain word2md.com,
// which serves from the root, so `base` stays `/`.
//
// Astro owns `web/` (srcDir) so it never collides with `src/`, which is
// owned exclusively by `tsc` for the library, CLI, and server.
export default defineConfig({
  site: 'https://word2md.com',
  base: '/',
  srcDir: './web',
  outDir: './dist',
  publicDir: './public',
  output: 'static',
  // Inline all stylesheets into the HTML to remove the render-blocking CSS
  // request — the landing page paints sooner (especially now that the converter
  // JS is code-split and no longer the gate).
  build: { inlineStylesheets: 'always' },
  integrations: [
    // Generate sitemap-index.xml / sitemap-0.xml for the 3 pages (uses `site`).
    sitemap(),
    // Build-time SEO / accessibility / performance / GEO validation. Output is
    // clean (0 errors), so errors fail the build; warnings are advisory.
    checks({
      mode: 'essential',
      seo: true,
      performance: true,
      accessibility: true,
      geo: true,
      failOnError: true,
      failOnWarning: false,
    }),
  ],
  // We use astro:assets only for the Fonts API, not image optimization, so opt
  // out of the default sharp image service (avoids a hard sharp dependency).
  image: { service: passthroughImageService() },
  // Self-host the brand fonts via the Astro Fonts API + Fontsource provider.
  // Fonts are downloaded and served from our own origin at build time — no
  // runtime third-party request (consistent with "nothing is uploaded").
  // Each `cssVariable` is consumed by the Tailwind @theme tokens in global.css.
  //
  // display: 'swap' always ends on the real font (avoids the refresh-to-refresh
  // inconsistency `optional` causes when a font misses its budget). The swap is
  // softened by Astro's auto size-adjust/ascent-override fallback, enabled when
  // the last `fallbacks` entry is a generic family (serif/sans-serif/monospace).
  // (Stable top-level `fonts` in Astro 6; was `experimental.fonts` in v5.)
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'Fraunces',
      cssVariable: '--font-fraunces',
      weights: [400, 500, 600],
      styles: ['normal', 'italic'],
      subsets: ['latin'],
      fallbacks: ['Georgia', 'serif'],
      display: 'swap',
    },
    {
      provider: fontProviders.fontsource(),
      name: 'Hanken Grotesk',
      cssVariable: '--font-hanken',
      weights: [400, 500, 600, 700],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['system-ui', 'sans-serif'],
      display: 'swap',
    },
    {
      provider: fontProviders.fontsource(),
      name: 'JetBrains Mono',
      cssVariable: '--font-jetbrains',
      weights: [400, 500, 700],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['ui-monospace', 'monospace'],
      display: 'swap',
    },
  ],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      // The converter UI's client <script> imports src/index.ts, which pulls
      // in heavy deps (mammoth, jszip, turndown). Point Vite's cold-start
      // dependency scanner at that real entry so it doesn't try to parse the
      // .astro pages as JS (which fails: "Expected '>' but found 'title'").
      entries: ['src/index.ts'],
    },
  },
});
