import convert from '../main.js';

describe('integration tests', () => {
  // Test full pipeline with actual .docx fixtures
  it('should handle complete document conversion pipeline', async () => {
    // Test with a complex fixture that exercises multiple features
    const result = await convert('src/__fixtures__/multiple-headings.docx');

    // Verify the complete pipeline worked
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);

    // Should contain markdown elements
    expect(result).toContain('# H1');
    expect(result).toContain('## H2');
    expect(result).toContain('### H3');
    expect(result).toContain('Paragraph');
  });

  it('should maintain document structure integrity', async () => {
    // Test that the conversion maintains logical document structure
    const results = await Promise.all([
      convert('src/__fixtures__/h1.docx'),
      convert('src/__fixtures__/h2.docx'),
      convert('src/__fixtures__/p.docx'),
      convert('src/__fixtures__/strong.docx'),
      convert('src/__fixtures__/em.docx'),
    ]);

    // All conversions should complete successfully
    results.forEach((result) => {
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    // Verify expected content patterns
    expect(results[0]).toMatch(/^# /); // H1 should start with #
    expect(results[1]).toMatch(/^## /); // H2 should start with ##
    expect(results[2]).not.toMatch(/^#/); // Paragraph should not start with #
    expect(results[3]).toContain('**'); // Strong should contain bold markdown
    expect(results[4]).toContain('_'); // Em should contain italic markdown
  });

  it('should handle mixed content documents consistently', async () => {
    // Test documents with mixed formatting
    const fixtures = [
      'multiple-headings',
      'nested-ul',
      'nested-ol',
      'list-with-links',
      'table',
    ];

    const results = await Promise.all(
      fixtures.map((fixture) => convert(`src/__fixtures__/${fixture}.docx`)),
    );

    results.forEach((result) => {
      // All results should be valid
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);

      // Should not contain HTML tags (conversion should be complete)
      expect(result).not.toMatch(/<[^>]+>/);
    });

    // Test specific fixture patterns
    expect(results[0]).toMatch(/^#+\s/m); // multiple-headings should have heading markers
    expect(results[1]).toMatch(/^[\s]*-\s/m); // nested-ul should have list markers
    expect(results[2]).toMatch(/^[\s]*-\s/m); // nested-ol should have list markers
    expect(results[3]).toMatch(/\[.*\]\(.*\)/); // list-with-links should have link syntax
    expect(results[4]).toMatch(/\|.*\|/); // table should have table syntax
    expect(results[4]).toMatch(/\|[\s-]+\|/); // table should have table divider
  });

  it('should produce consistent output for the same input', async () => {
    // Test that multiple conversions of the same file produce identical results
    const fixture = 'src/__fixtures__/strong.docx';

    const results = await Promise.all([
      convert(fixture),
      convert(fixture),
      convert(fixture),
    ]);

    // All results should be identical
    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
    expect(results[0]).toEqual(results[2]);
  });

  it('should handle various file sizes efficiently', async () => {
    // Test performance characteristics with different fixture sizes
    const fixtures = [
      'p.docx', // Small
      'table.docx', // Medium
      'multiple-headings.docx', // Medium-Large
      'small-medium-large.docx', // Large
    ];

    const startTime = Date.now();

    const results = await Promise.all(
      fixtures.map((fixture) => convert(`src/__fixtures__/${fixture}`)),
    );

    const endTime = Date.now();
    const totalTime = endTime - startTime;

    // Should complete all conversions within reasonable time (10 seconds)
    expect(totalTime).toBeLessThan(10000);

    // All results should be valid
    results.forEach((result) => {
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  it('should handle conversion options correctly', async () => {
    const fixture = 'src/__fixtures__/multiple-headings.docx';

    // Test with different options (though main.ts has defaults)
    const defaultResult = await convert(fixture);
    const customResult = await convert(fixture, {
      turndown: {
        headingStyle: 'atx',
        bulletListMarker: '-',
      },
    });

    // Both should succeed
    expect(defaultResult).toBeTruthy();
    expect(customResult).toBeTruthy();

    // Both should contain heading structure
    expect(defaultResult).toMatch(/^#+\s/m);
    expect(customResult).toMatch(/^#+\s/m);
  });

  it('should validate markdown output structure', async () => {
    // Test that output follows proper markdown structure rules
    const fixtures = [
      'h1.docx',
      'h2.docx',
      'multiple-headings.docx',
      'ul.docx',
      'ol.docx',
      'table.docx',
    ];

    for (const fixture of fixtures) {
      const result = await convert(`src/__fixtures__/${fixture}`);

      // Basic structure validation
      expect(result).toBeTruthy();

      // No trailing whitespace on lines
      const lines = result.split('\n');
      lines.forEach((line) => {
        expect(line).not.toMatch(/\s+$/);
      });
    }

    // Test specific fixtures separately to avoid conditional expects
    const h1Result = await convert('src/__fixtures__/h1.docx');
    const h1Lines = h1Result.split('\n').filter((line) => line.match(/^#+\s/));
    expect(h1Lines.length).toBeGreaterThan(0);
    h1Lines.forEach((heading) => {
      expect(heading).toMatch(/^#{1,6}\s+\S/);
    });

    const ulResult = await convert('src/__fixtures__/ul.docx');
    const ulLines = ulResult
      .split('\n')
      .filter((line) => line.match(/^\s*-\s/));
    expect(ulLines.length).toBeGreaterThan(0);
    ulLines.forEach((listItem) => {
      expect(listItem).toMatch(/^(\s)*-\s+\S/);
    });

    const tableResult = await convert('src/__fixtures__/table.docx');
    const tableLines = tableResult
      .split('\n')
      .filter((line) => line.includes('|'));
    expect(tableLines.length).toBeGreaterThan(0);
    expect(tableResult).toMatch(/\|[\s:-]+\|/);
  });

  it('should handle error conditions gracefully', async () => {
    // Test various error conditions
    const errorTests = [
      async () => await convert(''), // Empty path
      async () => await convert('/nonexistent/path.docx'), // Non-existent file
      async () => await convert('src/__tests__/main.test.ts'), // Wrong file type
    ];

    for (const test of errorTests) {
      await expect(test()).rejects.toThrow();
    }
  });

  it('should maintain consistent formatting across different fixtures', async () => {
    // Test that similar elements are formatted consistently across different documents
    const boldFixtures = [
      'strong.docx',
      'text after bold.docx',
      'comma after bold.docx',
    ];
    const results = await Promise.all(
      boldFixtures.map((fixture) => convert(`src/__fixtures__/${fixture}`)),
    );

    // All should use ** for bold formatting
    results.forEach((result) => {
      // All these fixtures should contain bold text
      expect(result).toMatch(/\*\*[^*]+\*\*/); // Should have **bold** syntax
    });

    // Test heading consistency
    const headingFixtures = ['h1.docx', 'h2.docx', 'multiple-headings.docx'];
    const headingResults = await Promise.all(
      headingFixtures.map((fixture) => convert(`src/__fixtures__/${fixture}`)),
    );

    headingResults.forEach((result) => {
      // Should use ATX heading style (# syntax)
      const headingLines = result
        .split('\n')
        .filter((line) => line.match(/^#+\s/));
      expect(headingLines.length).toBeGreaterThan(0); // Should have at least one heading
      headingLines.forEach((heading) => {
        expect(heading).toMatch(/^#+\s/); // Should start with # and space
        expect(heading).not.toMatch(/\n[-=]+$/); // Should not use setext style
      });
    });
  });
});
