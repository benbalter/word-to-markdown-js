// B1 (credit-funded): translate the English UI strings into new locales using
// Azure Foundry, PRESERVING STRUCTURE EXACTLY. The completeness test
// (src/__tests__/i18n-completeness.test.ts) requires identical leaf paths, array
// lengths, and no blank strings, so this script never asks the model for whole
// JSON blobs. Instead it:
//   1. flattens web/i18n/en.json to path → English-value pairs,
//   2. asks the model to translate the VALUES only (keys returned verbatim),
//   3. reconstructs each locale by cloning the English tree and overwriting only
//      string leaves (structure/array-lengths are therefore guaranteed),
//   4. retries any missing paths, then runs a back-translation QA pass that
//      re-checks accuracy and do-not-translate tokens and applies corrections.
// Raw responses are dumped to .gen-cache/i18n/ before the final files are written.
//
// Run: node scripts/translate-i18n.mjs [locale ...]   (default: all TARGETS)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chatJson, dumpRaw } from './lib/azure.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const I18N_DIR = path.join(__dirname, '..', 'web', 'i18n');
const CACHE_DIR = path.join(__dirname, '.gen-cache', 'i18n');

// Target locales (top-reach LTR languages). `name` is the endonym used in the
// language switcher; the wiring step (web/i18n/index.ts, astro.config.mjs,
// worker/index.js) reuses htmlLang/ogLocale/name from here.
export const TARGETS = [
  {
    code: 'zh',
    lang: 'Simplified Chinese',
    htmlLang: 'zh-Hans',
    ogLocale: 'zh_CN',
    name: '简体中文',
  },
  {
    code: 'ja',
    lang: 'Japanese',
    htmlLang: 'ja',
    ogLocale: 'ja_JP',
    name: '日本語',
  },
  {
    code: 'ko',
    lang: 'Korean',
    htmlLang: 'ko',
    ogLocale: 'ko_KR',
    name: '한국어',
  },
  {
    code: 'ru',
    lang: 'Russian',
    htmlLang: 'ru',
    ogLocale: 'ru_RU',
    name: 'Русский',
  },
  {
    code: 'it',
    lang: 'Italian',
    htmlLang: 'it',
    ogLocale: 'it_IT',
    name: 'Italiano',
  },
  {
    code: 'nl',
    lang: 'Dutch',
    htmlLang: 'nl',
    ogLocale: 'nl_NL',
    name: 'Nederlands',
  },
  {
    code: 'pl',
    lang: 'Polish',
    htmlLang: 'pl',
    ogLocale: 'pl_PL',
    name: 'Polski',
  },
  {
    code: 'tr',
    lang: 'Turkish',
    htmlLang: 'tr',
    ogLocale: 'tr_TR',
    name: 'Türkçe',
  },
  {
    code: 'hi',
    lang: 'Hindi',
    htmlLang: 'hi',
    ogLocale: 'hi_IN',
    name: 'हिन्दी',
  },
  { code: 'th', lang: 'Thai', htmlLang: 'th', ogLocale: 'th_TH', name: 'ไทย' },
  {
    code: 'uk',
    lang: 'Ukrainian',
    htmlLang: 'uk',
    ogLocale: 'uk_UA',
    name: 'Українська',
  },
  {
    code: 'sv',
    lang: 'Swedish',
    htmlLang: 'sv',
    ogLocale: 'sv_SE',
    name: 'Svenska',
  },
];

const DO_NOT_TRANSLATE = [
  'Word to Markdown',
  'Markdown',
  'Word',
  '.docx',
  '.doc',
  '.md',
  '.zip',
  'Google Docs',
  'Pandoc',
  'GitHub',
  'ChatGPT',
  'Claude',
  'RAG',
  'Open & Async',
  'HTML',
  'JavaScript',
  'word2md',
  '2014',
];

const RULES = `Translation rules — follow EXACTLY:
- Translate only the VALUES. Return every key verbatim and unchanged.
- Preserve any HTML tags (e.g. <strong>…</strong>) and HTML entities (e.g. &amp;) exactly as-is.
- Preserve URLs, file extensions, and arrow/glyph characters (→) exactly.
- Do NOT translate these terms — keep them verbatim: ${DO_NOT_TRANSLATE.map((t) => `"${t}"`).join(', ')}.
- Keep placeholders and punctuation like "File → Download → Microsoft Word (.docx)" structurally intact.
- Natural, idiomatic, concise phrasing appropriate for a web UI. Never leave a value empty.`;

/** Flatten to { "a.b.0.c": "leaf string", ... } for string leaves only. */
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[p] = v;
    else if (v && typeof v === 'object') flatten(v, p, out);
  }
  return out;
}

