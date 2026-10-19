// Generate the social cards (2400×1260): one per locale
// (public/og/<locale>.png) and one per English guide in web/content/guides
// (public/og/guides/<id>.png, titled from the guide's frontmatter).
//
//   npm run build:site && npm run gen:og   (OG_PORT=… if 4329 is taken)
//   npm run gen:og -- guides               (only the guide cards)
//   npm run gen:og -- de vi                (only these locales)
//
// Renders each card in real Chrome against the built site so it uses the
// self-hosted brand fonts and theme, then screenshots it. The eyebrow and
// tagline come from each locale's dictionary; the wordmark stays English, as
// it does on the page. The outputs are committed rather than built in CI: the
// brand fonts only cover Latin/Vietnamese, so CJK, Cyrillic, Thai, and
// Devanagari text falls back to the machine's system fonts, and a CI runner
// would render those differently (or not at all).
//
// Review the output after regenerating — especially long translations (de,
// ru, vi) and non-Latin scripts — for overflow.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
// Needs --experimental-strip-types on Node 22 (see the gen:og npm script).
import { locales } from '../web/i18n/locales.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public/og');
const guidesDir = path.join(root, 'web/content/guides');
const port = Number(process.env.OG_PORT) || 4329;
const base = `http://localhost:${port}`;

