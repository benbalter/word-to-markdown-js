import { pickLocale, SUPPORTED_LOCALES } from '../../worker/index.js';

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

  it('honors q-value priority over list order', () => {
    expect(pickLocale('en;q=0.5,de;q=0.9')).toBe('de');
    expect(pickLocale('de;q=0.3,en;q=0.9')).toBeNull();
  });

  it('skips unsupported languages', () => {
    expect(pickLocale('ja,ko;q=0.9')).toBeNull();
    expect(pickLocale('zh-CN,zh;q=0.9')).toBeNull();
    expect(pickLocale('ja,es;q=0.8')).toBe('es');
  });

  it('handles empty / missing / wildcard input', () => {
    expect(pickLocale('')).toBeNull();
    expect(pickLocale(null)).toBeNull();
    expect(pickLocale(undefined)).toBeNull();
    expect(pickLocale('*')).toBeNull();
  });

  it('only lists non-default locales (English stays at the root)', () => {
    expect(SUPPORTED_LOCALES).not.toContain('en');
    expect(SUPPORTED_LOCALES).toEqual(['id', 'vi', 'pt', 'es', 'de', 'fr']);
  });
});
