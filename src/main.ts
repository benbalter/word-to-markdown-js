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
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.doc') {
    throw new UnsupportedFileError(
      'This tool only supports .docx files, not .doc files. Please save your document as a .docx file and try again.',
    );
  }
}

// Decode HTML entities in text content
function decodeHtmlEntities(html: string): string {
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

  function decodeOnce(text: string): string {
    return text.replace(/&[#\w]+;/g, (entity) => {
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
  do {
    prevDecoded = decoded;
    decoded = decodeOnce(decoded);
  } while (decoded !== prevDecoded && decoded.includes('&'));

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
  if (typeof input === 'string') {
    // Validate file extension for file path inputs
    validateFileExtension(input);
    inputObj = { path: input };
  } else {
    inputObj = { arrayBuffer: input };
  }
  const mammothResult = await mammoth.convertToHtml(inputObj, options.mammoth);
  const html = autoTableHeaders(mammothResult.value);
  const md = htmlToMd(html, options.turndown);
  const mdWithBullets = convertNumberedListsToBullets(md);
  const mdWithoutNbsp = removeNonBreakingSpaces(mdWithBullets);
  const mdWithAsciiQuotes = convertSmartQuotes(mdWithoutNbsp);
  const cleanedMd = lint(mdWithAsciiQuotes);
  return cleanedMd;
}