function escapeHtml(s) {
  return s.replace(
    /[&<>"]/g,
    (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`,
  );
}

// Scripts where tracking breaks shaping (Thai, Devanagari, Arabic) or reads wrong
// (CJK): the eyebrow drops its wide letter-spacing for these. Right-to-left
// pages (the card inherits the page's <html dir>) drop it entirely and use
// the sans face: tracking, or a monospace fallback's fixed-width glyphs, pulls
// Arabic's joined letters apart.
const untracked = new Set(['zh', 'zh-hant', 'ja', 'ko', 'hi', 'th', 'ar']);

function card({ eyebrow, tagline }, locale) {
  const lead = escapeHtml(tagline).replace('.docx', '<code>.docx</code>');
  return `
<style>
  html, body { margin: 0; background: #0a1120; }
  #card {
    box-sizing: border-box; width: 1200px; height: 630px; padding: 56px 80px;
    display: flex; flex-direction: column; justify-content: space-between;
    color: #f1f2f7; font-family: var(--font-sans);
    background:
      radial-gradient(ellipse 60% 40% at 38% -10%, rgba(208,216,32,.10), transparent 70%),
      radial-gradient(circle, rgba(154,166,191,.07) 1px, transparent 1.2px) 0 0 / 28px 28px,
      #0a1120;
  }
  .brand { display: flex; align-items: center; gap: 12px; font-family: var(--font-mono); font-size: 18px; color: #9aa6bf; }
  .badge { border: 1.5px solid rgba(208,216,32,.5); background: rgba(208,216,32,.1); color: #d0d820; border-radius: 7px; padding: 3px 9px; font-weight: 700; }
  .eyebrow { margin: 22px 0 0; font-family: var(--font-mono); font-size: 20px; font-weight: 500; letter-spacing: .22em; text-transform: uppercase; color: #d0d820; }
  .untracked .eyebrow { letter-spacing: .04em; }
  [dir="rtl"] .eyebrow { font-family: var(--font-sans); letter-spacing: 0; }
  h1 { margin: 0; font-size: 116px; line-height: .98; font-weight: 600; letter-spacing: -.02em; }
  h1 .w { font-family: var(--font-display); font-style: italic; }
  h1 .to { font-family: var(--font-sans); font-weight: 300; color: #9aa6bf; }
  h1.guide { font-size: 84px; line-height: 1.04; letter-spacing: -.015em; text-wrap: balance; }
  h1 .md { display: block; font-family: var(--font-mono); font-weight: 500; letter-spacing: -.05em; }
  .lead { margin: 0; max-width: 1000px; font-size: 32px; line-height: 1.35; color: #b9c2d6; }
  .lead code { font-family: var(--font-mono); font-size: .9em; color: #eef0f6; background: rgba(255,255,255,.08); border-radius: 6px; padding: 0 5px; }
  .url { margin-top: 14px; font-family: var(--font-mono); font-size: 24px; font-weight: 700; color: #d0d820; }
</style>
<div id="card" class="${untracked.has(locale) ? 'untracked' : ''}">
  <div>
    <div class="brand"><span class="badge">w2m</span>Word to Markdown</div>
    <p class="eyebrow">${escapeHtml(eyebrow)}</p>
  </div>
  <h1><span class="w">Word</span> <span class="to">to</span> <span class="md">Markdown</span></h1>
  <div>
    <p class="lead">${lead}</p>
    <div class="url">word2md.com</div>
  </div>
</div>`;
}

// The guide pages' own titles, from each guide's frontmatter. A tiny parser
// rather than a YAML dependency: the content schema (web/content.config.ts)
// keeps `title` a plain one-line string.
function guides() {
  return readdirSync(guidesDir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((file) => {
      const src = readFileSync(path.join(guidesDir, file), 'utf8');
      const frontmatter = src.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
      const field = (key) =>
        frontmatter
          .match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]
          .trim()
          .replace(/^(['"])(.*)\1$/, '$2');
      const title = field('title');
      if (!title) throw new Error(`web/content/guides/${file} has no title`);
      // The brand row already says "Word to Markdown"; drop it as a suffix.
      return {
        id: file.replace(/\.md$/, ''),
        title: title.replace(/\s+[—–|-]\s+Word to Markdown$/, ''),
        description: field('description') ?? '',
      };
    });
}

// Same frame as the locale card, with the guide title as the headline in
// place of the wordmark, its description as the lead, and its URL.
function guideCard({ id, title, description }) {
  return card({ eyebrow: 'Guide', tagline: description }, 'en')
    .replace(
      /<h1>[\s\S]*?<\/h1>/,
      `<h1 class="guide">${escapeHtml(title)}</h1>`,
    )
    .replace(
      '<div class="url">word2md.com</div>',
      `<div class="url">word2md.com/${escapeHtml(id)}/</div>`,
    );
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `astro preview did not start on ${base} (run build:site first)`,
  );
}

// Astro 7 runs a single preview server per project; reusing someone else's
// (possibly on another port, possibly a stale build) would render the wrong
// thing, and stopping it afterwards would kill it out from under them.
const status = spawnSync('npx', ['astro', 'preview', 'status'], {
  cwd: root,
  encoding: 'utf8',
});
if (!/no preview server/i.test(`${status.stdout}${status.stderr}`)) {
  console.error(
    'An astro preview server is already running. Stop it first: npx astro preview stop',
  );
  process.exit(1);
}

const server = spawn('npx', ['astro', 'preview', '--port', String(port)], {
  cwd: root,
  stdio: 'ignore',
});
try {
  await waitForServer();
  const browser = await chromium.launch({ channel: 'chrome' });
  // bypassCSP: the card is injected markup with its own <style>.
  const context = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 2,
    bypassCSP: true,
  });
  const page = await context.newPage();
  // Each target: the page to load for fonts, the card markup, and the output.
  // Optional CLI args pick a subset: locale codes and/or `guides`.
  const only = process.argv.slice(2);
  const targets = [
    ...locales.map((locale) => ({
      name: locale,
      url: locale === 'en' ? '/' : `/${locale}/`,
      html: card(
        JSON.parse(
          readFileSync(path.join(root, `web/i18n/${locale}.json`), 'utf8'),
        ),
        locale,
      ),
      out: `${locale}.png`,
    })),
    ...guides().map((guide) => ({
      name: 'guides',
      url: `/${guide.id}/`,
      html: guideCard(guide),
      out: `guides/${guide.id}.png`,
    })),
  ].filter((t) => only.length === 0 || only.includes(t.name));
  await mkdir(path.join(outDir, 'guides'), { recursive: true });
  for (const { url, html, out } of targets) {
    // Load the real page first so the @font-face rules and font CSS
    // variables are in place, then swap its body for the card.
    await page.goto(`${base}${url}`);
    await page.evaluate(
      // Runs in the page, not Node
      /* global document, getComputedStyle */
      (html) => {
        document.body.className = '';
        document.body.innerHTML = html;
      },
      html,
    );
    await page.evaluate(() => document.fonts.ready);
    // Long translations: step the tagline down until it fits on two lines.
    await page.evaluate(() => {
      // Guide titles: step the headline down until it fits on three lines.
      const h1 = document.querySelector('h1.guide');
      let h1Size = 84;
      while (h1 && h1Size > 56) {
        const lineHeight = parseFloat(getComputedStyle(h1).lineHeight);
        if (h1.getBoundingClientRect().height <= lineHeight * 3 + 1) break;
        h1Size -= 2;
        h1.style.fontSize = `${h1Size}px`;
      }
      const lead = document.querySelector('.lead');
      let size = 32;
      while (size > 22) {
        const lineHeight = parseFloat(getComputedStyle(lead).lineHeight);
        if (lead.getBoundingClientRect().height <= lineHeight * 2 + 1) break;
        size -= 1;
        lead.style.fontSize = `${size}px`;
      }
    });
    const overflow = await page.evaluate(() => {
      const el = document.getElementById('card');
      return (
        el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth
      );
    });
    if (overflow) console.warn(`⚠ ${out}: card content overflows`);
    await page.locator('#card').screenshot({ path: path.join(outDir, out) });
    console.log(`✓ public/og/${out}`);
  }
  await browser.close();
} finally {
  server.kill();
  // Without a TTY, Astro 7 runs preview as a detached background server that
  // outlives the spawned process (and blocks Playwright's webServer later).
  try {
    execFileSync('npx', ['astro', 'preview', 'stop'], {
      cwd: root,
      stdio: 'ignore',
    });
  } catch {
    /* nothing running */
  }
}
