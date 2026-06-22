import { defineConfig } from 'astro/config';

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
  vite: {
    optimizeDeps: {
      // The converter UI's client <script> imports src/index.ts, which pulls
      // in heavy deps (mammoth, jszip, turndown). Point Vite's cold-start
      // dependency scanner at that real entry so it doesn't try to parse the
      // .astro pages as JS (which fails: "Expected '>' but found 'title'").
      entries: ['src/index.ts'],
    },
  },
});
