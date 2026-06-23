// Shape of the user-facing string set. Every locale module implements this
// interface, so adding a key to `en` forces every other locale to supply it —
// the type checker is the completeness guard for translations.

export interface FaqEntry {
  q: string;
  a: string;
}

export interface Step {
  /** Short title, e.g. "Upload". */
  t: string;
  /** One-line description. */
  d: string;
}

export interface UIStrings {
  // Hero
  eyebrow: string;
  /** Plain-language tagline under the wordmark (kept literal so it translates cleanly). */
  tagline: string;

  // Visual flow (alt text for the .docx → .md glyph row)
  flowFromAlt: string;
  flowToAlt: string;

  // Converter
  dropzoneTitle: string;
  dropzoneBrowsePrefix: string; // "or "
  dropzoneBrowseLink: string; // "click to browse"
  googleDocHint: string;
  convertSectionAria: string;

  // Results
  convertedLabel: string;
  copyButton: string;
  downloadButton: string;
  panelMarkdown: string;
  panelPreview: string;

  // How it works — exactly three steps are expected (paired with the step icons
  // in Home.astro by index). Typed as an array rather than a 3-tuple so the
  // per-locale JSON dictionaries type-check cleanly when imported.
  steps: Step[];

  // FAQ
  faqHeading: string;
  faqs: FaqEntry[];

  // Footer
  footer: {
    feedback: string;
    source: string;
    donate: string;
    terms: string;
    privacy: string;
  };
  footerTagline: string;
  homeAria: string;

  // <head> / SEO
  metaTitle: string;
  metaDescription: string;
  schemaDescription: string;
  schemaFeatureList: string[];

  // Converter runtime (injected into the DOM as data-* and read by src/index.ts)
  errorGeneric: string;
  dismiss: string;
}
