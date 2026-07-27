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
  /** Longevity trust signal. The "2014" year is a literal and not translated. */
  trustBadge: string;

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
  /** Transient confirmation shown on the copy button after a successful copy. */
  copiedButton: string;
  downloadButton: string;
  /** Transient confirmation shown on the download button after a download. */
  downloadedButton: string;
  /** Resets the converter to accept another document. */
  convertAnother: string;
  panelMarkdown: string;
  panelPreview: string;

  // How it works — exactly three steps are expected (paired with the step icons
  // in Home.astro by index). Typed as an array rather than a 3-tuple so the
  // per-locale JSON dictionaries type-check cleanly when imported.
  steps: Step[];

  // "What gets converted" reference table. Row labels are translated; the
  // Markdown-output column is universal syntax, kept literal in Home.astro and
  // paired with these rows by index (so both arrays must stay the same length).
  conversionHeading: string;
  conversionColElement: string;
  conversionColOutput: string;
  conversionRows: string[];

  // Command-line / open-source callout
  cliHeading: string;
  cliBody: string;
  cliCta: string;

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
  docFileError: string;
  /** Shown when a dropped file exceeds the in-browser size limit. */
  fileTooLargeError: string;
  /** Announced to assistive tech (aria-live) when a conversion succeeds. */
  conversionAnnouncement: string;
  /** Announced to assistive tech while a conversion is in progress. */
  convertingStatus: string;
  dismiss: string;

  // Open & Async promo. `card.*` is the standalone sponsor card (Promo.astro);
  // `resultsLead`/`resultsCta` are the lighter, contextual pitch shown in the
  // post-conversion results pane (Converter.astro). The book title "Open &
  // Async" stays literal in the markup; only the surrounding copy is translated.
  // `card.body` contains a literal <strong> wrapping the title and is rendered
  // with set:html.
  promo: {
    label: string;
    body: string;
    cta: string;
    coverAlt: string;
    resultsLead: string;
    resultsCta: string;
  };
}
