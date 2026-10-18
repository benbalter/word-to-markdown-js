// Generate the web app manifest icons (public/icon-192.png, icon-512.png,
// icon-maskable-512.png) from public/favicon.svg.
//
//   npm run gen:icons
//
// Renders the SVG in Chrome via Playwright, so the PNGs match the favicon
// exactly. The maskable icon squares off the rounded corners: platforms crop it
// to their own shape, and the arrow already sits inside the 80% safe zone.
// The outputs are committed; rerun this only when favicon.svg changes.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const favicon = readFileSync(path.join(root, 'public/favicon.svg'), 'utf8');
const maskable = favicon.replace(/\s+rx="[^"]*"/, '');
if (maskable === favicon) {
  throw new Error(
    'favicon.svg has no rx on its background; update this script',
  );
}

const icons = [
  { file: 'icon-192.png', size: 192, svg: favicon },
  { file: 'icon-512.png', size: 512, svg: favicon },
  { file: 'icon-maskable-512.png', size: 512, svg: maskable },
];

const browser = await chromium.launch();
try {
  for (const { file, size, svg } of icons) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
    });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    await page.screenshot({
      path: path.join(root, 'public', file),
      omitBackground: true,
    });
    await page.close();
    console.log(`public/${file}`);
  }
} finally {
  await browser.close();
}
