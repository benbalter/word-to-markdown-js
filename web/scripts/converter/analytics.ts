import type { ConversionErrorKind } from './conversion-errors.ts';
import type { ConversionSource } from './conversion-sources.ts';

// Record an anonymous "a conversion happened" signal so the hosted site can
// gauge whether the tool is still being used (and worth continuing to improve).
// It carries NO document content, filename, size, or any identifier — only the
// outcome (success/error), the page's language, how the conversion started
// (see conversion-sources.ts), and for a failure, which kind of error it was
// (conversion-errors.ts), as a fire-and-forget ping to the Worker
// (worker/index.js), which writes a single Analytics Engine data point. Gated to the production host so self-hosted and local builds send
// nothing (the privacy policy promises no analytics when self-hosted), and fully
// guarded so a failure can never interfere with the conversion itself.
export function recordConversion(
  outcome: 'success' | 'error',
  source: ConversionSource,
  errorKind?: ConversionErrorKind,
): void {
  try {
    if (window.location.hostname !== 'word2md.com') return;
    // The site's locale key (e.g. "pt", "zh-hant"), which the Worker validates.
    const locale = document.documentElement.dataset.locale || 'en';
    let url = `/api/event?o=${outcome}&l=${encodeURIComponent(locale)}&s=${source}`;
    if (outcome === 'error') url += `&e=${errorKind ?? 'conversion'}`;
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(url);
    } else {
      void fetch(url, { method: 'POST', keepalive: true }).catch(() => {});
    }
  } catch {
    /* analytics must never break a conversion */
  }
}
