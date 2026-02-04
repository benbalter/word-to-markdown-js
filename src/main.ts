import TurndownService from '@joplin/turndown';
import * as turndownPluginGfm from '@joplin/turndown-plugin-gfm';
import * as mammoth from 'mammoth';
import * as markdownlint from 'markdownlint/sync';
import { applyFixes } from 'markdownlint';
import { parse } from 'node-html-parser';
import path from 'path';

interface convertOptions {
  mammoth?: object;
  turndown?: object;
}

// Custom error class for unsupported file formats
export class UnsupportedFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedFileError';
  }
}

interface turndownOptions {
  headingStyle?: 'setext' | 'atx';
  codeBlockStyle?: 'indented' | 'fenced';
  bulletListMarker?: '*' | '-' | '+';
}

const defaultTurndownOptions: turndownOptions = {
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
};

// Check if a file path has a .doc extension (unsupported format)
export function validateFileExtension(filePath: string): void {
  let ext: string;

  // Check if we're in a Node.js environment (path module available)
  if (typeof path !== 'undefined' && path.extname) {
    ext = path.extname(filePath).toLowerCase();
  } else {
    // Browser environment - use manual parsing
    const filename = filePath.toLowerCase();
    const lastDotIndex = filename.lastIndexOf('.');
    ext = lastDotIndex !== -1 ? filename.substring(lastDotIndex) : '';
  }

  if (ext === '.doc') {
    throw new UnsupportedFileError(
      'This tool only supports .docx files, not .doc files. Please save your document as a .docx file and try again.',
    );
  }
}

// Map of common HTML entities to decode
const decodeMap: { [key: string]: string } = {
  '&amp;': '&',
  // Don't decode &lt; and &gt; in our custom decoder
  // Let Turndown handle them appropriately based on context
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&copy;': '©',
  '&reg;': '®',
  '&trade;': '™',
  '&hellip;': '…',
  '&mdash;': '—',
  '&ndash;': '–',
  '&lsquo;': '\u2018',
  '&rsquo;': '\u2019',
  '&ldquo;': '\u201C',
  '&rdquo;': '\u201D',
};

// Maximum iterations for decoding nested HTML entities to prevent infinite loops
const MAX_DECODE_ITERATIONS = 10;