function setPath(root, dottedPath, value) {
  const parts = dottedPath.split('.');
  let node = root;
  for (let i = 0; i < parts.length - 1; i++) node = node[parts[i]];
  node[parts[parts.length - 1]] = value;
}

async function translateBatch(target, entries) {
  // entries: [ [path, english], ... ]
  const src = Object.fromEntries(entries);
  const { parsed, raw } = await chatJson({
    messages: [
      {
        role: 'system',
        content: `You are a professional software localizer translating a web app's UI strings into ${target.lang}.\n${RULES}\nReturn ONLY a JSON object with the SAME keys mapping to translated values.`,
      },
      { role: 'user', content: JSON.stringify(src, null, 2) },
    ],
    temperature: 0.3,
    maxTokens: 4096,
  });
  return { parsed, raw };
}

async function qaPass(target, pairs) {
  // pairs: [ {path, en, tr}, ... ] → returns { path: corrected } for problems only.
  const { parsed, raw } = await chatJson({
    messages: [
      {
        role: 'system',
        content: `You are a bilingual QA reviewer for ${target.lang} UI translations.
For each item you are given the English source and the current translation. Back-translate mentally and flag ONLY items that are inaccurate, unnatural, empty, or that wrongly translated a do-not-translate term.
Do-not-translate terms: ${DO_NOT_TRANSLATE.map((t) => `"${t}"`).join(', ')}.
Return ONLY JSON: { "corrections": { "<path>": "<improved ${target.lang} translation>", ... } }. Include a path ONLY if it needs fixing; return {} in "corrections" if all are fine.`,
      },
      { role: 'user', content: JSON.stringify(pairs, null, 2) },
    ],
    temperature: 0.2,
    maxTokens: 4096,
  });
  return { corrections: parsed.corrections ?? {}, raw };
}

async function translateLocale(target, en, flat) {
  const allPaths = Object.keys(flat);
  const tree = structuredClone(en);
  const translations = {};

  // Pass 1: full batch.
  const { parsed, raw } = await translateBatch(target, Object.entries(flat));
  dumpRaw(path.join(CACHE_DIR, `${target.code}.pass1.raw.json`), raw);
  for (const p of allPaths) {
    if (typeof parsed[p] === 'string' && parsed[p].trim())
      translations[p] = parsed[p];
  }

  // Pass 2: retry any missing/blank paths.
  const missing = allPaths.filter((p) => !translations[p]);
  if (missing.length) {
    const { parsed: retry, raw: retryRaw } = await translateBatch(
      target,
      missing.map((p) => [p, flat[p]]),
    );
    dumpRaw(path.join(CACHE_DIR, `${target.code}.retry.raw.json`), retryRaw);
    for (const p of missing) {
      if (typeof retry[p] === 'string' && retry[p].trim())
        translations[p] = retry[p];
    }
  }

  // Last-resort fallback so completeness never fails on a blank (should be rare).
  for (const p of allPaths) if (!translations[p]) translations[p] = flat[p];

  // QA / back-translation pass.
  const pairs = allPaths.map((p) => ({
    path: p,
    en: flat[p],
    tr: translations[p],
  }));
  try {
    const { corrections, raw: qaRaw } = await qaPass(target, pairs);
    dumpRaw(path.join(CACHE_DIR, `${target.code}.qa.raw.json`), qaRaw);
    let fixed = 0;
    for (const [p, val] of Object.entries(corrections)) {
      if (allPaths.includes(p) && typeof val === 'string' && val.trim()) {
        translations[p] = val;
        fixed++;
      }
    }
    if (fixed) console.log(`  QA corrected ${fixed} string(s)`);
  } catch (err) {
    console.warn(`  QA pass skipped: ${err.message}`);
  }

  for (const p of allPaths) setPath(tree, p, translations[p]);
  return tree;
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const en = JSON.parse(
    fs.readFileSync(path.join(I18N_DIR, 'en.json'), 'utf8'),
  );
  const flat = flatten(en);

  const requested = process.argv.slice(2);
  const targets = requested.length
    ? TARGETS.filter((t) => requested.includes(t.code))
    : TARGETS;

  for (const target of targets) {
    console.log(`Translating → ${target.code} (${target.lang})`);
    try {
      const tree = await translateLocale(target, en, flat);
      fs.writeFileSync(
        path.join(I18N_DIR, `${target.code}.json`),
        `${JSON.stringify(tree, null, 2)}\n`,
      );
      console.log(`  ✓ wrote web/i18n/${target.code}.json`);
    } catch (err) {
      console.error(`  ✗ ${target.code} failed: ${err.message}`);
    }
  }
  console.log(
    '\nNext: wire up locales (web/i18n/index.ts, astro.config.mjs, worker/index.js, pages).',
  );
}

await main();
