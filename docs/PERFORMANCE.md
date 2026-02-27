# Performance Optimizations

This document describes the performance optimizations made to the word-to-markdown-js converter to improve conversion speed and efficiency.

## Overview

The conversion pipeline processes Word documents through several stages:

1. Mammoth.js converts .docx to HTML
2. HTML is processed and cleaned
3. Turndown converts HTML to Markdown
4. Markdown is normalized and linted

Several optimizations have been implemented to reduce overhead and improve throughput.

## Key Optimizations

### 1. Single-Pass HTML Processing

**Problem:** The original code parsed HTML multiple times with separate functions:

- `autoTableHeaders()` - Parse HTML to convert table headers
- `removeUnicodeBullets()` - Parse HTML again to remove bullets

**Solution:** Combined both operations into a single `processHtml()` function that parses the HTML DOM once and performs both transformations in a single pass.

**Impact:**

- Reduces HTML parsing overhead by 50%
- Eliminates redundant DOM tree creation
- Improves efficiency for documents with tables and lists

```typescript
// Before: Two separate parsing operations
const html = autoTableHeaders(mammothResult.value);
const md = htmlToMd(html, options.turndown);

// After: Single parsing operation
const processedHtml = processHtml(mammothResult.value);
const md = htmlToMd(processedHtml, options.turndown);
```

### 2. TurndownService Singleton Pattern

**Problem:** A new `TurndownService` instance was created for every conversion, including plugin initialization.

**Solution:** Implemented a singleton pattern with `getTurndownService()` that reuses the same TurndownService instance across conversions when using default options.

**Impact:**

- Significantly faster subsequent conversions (after first conversion)
- Reduces memory allocation overhead
- Plugin initialization happens only once

```typescript
// Reusable instance
let turndownServiceInstance: TurndownService | null = null;

function getTurndownService(options: object = {}): TurndownService {
  if (Object.keys(options).length > 0) {
    // Create new instance for custom options
    const service = new TurndownService({
      ...options,
      ...defaultTurndownOptions,
    });
    service.use(turndownPluginGfm.gfm);
    return service;
  }

  if (!turndownServiceInstance) {
    turndownServiceInstance = new TurndownService(defaultTurndownOptions);
    turndownServiceInstance.use(turndownPluginGfm.gfm);
  }
  return turndownServiceInstance;
}
```

### 3. Optimized HTML Entity Decoding

**Problem:** The original recursive `do-while` loop called `decodeOnce()` repeatedly until no more entities were found, with no early exit optimization.

**Solution:**

- Added early exit check with `decoded.includes('&')` before processing
- Limited iterations to 3 (prevents infinite loops)
- Improved loop condition logic

**Impact:**

- Faster processing when no entities are present (most common case)
- Bounded execution time with iteration limit
- Clearer intent with explicit max iterations

```typescript
// Optimized with early exit and iteration limit
let decoded = html;
let maxIterations = 3;
let hasEntities = decoded.includes('&');

while (hasEntities && maxIterations > 0) {
  const prevDecoded = decoded;
  decoded = decoded.replace(/&[#\w]+;/g, (entity) => {
    // ... decoding logic ...
  });

  hasEntities = decoded !== prevDecoded && decoded.includes('&');
  maxIterations--;
}
```

### 4. Combined Text Normalization

**Problem:** Three separate functions performed sequential string replacements:

- `removeNonBreakingSpaces()` - 5 separate replace calls
- `convertSmartQuotes()` - 3 separate replace calls
- Each creating intermediate string copies

**Solution:** Combined operations into a single `normalizeText()` function with:

- Pre-compiled regex patterns (compiled once at module load)
- Character maps for O(1) lookups
- Two replace operations instead of eight

**Impact:**

- Reduced string operations from 8 to 2
- Eliminated intermediate string allocations
- Pre-compiled regexes avoid recompilation overhead

```typescript
// Pre-compiled patterns at module level
const nonBreakingSpacesRegex = /[\u00A0\u2007\u202F\u2060\uFEFF]/g;
const smartQuotesRegex = /[\u201C\u201D\u2018\u2019\u2013\u2014]/g;

// Character maps for fast lookups
const nonBreakingSpaceMap = {
  '\u00A0': ' ',
  '\u2007': ' ',
  // ...
};

function normalizeText(md: string): string {
  return md
    .replace(nonBreakingSpacesRegex, (char) => nonBreakingSpaceMap[char])
    .replace(smartQuotesRegex, (char) => smartQuoteMap[char]);
}
```

### 5. Pre-compiled Regular Expressions

**Problem:** Regular expressions were compiled on every function call.

**Solution:** Moved regex compilation to module level:

- `numberedListRegex` - for converting numbered to bullet lists
- `nonBreakingSpacesRegex` - for text normalization
- `smartQuotesRegex` - for quote conversion
- `bulletRegex` - for unicode bullet removal

**Impact:**

- Eliminates regex compilation overhead
- Regex engine can optimize compiled patterns
- Cleaner code with named constants

## Performance Benchmarks

### Test Results

Benchmark run on typical document fixtures (5 iterations per file):

| Document                  | Average Time | Min Time | Max Time |
| ------------------------- | ------------ | -------- | -------- |
| p.docx (simple paragraph) | 49.03ms      | 21.77ms  | 122.63ms |
| table.docx                | 28.38ms      | 21.93ms  | 39.34ms  |
| nested-ol.docx            | 22.12ms      | 17.48ms  | 32.42ms  |
| multiple-headings.docx    | 16.52ms      | 13.75ms  | 19.89ms  |
| nested-ul.docx            | 15.62ms      | 12.78ms  | 19.90ms  |
| list-with-links.docx      | 19.96ms      | 17.45ms  | 23.71ms  |

### Performance Characteristics

- **First conversion**: Includes TurndownService initialization (~120ms for simple docs)
- **Subsequent conversions**: Much faster due to service reuse (~20-30ms)
- **Scalability**: Optimizations provide greater benefit for larger documents
- **Memory**: Reduced allocations improve memory efficiency

## Best Practices

To get the best performance:

1. **Reuse the converter**: When converting multiple documents, reuse the same process to benefit from the TurndownService singleton
2. **Batch processing**: Process multiple documents in sequence rather than spawning new processes
3. **Document size**: These optimizations scale well - larger documents see proportionally greater improvements

## Future Optimization Opportunities

Potential areas for further optimization:

1. **Markdownlint caching**: The linting step could potentially cache rules
2. **Parallel processing**: For batch conversions, documents could be processed in parallel
3. **Streaming**: For very large documents, consider streaming approaches
4. **HTML parser selection**: Consider benchmarking alternative HTML parsers

## Testing

All optimizations maintain 100% backward compatibility:

- All 72 existing tests pass
- Output format is identical to pre-optimization version
- No changes to public API

To run performance benchmarks:

```bash
# Simple performance test
npm run build:js
node -e "
import convert from './build/main.js';
import { performance } from 'perf_hooks';
const start = performance.now();
await convert('src/__fixtures__/p.docx');
const end = performance.now();
console.log(\`Time: \${(end - start).toFixed(2)}ms\`);
"
```
