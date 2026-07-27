import TurndownService from '@joplin/turndown';
import * as turndownPluginGfm from '@joplin/turndown-plugin-gfm';
import * as mammoth from 'mammoth';
import * as markdownlint from 'markdownlint/sync';
import { applyFixes } from 'markdownlint';
import { parse } from 'node-html-parser';
import * as prettier from 'prettier';
import * as prettierMarkdown from 'prettier/plugins/markdown';
import JSZip from 'jszip';
import fs from 'fs/promises';
import path from 'path';

interface convertOptions {
  mammoth?: object;
  turndown?: object;
}

export interface ConvertResult {
  markdown: string;
  warnings: string[];
}

interface DocumentProperties {
  sensitivity?: string;
  confidentiality?: string;
  encryption?: boolean;
  protection?: boolean;
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
    const location = filePath ? `: "${filePath}"` : '';
    super(
      `Invalid file${location}. The file is not a valid .docx file or is corrupted. Please ensure the file is a valid Microsoft Word document (.docx format).`,
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
  public cause?: Error;

  constructor(message: string, originalError?: Error) {
    super(message);
    this.name = 'ConversionError';
    // Capture stack trace if available (Node.js/V8 specific)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ErrorWithCapture = Error as any;
    if (typeof ErrorWithCapture.captureStackTrace === 'function') {
      ErrorWithCapture.captureStackTrace(this, this.constructor);
    }
    if (originalError) {
      // Use standard error chaining for better debugging tool support
      this.cause = originalError;
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
  // Use manual extension parsing (works in both Node.js and browser)
  const filename = filePath.toLowerCase();
  const lastDotIndex = filename.lastIndexOf('.');
  const ext = lastDotIndex !== -1 ? filename.substring(lastDotIndex) : '';

  if (ext === '.doc') {
    throw new UnsupportedFileError(
      'This tool only supports .docx files, not .doc files. Please save your document as a .docx file and try again.',
    );
  }
}

// Validates that a file path is safe to use and returns the resolved path (Node.js only)
function validateFilePath(filePath: string): string {
  // Resolve to an absolute path first. path.resolve normalizes any `..`
  // segments, so we deliberately do NOT reject paths that merely contain `..`:
  // a relative path like `../report.docx`, or a filename like `notes..docx`, is
  // legitimate CLI/library usage. (There is no sandbox to escape here — a local
  // caller already has full filesystem access.)
  // Note: the path module is Node.js-only, but this function is only called in
  // Node.js contexts (CLI, direct API use with file paths).
  const resolvedPath = path.resolve(filePath);

  // Check for absolute paths to dangerous system directories (Unix-like systems)
  const dangerousPaths = ['/etc/', '/sys/', '/proc/', '/root/', '/boot/'];
  for (const dangerousPath of dangerousPaths) {
    if (resolvedPath.startsWith(dangerousPath)) {
      throw new Error(
        'Invalid file path: access to system directories not allowed',
      );
    }
  }

  // Check for Windows system directories
  const windowsDangerousPaths = ['C:\\Windows\\', 'C:\\Program Files\\'];
  for (const dangerousPath of windowsDangerousPaths) {
    if (resolvedPath.toUpperCase().startsWith(dangerousPath.toUpperCase())) {
      throw new Error(
        'Invalid file path: access to system directories not allowed',
      );
    }
  }

  return resolvedPath;
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

// Convert a numeric code point to a string, returning the original entity text
// for out-of-range values (fromCodePoint throws a RangeError on those, unlike
// the legacy fromCharCode which silently wrapped).
function codePointToString(codePoint: number, original: string): string {
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return original;
  }
}

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

      // Handle numeric entities &#123; (fromCodePoint handles astral-plane
      // code points > U+FFFF, e.g. emoji, which fromCharCode would truncate)
      const numericMatch = entity.match(/^&#(\d+);$/);
      if (numericMatch) {
        return codePointToString(parseInt(numericMatch[1], 10), entity);
      }

      // Handle hex entities &#x1A;
      const hexMatch = entity.match(/^&#x([0-9a-fA-F]+);$/i);
      if (hexMatch) {
        return codePointToString(parseInt(hexMatch[1], 16), entity);
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
      ...defaultTurndownOptions,
      ...options,
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

// Format the Markdown with Prettier
async function prettify(md: string): Promise<string> {
  const formatted = await prettier.format(md, {
    parser: 'markdown',
    plugins: [prettierMarkdown],
  });
  return formatted.trim();
}

// Extract document properties from a .docx file
export async function extractDocumentProperties(
  input: string | ArrayBuffer,
): Promise<DocumentProperties> {
  const properties: DocumentProperties = {};

  try {
    let arrayBuffer: ArrayBuffer;
    if (typeof input === 'string') {
      // Validate the file path to prevent path traversal attacks
      const safePath = validateFilePath(input);

      // Read file from path and convert to ArrayBuffer
      const fileBuffer = await fs.readFile(safePath);
      arrayBuffer = toArrayBuffer(
        fileBuffer.buffer.slice(
          fileBuffer.byteOffset,
          fileBuffer.byteOffset + fileBuffer.byteLength,
        ),
      );
    } else {
      arrayBuffer = input;
    }

    const zip = await JSZip.loadAsync(arrayBuffer);

    // Check for encryption - encrypted files have EncryptionInfo and EncryptedPackage
    const encryptionInfo = zip.file('EncryptionInfo');
    if (encryptionInfo) {
      properties.encryption = true;
    }

    // Try to read core properties
    const corePropsFile = zip.file('docProps/core.xml');
    if (corePropsFile) {
      const coreXml = await corePropsFile.async('string');
      // Look for keywords that might indicate sensitivity/confidentiality
      if (
        coreXml.toLowerCase().includes('confidential') ||
        coreXml.toLowerCase().includes('sensitive')
      ) {
        properties.confidentiality = 'detected in core properties';
      }
    }

    // Try to read custom properties
    const customPropsFile = zip.file('docProps/custom.xml');
    if (customPropsFile) {
      const customXml = await customPropsFile.async('string');
      const customXmlLower = customXml.toLowerCase();

      // Use regex patterns to detect sensitivity/confidentiality properties
      // We use regex instead of full XML parsing for performance and simplicity,
      // as we only need to detect the presence of specific property names, not extract values

      // Pattern matches common sensitivity/confidentiality property names:
      // - "Sensitivity" (standard Office property)
      // - "MSIP_Label_*" (Microsoft Information Protection labels)
      // - Any property with "confidential" or "sensitive" in the name
      // We only check for the property name attribute existence, not the full element content,
      // to avoid potential catastrophic backtracking on large/malformed XML
      const sensitivityPattern =
        /<property[^>]*\bname="(?:Sensitivity|MSIP_Label_[^"]*|[^"]*(?:confidential|sensitive)[^"]*)"[^>]*>/gi;

      const hasSensitivityProperty = sensitivityPattern.test(customXml);
      const hasConfidentialText = customXmlLower.includes('confidential');
      const hasMSIPLabel = customXmlLower.includes('msip_label');

      if (hasSensitivityProperty || hasMSIPLabel) {
        properties.sensitivity = 'detected in custom properties';
      }

      if (hasConfidentialText) {
        properties.confidentiality = 'detected in custom properties';
      }
    }

    // Check for document protection
    const settingsFile = zip.file('word/settings.xml');
    if (settingsFile) {
      const settingsXml = await settingsFile.async('string');
      if (
        settingsXml.includes('<w:documentProtection') ||
        settingsXml.includes('<w:writeProtection')
      ) {
        properties.protection = true;
      }
    }
  } catch (error) {
    // If we can't extract properties, just continue without them
    // This might happen with encrypted, corrupted, or non-standard .docx files
    // We log the error in development mode but don't fail the conversion
    if (process.env.NODE_ENV === 'development') {
      console.warn('Failed to extract document properties:', error);
    }
  }

  return properties;
}

// Generate warnings based on document properties
export function generateWarnings(properties: DocumentProperties): string[] {
  const warnings: string[] = [];

  if (properties.encryption) {
    warnings.push(
      'Warning: This document appears to be encrypted. Conversion may not include all content or may fail entirely.',
    );
  }

  if (properties.sensitivity) {
    warnings.push(
      `Warning: This document has sensitivity labels (${properties.sensitivity}). Please ensure you have permission to convert and share this content.`,
    );
  }

  if (properties.confidentiality) {
    warnings.push(
      `Warning: This document contains confidentiality markers (${properties.confidentiality}). Please verify that conversion is authorized.`,
    );
  }

  if (properties.protection) {
    warnings.push(
      'Warning: This document has editing restrictions enabled. Some content may not convert properly.',
    );
  }

  return warnings;
}

// The input shapes mammoth accepts across environments
type MammothInput =
  { path: string } | { buffer: Buffer } | { arrayBuffer: ArrayBuffer };

// A conversion message emitted by mammoth (e.g. dropped/unsupported content)
interface MammothMessage {
  type: string;
  message: string;
}

// Ensure we have an ArrayBuffer (not a SharedArrayBuffer) by copying if needed
function toArrayBuffer(buffer: ArrayBufferLike): ArrayBuffer {
  if (buffer instanceof ArrayBuffer) {
    return buffer;
  }
  const uint8Array = new Uint8Array(buffer);
  const newArrayBuffer = new ArrayBuffer(uint8Array.byteLength);
  new Uint8Array(newArrayBuffer).set(uint8Array);
  return newArrayBuffer;
}

// The shared conversion pipeline: mammoth HTML -> cleaned, formatted Markdown.
// Returns mammoth's messages so callers can surface content-loss warnings.
async function runConversionPipeline(
  mammothInput: MammothInput,
  options: convertOptions,
): Promise<{ markdown: string; messages: MammothMessage[] }> {
  const mammothResult = await mammoth.convertToHtml(
    mammothInput,
    options.mammoth,
  );
  const processedHtml = processHtml(mammothResult.value);
  const md = htmlToMd(processedHtml, options.turndown);
  const mdWithBullets = convertNumberedListsToBullets(md);
  const normalizedMd = normalizeText(mdWithBullets);
  const cleanedMd = lint(normalizedMd);
  const formattedMd = await prettify(cleanedMd);
  return { markdown: formattedMd, messages: mammothResult.messages };
}

// Substrings (lower-cased) that, in a thrown error's message, indicate the
// input isn't a readable .docx (invalid/corrupt/truncated ZIP, or a missing
// required part). Sourced from JSZip and mammoth, which throw untyped Errors.
const INVALID_DOCX_ERROR_PATTERNS = [
  'end of central directory', // JSZip: invalid ZIP structure
  'zip file', // JSZip: not a valid ZIP
  'corrupted zip', // JSZip: corrupted ZIP file
  'end of data reached', // JSZip: truncated file
  'could not find file', // mammoth: missing required file in .docx
];

function isInvalidDocxError(message: string): boolean {
  const lower = message.toLowerCase();
  return INVALID_DOCX_ERROR_PATTERNS.some((pattern) => lower.includes(pattern));
}

// Translate the errors thrown by the pipeline into our typed, user-facing
// error classes. Always throws (never returns normally).
function classifyConversionError(error: unknown, filePath?: string): never {
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

  // Invalid .docx file errors (from JSZip or mammoth during file parsing).
  // JSZip/mammoth throw plain, untyped Errors with no error code, so message
  // matching is the only signal available. Matching is case-insensitive so a
  // minor wording/capitalization change upstream is less likely to slip through
  // (see INVALID_DOCX_ERROR_PATTERNS). There is a small theoretical risk of
  // matching document content, but these technical phrases are highly unlikely
  // to appear in normal content.
  if (isInvalidDocxError(errorMessage)) {
    // Note: For ArrayBuffer inputs (e.g., web uploads), filePath will be
    // undefined, so the message won't include the original filename.
    throw new InvalidFileError(filePath);
  }

  // Wrap other errors with a general conversion error
  throw new ConversionError(
    'An error occurred while converting the document. Please ensure the file is a valid .docx file and try again.',
    error instanceof Error ? error : undefined,
  );
}

// Turn mammoth's conversion messages into user-facing warnings. Mammoth is
// chatty and emits many cosmetic "unrecognised style" notices on ordinary
// documents; we surface only messages that indicate actual content loss
// (dropped/ignored elements or unconvertible images), de-duplicated.
export function extractMammothWarnings(
  messages: readonly MammothMessage[],
): string[] {
  const seen = new Set<string>();
  const warnings: string[] = [];

  for (const message of messages) {
    if (message.type !== 'warning' && message.type !== 'error') {
      continue;
    }

    const text = message.message.toLowerCase();

    // Skip cosmetic style-mapping notices — they don't drop content
    if (text.includes('style')) {
      continue;
    }

    // Surface only messages that signal dropped or unconvertible content
    const indicatesContentLoss =
      text.includes('ignored') ||
      text.includes('unsupported') ||
      text.includes('could not') ||
      text.includes('image');
    if (!indicatesContentLoss) {
      continue;
    }

    const warning = `Warning: Some document content may not have converted cleanly (${message.message}).`;
    if (!seen.has(warning)) {
      seen.add(warning);
      warnings.push(warning);
    }
  }

  return warnings;
}

// Converts a Word document to crisp, clean Markdown with warnings
export async function convertWithWarnings(
  input: string | ArrayBuffer,
  options: convertOptions = {},
): Promise<ConvertResult> {
  let filePath: string | undefined;

  try {
    // Normalize input so that the underlying .docx content is read at most once
    let mammothInput: MammothInput;
    let propertiesInput: string | ArrayBuffer;

    if (typeof input === 'string') {
      filePath = input;
      // Validate file extension for file path inputs
      validateFileExtension(input);

      // Validate the file path to prevent path traversal attacks
      const safePath = validateFilePath(input);

      // Read the file once and share the buffer between property extraction
      // and Mammoth conversion to avoid redundant disk reads for large documents
      const fileBuffer = await fs.readFile(safePath);
      propertiesInput = toArrayBuffer(
        fileBuffer.buffer.slice(
          fileBuffer.byteOffset,
          fileBuffer.byteOffset + fileBuffer.byteLength,
        ),
      );
      mammothInput = { buffer: fileBuffer };
    } else {
      propertiesInput = input;
      // In Node.js, mammoth expects { buffer }, in browser it expects { arrayBuffer }
      // Check for Buffer availability to determine the environment
      if (typeof Buffer !== 'undefined') {
        mammothInput = { buffer: Buffer.from(input) };
      } else {
        mammothInput = { arrayBuffer: input };
      }
    }

    // Extract document properties to check for confidentiality flags
    const properties = await extractDocumentProperties(propertiesInput);
    const warnings = generateWarnings(properties);

    const { markdown, messages } = await runConversionPipeline(
      mammothInput,
      options,
    );
    warnings.push(...extractMammothWarnings(messages));

    return { markdown, warnings };
  } catch (error) {
    classifyConversionError(error, filePath);
  }
}

// Converts a Word document to crisp, clean Markdown.
// Unlike convertWithWarnings, this skips document-property extraction (and its
// extra ZIP parse) so callers that only need the Markdown pay no overhead.
export default async function convert(
  input: string | ArrayBuffer,
  options: convertOptions = {},
): Promise<string> {
  let filePath: string | undefined;

  try {
    let mammothInput: MammothInput;

    if (typeof input === 'string') {
      filePath = input;
      // Validate file extension for file path inputs
      validateFileExtension(input);
      // Validate the file path to prevent path traversal attacks
      const safePath = validateFilePath(input);
      mammothInput = { path: safePath };
    } else {
      mammothInput = { arrayBuffer: input };
    }

    const { markdown } = await runConversionPipeline(mammothInput, options);
    return markdown;
  } catch (error) {
    classifyConversionError(error, filePath);
  }
}
