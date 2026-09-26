import {
  pickLocale,
  pickSuggestion,
  SUPPORTED_LOCALES,
} from '../../worker/index.js';

// Unit tests for the Accept-Language matching used by the Cloudflare Worker
// edge redirect (worker/index.js). The Worker itself runs on the CF runtime,
// but the locale-selection logic is pure and worth pinning down.

describe('pickLocale', () => {
  it('returns null when English ranks highest (stay on the root)', () => {
    expect(pickLocale('en-US,en;q=0.9')).toBeNull();
    expect(pickLocale('en')).toBeNull();
  });

  it('matches a supported language by its base tag', () => {
    expect(pickLocale('de-DE,de;q=0.9,en;q=0.8')).toBe('de');
    expect(pickLocale('fr')).toBe('fr');
    expect(pickLocale('vi-VN')).toBe('vi');
  });

  it('maps regional Portuguese variants to pt', () => {
    expect(pickLocale('pt-BR,pt;q=0.9')).toBe('pt');
    expect(pickLocale('pt-PT')).toBe('pt');
  });

  it('sends Traditional Chinese tags to zh-hant and the rest to zh', () => {
    for (const tag of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-TW']) {
      expect(pickLocale(`${tag},en;q=0.8`)).toBe('zh-hant');
    }
    for (const tag of ['zh', 'zh-CN', 'zh-SG', 'zh-Hans', 'zh-Hans-CN']) {
      expect(pickLocale(`${tag},en;q=0.8`)).toBe('zh');
    }
    // Only the zh prefix counts: a lookalike tag isn't Traditional Chinese.
    expect(pickLocale('zhx-TW')).toBeNull();
  });

  it('matches Arabic, including regional variants', () => {
    expect(pickLocale('ar-SA,ar;q=0.9,en;q=0.8')).toBe('ar');
    expect(pickLocale('ar-MA')).toBe('ar');
  });

  it('honors q-value priority over list order', () => {
    expect(pickLocale('en;q=0.5,de;q=0.9')).toBe('de');
    expect(pickLocale('de;q=0.3,en;q=0.9')).toBeNull();
  });

  it('treats q=0 as "not acceptable", not as a low preference', () => {
    expect(pickLocale('fr;q=0')).toBeNull();
    expect(pickLocale('fr;q=0, de;q=0.5')).toBe('de');
  });

  it('skips unsupported languages', () => {
    expect(pickLocale('fa,he;q=0.9')).toBeNull();
    expect(pickLocale('el-GR,el;q=0.9')).toBeNull();
    expect(pickLocale('fa,es;q=0.8')).toBe('es');
  });

  it('handles empty / missing / wildcard input', () => {
    expect(pickLocale('')).toBeNull();
    expect(pickLocale(null)).toBeNull();
    expect(pickLocale(undefined)).toBeNull();
    expect(pickLocale('*')).toBeNull();
  });

  it('only lists non-default locales (English stays at the root)', () => {
    expect(SUPPORTED_LOCALES).not.toContain('en');
    expect(SUPPORTED_LOCALES.length).toBeGreaterThan(0);
  });

  it('keeps the "unsupported" fixtures above genuinely unsupported', () => {
    // If one of these languages is ever added, pick different codes for the
    // "skips unsupported languages" case.
    for (const code of ['fa', 'he', 'el']) {
      expect(SUPPORTED_LOCALES).not.toContain(code);
    }
  });
});

describe('pickSuggestion', () => {
  it('suggests a supported language listed after English', () => {
    expect(pickSuggestion('en-US,en;q=0.9,id;q=0.8', undefined)).toBe('id');
    expect(pickSuggestion('en,zh-TW;q=0.7', undefined)).toBe('zh-hant');
  });

  it("falls back to the visitor's country", () => {
    expect(pickSuggestion('en-US,en;q=0.9', 'ID')).toBe('id');
    expect(pickSuggestion('en-US', 'VN')).toBe('vi');
    expect(pickSuggestion(null, 'ID')).toBe('id');
  });

  it('prefers the Accept-Language signal over the country', () => {
    expect(pickSuggestion('en,vi;q=0.5', 'ID')).toBe('vi');
  });

  it('suggests nothing without a signal', () => {
    expect(pickSuggestion('en-US,en;q=0.9', 'US')).toBeNull();
    expect(pickSuggestion('en-US,en;q=0.9', undefined)).toBeNull();
    expect(pickSuggestion('en,fa;q=0.8', 'IR')).toBeNull();
    expect(pickSuggestion(null, null)).toBeNull();
  });

  it('never suggests a language the browser marks q=0', () => {
    expect(pickSuggestion('en, fr;q=0')).toBeNull();
  });

  it('respects a visitor who chose English over a preferred language', () => {
    // A browser that prefers German is redirected on its first visit, so one
    // still on the English root picked English.
    expect(pickSuggestion('de-DE,de;q=0.9,en;q=0.8', 'DE')).toBeNull();
    expect(pickSuggestion('id', 'ID')).toBeNull();
  });
});
