import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';

// The site's UI strings and warning text. They read only #input's data-*
// strings and the page's language, so a stub document stands in for the page.

// strings.ts imports en.json by name, so Vite keeps only the strings it uses.
// Jest's ESM loader gives a JSON module only a default export, so hand it one
// with the named exports too.
const enPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../web/i18n/en.json',
);
const en = JSON.parse(readFileSync(enPath, 'utf8'));
jest.unstable_mockModule(enPath, () => ({ ...en, default: en }));
const { uiString, withNote } =
  await import('../../web/scripts/converter/strings.ts');
const { localizeWarnings } =
  await import('../../web/scripts/converter/warnings.ts');

// Mount a page whose #input carries the given data-* strings.
function mountPage(dataset: Record<string, string> = {}, lang = 'en'): void {
  const input = { dataset };
  (globalThis as { document?: unknown }).document = {
    documentElement: { lang },
    getElementById: (id: string) => (id === 'input' ? input : null),
  };
}

afterEach(() => {
  delete (globalThis as { document?: unknown }).document;
});

describe('uiString', () => {
  it('falls back to en.json when the page carries no localized string', () => {
    mountPage();
    expect(uiString('copied')).toBe('Copied!');
  });

  it("prefers the page's localized data-* string", () => {
    mountPage({ copied: 'Kopiert!' });
    expect(uiString('copied')).toBe('Kopiert!');
  });

  it('ignores an empty localized string', () => {
    mountPage({ copied: '' });
    expect(uiString('copied')).toBe('Copied!');
  });
});

describe('withNote', () => {
  it('appends a note after a space, or leaves the message alone', () => {
    expect(withNote('Failed.', 'Add the others one at a time.')).toBe(
      'Failed. Add the others one at a time.',
    );
    expect(withNote('Failed.', '')).toBe('Failed.');
  });
});

describe('localizeWarnings', () => {
  it('fills in the sensitivity label', () => {
    mountPage({ warningSensitivity: 'Labeled {label}.' });
    expect(
      localizeWarnings([
        { kind: 'sensitivity', message: 'raw', detail: 'General' },
      ]),
    ).toEqual({ lines: ['Labeled General.'], technical: [] });
  });

  it('keeps a $ in a label literal', () => {
    mountPage({ warningConfidentiality: 'Marked {label}.' });
    const { lines } = localizeWarnings([
      { kind: 'confidentiality', message: 'raw', detail: "$& $'" },
    ]);
    expect(lines).toEqual(["Marked $& $'."]);
  });

  it('collapses content loss into one line naming each kind once', () => {
    mountPage({
      warningContentLossItems: 'Left out: {items}.',
      warningKindEquations: 'equations',
      warningKindImages: 'images',
      warningKindComments: 'comments',
      warningKindOther: 'other elements',
    });
    const details = [
      'An unrecognised element was ignored: {http://schemas.openxmlformats.org/officeDocument/2006/math}oMath',
      'An unrecognised element was ignored: w:someUnknownElement',
      'Image of type image/x-emf is unlikely to display in web browsers',
      'comments (2)',
      'An unrecognised element was ignored: {http://schemas.openxmlformats.org/officeDocument/2006/math}oMathPara',
    ];
    const { lines, technical } = localizeWarnings(
      details.map((detail) => ({
        kind: 'content-loss' as const,
        message: 'raw',
        detail,
      })),
    );
    // "Other" goes last, whatever order the details came in.
    expect(lines).toEqual([
      'Left out: equations, images, comments, and other elements.',
    ]);
    expect(technical).toEqual(details);
  });

  it('uses the generic line when nothing specific can be named', () => {
    mountPage({ warningContentLoss: 'Some content was left out.' });
    const { lines } = localizeWarnings([
      {
        kind: 'content-loss',
        message: 'raw',
        detail: 'An unrecognised element was ignored: w:someUnknownElement',
      },
    ]);
    expect(lines).toEqual(['Some content was left out.']);
  });

  it('names a text box mammoth reports itself as a text box, not an object', () => {
    mountPage({
      warningContentLossItems: 'Left out: {items}.',
      warningKindTextBoxes: 'text boxes',
    });
    const { lines } = localizeWarnings([
      {
        kind: 'content-loss',
        message: 'raw',
        detail:
          'An unrecognised element was ignored: {http://schemas.microsoft.com/office/word/2010/wordprocessingShape}txbx',
      },
    ]);
    expect(lines).toEqual(['Left out: text boxes.']);
  });
});
