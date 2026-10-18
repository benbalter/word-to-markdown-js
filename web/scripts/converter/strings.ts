// Named imports, so the bundle keeps only these of en.json's strings.
import {
  errorGeneric,
  docFileError,
  invalidFileError,
  notWordFileError,
  protectedFileError,
  copyFailed,
  dismiss,
  copiedButton,
  downloadedButton,
  downloadedZipButton,
  fileTooLargeError,
  conversionAnnouncement,
  convertingStatus,
  onlyFirstFile,
  warnings,
} from '../../i18n/en.json';

// English copy, the fallback for each string below. Read from en.json (the
// source the localized pages render from) so the two can't drift apart.
const ENGLISH_STRINGS = {
  errorGeneric,
  docFileError,
  invalidFileError,
  notWordFileError,
  protectedFileError,
  copyFailed,
  dismiss,
  copied: copiedButton,
  downloaded: downloadedButton,
  downloadedZip: downloadedZipButton,
  fileTooLarge: fileTooLargeError,
  conversionAnnouncement,
  converting: convertingStatus,
  onlyFirstFile,
  warningEncrypted: warnings.encrypted,
  warningSensitivity: warnings.sensitivity,
  warningConfidentiality: warnings.confidentiality,
  warningProtected: warnings.protected,
  warningContentLoss: warnings.contentLoss,
  warningContentLossItems: warnings.contentLossItems,
  warningKindEquations: warnings.contentKinds.equations,
  warningKindImages: warnings.contentKinds.images,
  warningKindSymbols: warnings.contentKinds.symbols,
  warningKindObjects: warnings.contentKinds.objects,
  warningKindOther: warnings.contentKinds.other,
  warningKindComments: warnings.contentKinds.comments,
  warningKindHeadersFooters: warnings.contentKinds.headersFooters,
  warningKindTextBoxes: warnings.contentKinds.textBoxes,
  warningTechnical: warnings.technical,
} satisfies Record<string, string>;

export type UIStringKey = keyof typeof ENGLISH_STRINGS;

// Localized UI strings are rendered into the page as data-* attributes on the
// #input element (see Converter.astro), keeping these modules framework- and
// language-agnostic. Falls back to English when the attribute is absent (e.g.
// in unit tests that mount a bare DOM).
export function uiString(key: UIStringKey): string {
  const input = document.getElementById('input');
  const value = input?.dataset[key];
  return value && value.length > 0 ? value : ENGLISH_STRINGS[key];
}

export function withNote(message: string, note: string): string {
  return note ? `${message} ${note}` : message;
}

// Join names in the page's language ("a, b, and c"; "a、b、c").
export function formatList(items: string[]): string {
  try {
    return new Intl.ListFormat(document.documentElement.lang || 'en', {
      type: 'conjunction',
    }).format(items);
  } catch {
    return items.join(', ');
  }
}
