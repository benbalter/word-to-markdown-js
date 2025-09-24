import TurndownService from '@joplin/turndown';

// Test smart quotes conversion directly with HTML input
describe('smart quotes conversion', () => {
  let turndownService: TurndownService;

  beforeEach(() => {
    turndownService = new TurndownService();
  });

  const convertSmartQuotes = (text: string): string => {
    return text
      .replace(/[\u201C\u201D]/g, '"') // Replace left and right double quotation marks
      .replace(/[\u2018\u2019]/g, "'") // Replace left and right single quotation marks
      .replace(/[\u2013\u2014]/g, '-'); // Replace en dash and em dash with hyphen
  };

  it('should convert smart double quotes to ASCII quotes', () => {
    const textWithSmartQuotes = 'This has \u201Csmart quotes\u201D in it.';
    const result = convertSmartQuotes(textWithSmartQuotes);

    expect(result).toBe('This has "smart quotes" in it.');
    expect(result).not.toMatch(/[\u201C\u201D]/);
  });

  it('should convert smart single quotes to ASCII quotes', () => {
    const textWithSmartQuotes =
      'This has \u2018smart single quotes\u2019 in it.';
    const result = convertSmartQuotes(textWithSmartQuotes);

    expect(result).toBe("This has 'smart single quotes' in it.");
    expect(result).not.toMatch(/[\u2018\u2019]/);
  });

  it('should convert em and en dashes to hyphens', () => {
    const textWithDashes = 'This has \u2014 em dash and \u2013 en dash.';
    const result = convertSmartQuotes(textWithDashes);

    expect(result).toBe('This has - em dash and - en dash.');
    expect(result).not.toMatch(/[\u2013\u2014]/);
  });

  it('should convert all smart quote types together', () => {
    const textWithAllTypes =
      'This has \u201Cdouble quotes\u201D, \u2018single quotes\u2019, \u2014 em dash and \u2013 en dash.';
    const result = convertSmartQuotes(textWithAllTypes);

    expect(result).toBe(
      'This has "double quotes", \'single quotes\', - em dash and - en dash.',
    );
    expect(result).not.toMatch(/[\u201C\u201D\u2018\u2019\u2013\u2014]/);
  });

  it('should handle HTML to Markdown conversion with smart quotes', () => {
    const htmlWithSmartQuotes =
      '<p>This has \u201Csmart quotes\u201D and \u2018single quotes\u2019.</p>';
    const markdown = turndownService.turndown(htmlWithSmartQuotes);
    const result = convertSmartQuotes(markdown);

    expect(result).toBe('This has "smart quotes" and \'single quotes\'.');
    expect(result).not.toMatch(/[\u201C\u201D\u2018\u2019]/);
  });
});
