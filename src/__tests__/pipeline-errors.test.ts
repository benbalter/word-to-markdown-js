import { jest } from '@jest/globals';

// The lint (markdownlint) and format (prettier) stages run late in the
// conversion pipeline (src/main.ts: lint() then prettify()). They are wrapped
// by the same outer try/catch as the rest of convert()/convertWithWarnings(),
// so a throw from either should surface to callers as a ConversionError via
// classifyConversionError — not leak the raw library error. These tests mock
// each stage to throw and lock that contract in place.
//
// Both modules are mocked with harmless passthroughs by default; a module-level
// `throwIn` flag selects which stage throws for a given test. The thrown
// messages are deliberately neutral ("boom …") so they can't match
// INVALID_DOCX_ERROR_PATTERNS and be reclassified as InvalidFileError.

let throwIn: 'none' | 'lint' | 'format' = 'none';

jest.unstable_mockModule('markdownlint/sync', () => ({
  // main.ts calls markdownlint.lint(...); returning no fixable results lets the
  // real applyFixes (imported from 'markdownlint', left unmocked) pass the
  // Markdown through untouched.
  lint: () => {
    if (throwIn === 'lint') throw new Error('boom markdownlint');
    return { md: [] };
  },
}));

jest.unstable_mockModule('prettier', () => ({
  // Passthrough formatter: returns the Markdown unchanged unless asked to throw.
  format: async (md: string) => {
    if (throwIn === 'format') throw new Error('boom prettier');
    return md;
  },
}));

const {
  default: convert,
  convertWithWarnings,
  ConversionError,
} = await import('../main.js');

const VALID = 'src/__fixtures__/p.docx';
const GENERAL_MESSAGE = 'An error occurred while converting the document';

describe('pipeline stage failures', () => {
  afterEach(() => {
    throwIn = 'none';
  });

  it('surfaces a prettier (format stage) throw as ConversionError', async () => {
    throwIn = 'format';
    await expect(convert(VALID)).rejects.toThrow(ConversionError);
    await expect(convert(VALID)).rejects.toThrow(GENERAL_MESSAGE);
  });

  it('surfaces a markdownlint (lint stage) throw as ConversionError', async () => {
    throwIn = 'lint';
    await expect(convert(VALID)).rejects.toThrow(ConversionError);
    await expect(convert(VALID)).rejects.toThrow(GENERAL_MESSAGE);
  });

  it('surfaces stage failures through convertWithWarnings too', async () => {
    throwIn = 'format';
    await expect(convertWithWarnings(VALID)).rejects.toThrow(ConversionError);
  });

  it('preserves the underlying error as ConversionError.cause', async () => {
    throwIn = 'format';
    const error = await convert(VALID).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConversionError);
    expect((error as ConversionError).cause).toBeInstanceOf(Error);
    expect((error as ConversionError).cause?.message).toBe('boom prettier');
  });

  it('converts normally when neither stage throws (mock sanity check)', async () => {
    throwIn = 'none';
    const markdown = await convert(VALID);
    expect(typeof markdown).toBe('string');
    expect(markdown.length).toBeGreaterThan(0);
  });
});
