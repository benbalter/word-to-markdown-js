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

// Custom error class for file not found
export class FileNotFoundError extends Error {
  constructor(filePath?: string) {
    const location = filePath ? `: "${filePath}"` : '';
    super(
      `File not found${location}. Please check that the file exists and the path is correct.`,
    );
    this.name = 'FileNotFoundError';
  }
}

// Custom error class for invalid/corrupted files
export class InvalidFileError extends Error {
  constructor(filePath?: string) {
    const location = filePath ? ` "${filePath}"` : '';
    super(
      `The file${location} is not a valid .docx file or is corrupted. Please ensure the file is a valid Microsoft Word document (.docx format).`,
    );
    this.name = 'InvalidFileError';
  }
}

// Custom error class for permission errors
export class FilePermissionError extends Error {
  constructor(filePath?: string) {
    const location = filePath ? `: "${filePath}"` : '';
    super(
      `Permission denied${location}. Cannot read the file. Please check file permissions.`,
    );
    this.name = 'FilePermissionError';
  }
}

// Custom error class for general conversion errors
export class ConversionError extends Error {
  constructor(message: string, originalError?: Error) {
    super(message);
    this.name = 'ConversionError';
    if (originalError && originalError.stack) {
      this.stack = `${this.stack}\nCaused by: ${originalError.stack}`;
    }
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

// Turndown will add an empty header if the first row
// of the table isn't `<th>` elements. This function
// converts the first row of a table to `<th>` elements
// so that it renders correctly in Markdown.
function autoTableHeaders(html: string): string {
  const root = parse(html);
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
  return root.toString();
}

// Remove unicode bullets from unnumbered list items
function removeUnicodeBullets(html: string): string {
  const root = parse(html);

  // Common unicode bullets that might appear in Word documents
  const unicodeBullets = ['•', '◦', '▪', '▫', '‣', '⁃', '∙', '·'];
  const bulletRegex = new RegExp(
    `^\\s*[${unicodeBullets.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')}]\\s*`,
  );

  // Find all <li> elements that are children of <ul> (unnumbered lists)
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

// Convert HTML to GitHub-flavored Markdown
export function htmlToMd(html: string, options: object = {}): string {
  // Decode HTML entities before conversion
  const decodedHtml = decodeHtmlEntities(html);
  // Remove unicode bullets from unnumbered lists
  const cleanedHtml = removeUnicodeBullets(decodedHtml);

  const turndownService = new TurndownService({
    ...options,
    ...defaultTurndownOptions,
  });
  turndownService.use(turndownPluginGfm.gfm);
  return turndownService.turndown(cleanedHtml).trim();
}

// Convert numbered lists to bullet lists
function convertNumberedListsToBullets(md: string): string {
  // Replace numbered list items with bullet list items
  // This regex matches lines that start with optional whitespace, a number, a dot, and a space
  return md.replace(/^(\s*)(\d+)\.\s/gm, '$1- ');
}

// Remove unicode non-breaking spaces and replace with regular spaces
function removeNonBreakingSpaces(md: string): string {
  return md
    .replace(/\u00A0/g, ' ') // Non-breaking space
    .replace(/\u2007/g, ' ') // Figure space
    .replace(/\u202F/g, ' ') // Narrow no-break space
    .replace(/\u2060/g, '') // Word joiner (zero-width non-breaking space)
    .replace(/\uFEFF/g, ''); // Zero-width no-break space (BOM)
}

// Convert smart quotes to ASCII equivalents
function convertSmartQuotes(text: string): string {
  return text
    .replace(/[\u201C\u201D]/g, '"') // Replace left and right double quotation marks
    .replace(/[\u2018\u2019]/g, "'") // Replace left and right single quotation marks
    .replace(/[\u2013\u2014]/g, '-'); // Replace en dash and em dash with hyphen
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
  let filePath: string | undefined;

  try {
    if (typeof input === 'string') {
      filePath = input;
      // Validate file extension for file path inputs
      validateFileExtension(input);
      inputObj = { path: input };
    } else {
      inputObj = { arrayBuffer: input };
    }

    const mammothResult = await mammoth.convertToHtml(
      inputObj,
      options.mammoth,
    );
    const html = autoTableHeaders(mammothResult.value);
    const md = htmlToMd(html, options.turndown);
    const mdWithBullets = convertNumberedListsToBullets(md);
    const mdWithoutNbsp = removeNonBreakingSpaces(mdWithBullets);
    const mdWithAsciiQuotes = convertSmartQuotes(mdWithoutNbsp);
    const cleanedMd = lint(mdWithAsciiQuotes);
    return cleanedMd;
  } catch (error) {
    // Re-throw our custom errors as-is
    if (
      error instanceof UnsupportedFileError ||
      error instanceof FileNotFoundError ||
      error instanceof InvalidFileError ||
      error instanceof FilePermissionError ||
      error instanceof ConversionError
    ) {
      throw error;
    }

    // Handle specific error types from underlying libraries
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode =
      error && typeof error === 'object' && 'code' in error
        ? (error as { code: string }).code
        : undefined;

    // File not found errors (only occur with file path inputs)
    if (errorCode === 'ENOENT') {
      throw new FileNotFoundError(filePath);
    }

    // Permission errors (only occur with file path inputs)
    if (errorCode === 'EACCES' || errorCode === 'EPERM') {
      throw new FilePermissionError(filePath);
    }

    // Invalid .docx file errors (from JSZip or mammoth)
    if (
      errorMessage.includes('end of central directory') ||
      errorMessage.includes('zip file') ||
      errorMessage.includes('not a valid') ||
      errorMessage.includes('corrupted') ||
      errorMessage.includes('Corrupted zip') ||
      errorMessage.includes('End of data reached') ||
      errorMessage.includes('Could not find file')
    ) {
      throw new InvalidFileError(filePath);
    }

    // Wrap other errors with a general conversion error
    throw new ConversionError(
      'An error occurred while converting the document. Please ensure the file is a valid .docx file and try again.',
      error instanceof Error ? error : undefined,
    );
  }
}