// Decode HTML entities in text content
function decodeHtmlEntities(html: string): string {
  function decodeOnce(text: string): string {
    // Use a more specific regex pattern to avoid catastrophic backtracking
    // Match: & followed by either:
    //   - a-zA-Z letters (for named entities like &amp;, &nbsp;, etc.)
    //   - # followed by digits (for numeric entities like &#169;)
    //   - #[xX] followed by hex digits (for hex entities like &#x27; or &#X27;)
    // All terminated with a semicolon
    return text.replace(/&(?:[a-zA-Z]+|#\d+|#[xX][0-9a-fA-F]+);/g, (entity) => {
      // Handle named entities
      if (decodeMap[entity]) {
        return decodeMap[entity];
      }

      // Handle numeric entities &#123;
      const numericMatch = entity.match(/^&#(\d+);$/);
      if (numericMatch) {
        return String.fromCharCode(parseInt(numericMatch[1], 10));
      }

      // Handle hex entities &#x1A;
      const hexMatch = entity.match(/^&#x([0-9a-fA-F]+);$/i);
      if (hexMatch) {
        return String.fromCharCode(parseInt(hexMatch[1], 16));
      }

      // Return original if not recognized
      return entity;
    });
  }

  // Keep decoding until no more entities are found (handles double/triple encoding)
  let decoded = html;
  let prevDecoded;
  let iterations = 0;
  do {
    prevDecoded = decoded;
    decoded = decodeOnce(decoded);
    iterations++;
  } while (
    decoded !== prevDecoded &&
    decoded.includes('&') &&
    iterations < MAX_DECODE_ITERATIONS
  );

  return decoded;
}

// Common unicode bullets that might appear in Word documents - compiled once
const unicodeBullets = ['•', '◦', '▪', '▫', '‣', '⁃', '∙', '·'];
const bulletRegex = new RegExp(
  `^\\s*[${unicodeBullets.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')}]\\s*`,
);

// Process HTML in a single pass: convert table headers and remove unicode bullets
// This is more efficient than parsing the HTML twice
function processHtml(html: string): string {
  const root = parse(html);

  // Process tables - convert first row to table headers
  root.querySelectorAll('table').forEach((table) => {
    const firstRow = table.querySelector('tr');
    if (!firstRow) return;

    // If first row already has TH elements, leave it alone
    if (firstRow.querySelector('th')) return;

    // Check if first row is empty or has only empty cells
    const cells = firstRow.querySelectorAll('td');
    const isEmpty =
      cells.length === 0 || cells.every((cell) => !cell.textContent?.trim());

    if (isEmpty) {
      // Remove empty first row and find the first non-empty row to convert
      firstRow.remove();
      const nextRow = table.querySelector('tr');
      if (nextRow) {
        nextRow.querySelectorAll('td').forEach((cell) => {
          cell.tagName = 'th';
        });
      }
    } else {
      // Convert first row TD elements to TH
      cells.forEach((cell) => {
        cell.tagName = 'th';
      });
    }
  });

  // Process lists - remove unicode bullets from unnumbered list items
  root.querySelectorAll('ul li').forEach((listItem) => {
    // Get the text content and remove unicode bullets from the beginning
    const textContent = listItem.innerHTML;
    const cleanedContent = textContent.replace(bulletRegex, '');
    if (cleanedContent !== textContent) {
      listItem.innerHTML = cleanedContent;
    }
  });

  return root.toString();
}

// Reusable TurndownService instance to avoid recreating it for each conversion
let turndownServiceInstance: TurndownService | null = null;

function getTurndownService(options: object = {}): TurndownService {
  // Create a new instance if options are provided, otherwise reuse the singleton
  if (Object.keys(options).length > 0) {
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

// Convert HTML to GitHub-flavored Markdown
export function htmlToMd(html: string, options: object = {}): string {
  // Decode HTML entities before conversion
  const decodedHtml = decodeHtmlEntities(html);

  const turndownService = getTurndownService(options);
  return turndownService.turndown(decodedHtml).trim();
}

// Pre-compiled regex patterns for better performance
const numberedListRegex = /^(\s*)(\d+)\.\s/gm;
const nonBreakingSpacesRegex = /[\u00A0\u2007\u202F\u2060\uFEFF]/g;
const smartQuotesRegex = /[\u201C\u201D\u2018\u2019\u2013\u2014]/g;

// Map for non-breaking space replacements
const nonBreakingSpaceMap: { [key: string]: string } = {
  '\u00A0': ' ', // Non-breaking space
  '\u2007': ' ', // Figure space
  '\u202F': ' ', // Narrow no-break space
  '\u2060': '', // Word joiner (zero-width non-breaking space)
  '\uFEFF': '', // Zero-width no-break space (BOM)
};

// Map for smart quote replacements
const smartQuoteMap: { [key: string]: string } = {
  '\u201C': '"', // Left double quotation mark
  '\u201D': '"', // Right double quotation mark
  '\u2018': "'", // Left single quotation mark
  '\u2019': "'", // Right single quotation mark
  '\u2013': '-', // En dash
  '\u2014': '-', // Em dash
};

// Convert numbered lists to bullet lists
function convertNumberedListsToBullets(md: string): string {
  // Replace numbered list items with bullet list items
  // This regex matches lines that start with optional whitespace, a number, a dot, and a space
  return md.replace(numberedListRegex, '$1- ');
}

// Remove unicode non-breaking spaces and convert smart quotes to ASCII in a single pass
function normalizeText(md: string): string {
  return md
    .replace(nonBreakingSpacesRegex, (char) => nonBreakingSpaceMap[char])
    .replace(smartQuotesRegex, (char) => smartQuoteMap[char]);
}

// Lint the Markdown and correct any issues
function lint(md: string): string {
  const lintResult = markdownlint.lint({ strings: { md } });
  return applyFixes(md, lintResult['md']).trim();
}

// Converts a Word document to crisp, clean Markdown
export default async function convert(
  input: string | ArrayBuffer,
  options: convertOptions = {},
): Promise<string> {
  let inputObj: { path: string } | { arrayBuffer: ArrayBuffer };
  if (typeof input === 'string') {
    // Validate file extension for file path inputs
    validateFileExtension(input);
    inputObj = { path: input };
  } else {
    inputObj = { arrayBuffer: input };
  }
  const mammothResult = await mammoth.convertToHtml(inputObj, options.mammoth);
  const processedHtml = processHtml(mammothResult.value);
  const md = htmlToMd(processedHtml, options.turndown);
  const mdWithBullets = convertNumberedListsToBullets(md);
  const normalizedMd = normalizeText(mdWithBullets);
  const cleanedMd = lint(normalizedMd);
  return cleanedMd;
}
