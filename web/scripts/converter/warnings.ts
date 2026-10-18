import type { WarningDetail } from '../../../src/main.js';
import { formatList, uiString, type UIStringKey } from './strings.ts';

// Turn the converter's structured warnings into localized lines for the UI.
// The converter's own English strings are written for the CLI and library;
// mammoth's raw messages (e.g. "An unrecognised element was ignored:
// w:someUnknownElement") collapse into one plain line, with the raw text kept
// for a "Technical details" disclosure.
export function localizeWarnings(details: readonly WarningDetail[] = []): {
  lines: string[];
  technical: string[];
} {
  const lines: string[] = [];
  const technical: string[] = [];
  for (const warning of details) {
    const label = warning.detail ?? '';
    switch (warning.kind) {
      case 'encrypted':
        lines.push(uiString('warningEncrypted'));
        break;
      case 'sensitivity':
        lines.push(
          uiString('warningSensitivity').replace('{label}', () => label),
        );
        break;
      case 'confidentiality':
        lines.push(
          uiString('warningConfidentiality').replace('{label}', () => label),
        );
        break;
      case 'protected':
        lines.push(uiString('warningProtected'));
        break;
      case 'content-loss':
        technical.push(label);
        break;
    }
  }
  if (technical.length > 0) {
    lines.push(describeContentLoss(technical));
  }
  return { lines, technical };
}

// What kind of content each of mammoth's raw messages is about, so the
// warning can say what's missing ("equations and images") rather than only
// that something is. The converter de-duplicates identical messages, so this
// names kinds, not counts. Mammoth names elements by prefix for the
// namespaces it knows (w:, v:, wp:, mc:, …) and as {namespace-uri}name for
// the rest, Office Math among them.
const CONTENT_KINDS = [
  // Content the converter finds dropped itself, named by its own detail
  // strings ("comments (2)", "headers and footers", "text boxes (1)"). A
  // text box mammoth reports itself ({…wordprocessingShape}txbx) is the same
  // kind, and must match here before "objects" does.
  ['comments', /^comments \(/],
  ['headersFooters', /^headers and footers$/],
  [
    'textBoxes',
    /^(?:text boxes \(|An unrecognised element was ignored: \{[^}]*\/wordprocessingShape\}txbx$)/,
  ],
  // Office Math: <m:oMath>, <m:oMathPara>.
  ['equations', /oMath/],
  // "Image of type … is unlikely to display", "Could not find image file
  // for a:blip element", an unlinked v:imagedata.
  ['images', /image|a:blip/i],
  // <w:sym> with a character mammoth can't map.
  ['symbols', /\bw:sym\b/],
  // An element outside Word's own w: namespace: VML shapes, DrawingML text
  // boxes and groups, charts, embedded objects.
  ['objects', /ignored: (?:\{|(?!w:)[\w-]+:)/],
] as const;

const KIND_KEYS = {
  equations: 'warningKindEquations',
  images: 'warningKindImages',
  symbols: 'warningKindSymbols',
  objects: 'warningKindObjects',
  comments: 'warningKindComments',
  headersFooters: 'warningKindHeadersFooters',
  textBoxes: 'warningKindTextBoxes',
  other: 'warningKindOther',
} as const satisfies Record<string, UIStringKey>;

function describeContentLoss(details: readonly string[]): string {
  const kinds = new Map<keyof typeof KIND_KEYS, string>();
  for (const detail of details) {
    const match = CONTENT_KINDS.find(([, pattern]) => pattern.test(detail));
    const kind = match ? match[0] : 'other';
    if (!kinds.has(kind)) kinds.set(kind, uiString(KIND_KEYS[kind]));
  }
  // Only unrecognized elements: nothing specific to name.
  if (kinds.size === 1 && kinds.has('other')) {
    return uiString('warningContentLoss');
  }
  // "Other elements" reads best last.
  const other = kinds.get('other');
  kinds.delete('other');
  const names = [...kinds.values(), ...(other ? [other] : [])];
  return uiString('warningContentLossItems').replace('{items}', () =>
    formatList(names),
  );
}
