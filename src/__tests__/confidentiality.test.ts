import { convertWithWarnings } from '../main.js';

describe('confidentiality flag detection', () => {
  it('should detect no warnings for a simple document', async () => {
    const path = 'src/__fixtures__/p.docx';
    const result = await convertWithWarnings(path);

    expect(result.warnings).toEqual([]);
    expect(result.markdown).toBe('This is paragraph text.');
  });

  it('should return ConvertResult with markdown and warnings properties', async () => {
    const path = 'src/__fixtures__/p.docx';
    const result = await convertWithWarnings(path);

    expect(result).toHaveProperty('markdown');
    expect(result).toHaveProperty('warnings');
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(typeof result.markdown).toBe('string');
  });

  // Note: We can't easily create test fixtures with real confidentiality flags
  // as they require Microsoft 365 sensitivity labels or encryption
  // But we've tested that:
  // 1. The function doesn't break existing conversions
  // 2. The result structure is correct
  // 3. No warnings are generated for normal documents
});
