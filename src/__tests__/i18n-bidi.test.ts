import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { localeMeta, type Locale } from '../../web/i18n/locales.ts';

// Right-to-left guard. In an RTL string a left-to-right token that starts with
// punctuation, like ".docx", is drawn as "docx." unless it sits inside the
// isolate characters U+2066…U+2069 (web/i18n/README.md). Nothing else checks
// that rule, so a new RTL string could silently ship the broken form.

const i18nDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../web/i18n',
);

const rtlLocales = (Object.keys(localeMeta) as Locale[]).filter(
  (locale) => (localeMeta[locale] as { dir?: string }).dir === 'rtl',
);

function strings(value: unknown, prefix = ''): [string, string][] {
  if (typeof value === 'string') return [[prefix, value]];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => strings(v, `${prefix}[${i}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) =>
      strings(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [];
}

// A file extension the UI names, not preceded by a letter (so "word2md.com"
// and "README.md"-style names inside a longer LTR run don't count twice).
const BARE_EXTENSION = /(?<![\p{L}\p{N}])\.(?:docx|doc|md|zip)\b/u;
const ISOLATED_RUN = /⁦[^⁩]*⁩/gu;

describe('RTL translations isolate left-to-right file extensions', () => {
  it('has at least one RTL locale to check', () => {
    expect(rtlLocales.length).toBeGreaterThan(0);
  });

  it.each(rtlLocales)('%s wraps every .docx/.doc/.md/.zip in ⁦…⁩', (locale) => {
    const dict = JSON.parse(
      readFileSync(path.join(i18nDir, `${locale}.json`), 'utf8'),
    );
    const unwrapped = strings(dict)
      .filter(([, text]) => BARE_EXTENSION.test(text.replace(ISOLATED_RUN, '')))
      .map(([key]) => key);
    expect(unwrapped).toEqual([]);
  });
});
