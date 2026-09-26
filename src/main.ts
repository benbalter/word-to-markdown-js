import TurndownService from '@joplin/turndown';
import * as turndownPluginGfm from '@joplin/turndown-plugin-gfm';
import * as mammoth from 'mammoth';
import * as markdownlint from 'markdownlint/sync';
import { applyFixes } from 'markdownlint';
import { parse, type HTMLElement } from 'node-html-parser';
import * as prettier from 'prettier';
import * as prettierMarkdown from 'prettier/plugins/markdown';
import JSZip from 'jszip';
import fs from 'fs/promises';
import path from 'path';

export interface ConvertOptions {
  mammoth?: object;
  turndown?: object;
  /**
   * How to handle images. `'inline'` (default) keeps Mammoth's base64 data
   * URIs; `'strip'` removes images entirely (useful to avoid multi-MB output
   * from image-heavy documents); `'extract'` replaces each image with a
   * relative `![](imageDir/imageN.ext)` link and returns the image bytes on
   * `ConvertResult.images` (use `convertWithWarnings` to retrieve them).
   */
  images?: 'inline' | 'strip' | 'extract';
  /**
   * Directory prefix used for extracted image links and paths (default
   * `'images'`). Only applies when `images` is `'extract'`. The same value is
   * used for the Markdown link (`![](imageDir/imageN.ext)`) and the returned
   * `ExtractedImage.path`, so links and files always agree.
   */
  imageDir?: string;
  /**
   * How to render Word's numbered lists. `'ordered'` (default) keeps them as
   * `1.`/`2.`/… ordered lists; `'bullets'` converts them to bullet lists
   * (matching the classic word-to-markdown behavior).
   */
  numberedLists?: 'bullets' | 'ordered';
  /**
   * How to handle underlined text. `'ignore'` (default) drops the underline —
   * Mammoth's default, since underlines are easily confused with links in HTML.
   * `'preserve'` keeps it as an inline `<u>…</u>` tag (rendered by GitHub-flavored
   * Markdown). Note that superscript and subscript are always preserved as
   * `<sup>`/`<sub>` and need no option.
   */
  underline?: 'ignore' | 'preserve';
  /**
   * How to render Word's footnotes and endnotes. `'gfm'` (default) rewrites
   * Mammoth's superscript reference links plus trailing note list into standard
   * GitHub-flavored/Pandoc footnote syntax (`[^1]` references and `[^1]:`
   * definitions). `'preserve'` keeps Mammoth's raw `<sup>` links and numbered
   * note list (useful for CommonMark targets that don't support `[^1]`).
   */
  footnotes?: 'gfm' | 'preserve';
}

// Mammoth's options object, narrowed to the field we merge into. Mammoth appends
// a provided styleMap to its default map, so adding an entry keeps the built-in
// mappings (including superscript/subscript) intact.
interface MammothOptions {
  styleMap?: string[];
  [key: string]: unknown;
}

// An image pulled out of the document by `images: 'extract'`. `path` is the
// relative link used in the Markdown (e.g. `images/image1.png`); `bytes` is the
// raw file content for the caller to write to disk or bundle into a zip.
export interface ExtractedImage {
  path: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface ConvertResult {
  markdown: string;
  warnings: string[];
  /** Present (possibly empty) when converting with `images: 'extract'`. */
  images?: ExtractedImage[];
}

export interface DocumentProperties {
  sensitivity?: string;
  confidentiality?: string;
  encryption?: boolean;
  protection?: boolean;
}

// Base class for every user-facing error the converter throws, so callers can
// catch them all with one instanceof check
export class WordToMarkdownError extends Error {}

// Custom error class for unsupported file formats
export class UnsupportedFileError extends WordToMarkdownError {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedFileError';
  }
}

// Custom error class for file not found
export class FileNotFoundError extends WordToMarkdownError {
  constructor(filePath?: string) {
    const location = filePath ? `: "${filePath}"` : '';
    super(
      `File not found${location}. Please check that the file exists and the path is correct.`,
    );
    this.name = 'FileNotFoundError';
  }
}

// Custom error class for invalid/corrupted files
export class InvalidFileError extends WordToMarkdownError {
  constructor(filePath?: string) {
    const location = filePath ? `: "${filePath}"` : '';
    super(
      `Invalid file${location}. The file is not a valid .docx file or is corrupted. Please ensure the file is a valid Microsoft Word document (.docx format).`,
    );
    this.name = 'InvalidFileError';
  }
}

// Custom error class for permission errors
export class FilePermissionError extends WordToMarkdownError {
  constructor(filePath?: string) {
    const location = filePath ? `: "${filePath}"` : '';
    super(
      `Permission denied${location}. Cannot read the file. Please check file permissions.`,
    );
    this.name = 'FilePermissionError';
  }
}

// Custom error class for general conversion errors
export class ConversionError extends WordToMarkdownError {
  constructor(message: string, originalError?: Error) {
    // Standard error chaining for better debugging tool support
    super(message, originalError ? { cause: originalError } : undefined);
    this.name = 'ConversionError';
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
      throw new FilePermissionError(filePath);
    }
  }

  // Check for Windows system directories
  const windowsDangerousPaths = ['C:\\Windows\\', 'C:\\Program Files\\'];
  for (const dangerousPath of windowsDangerousPaths) {
    if (resolvedPath.toUpperCase().startsWith(dangerousPath.toUpperCase())) {
      throw new FilePermissionError(filePath);
    }
  }

  return resolvedPath;
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

// A row's own cells, excluding cells of any table nested inside it
function rowCells(row: HTMLElement): HTMLElement[] {
  // Text nodes have no tagName, hence the optional chain
  return (row.childNodes as HTMLElement[]).filter(
    (node: HTMLElement) => node.tagName?.toLowerCase() === 'td',
  );
}

// Process HTML in a single pass: optionally strip images, convert table
// headers, and remove unicode bullets. This is more efficient than parsing the
// HTML twice.
/** @internal Exported for tests only. */
export function processHtml(
  html: string,
  opts: { stripImages?: boolean } = {},
): string {
  const root = parse(html);

  // Remove images (Mammoth inlines them as base64 data URIs by default, which
  // can bloat the output for image-heavy documents).
  if (opts.stripImages) {
    root.querySelectorAll('img').forEach((img: HTMLElement) => img.remove());
  }

  // Unwrap single-cell tables whose only content is a <pre> code block. Word and
  // LibreOffice commonly wrap a code block in a bordered 1×1 table (a shaded box);
  // left alone, Turndown would render the code as a one-cell Markdown table. This
  // must run before the header-promotion pass below, which would otherwise turn
  // the code cell's <td> into a <th> and mangle the block.
  root.querySelectorAll('table').forEach((table: HTMLElement) => {
    const rows = table.querySelectorAll('tr');
    if (rows.length !== 1) return;
    const cells = rows[0].querySelectorAll('td');
    if (cells.length !== 1) return;
    const cell = cells[0];
    const pres = cell.querySelectorAll('pre');
    // Only unwrap when the cell holds exactly one <pre> and nothing else of
    // substance (its text is entirely the code) — never strip a table that also
    // contains prose or other elements alongside the code.
    if (pres.length !== 1) return;
    if (cell.textContent.trim() !== pres[0].textContent.trim()) return;
    table.replaceWith(pres[0]);
  });

  // Process tables - convert first row to table headers
  root.querySelectorAll('table').forEach((table: HTMLElement) => {
    const firstRow = table.querySelector('tr');
    if (!firstRow) return;

    // If first row already has TH elements, leave it alone
    if (firstRow.querySelector('th')) return;

    // Check if first row is empty or has only empty cells. An image-only cell
    // isn't empty: dropping the row would drop the image.
    const cells = rowCells(firstRow);
    const isEmpty =
      cells.length === 0 ||
      cells.every(
        (cell: HTMLElement) =>
          !cell.textContent?.trim() && !cell.querySelector('img'),
      );

    if (isEmpty) {
      // Remove empty first row and find the first non-empty row to convert
      firstRow.remove();
      const nextRow = table.querySelector('tr');
      if (nextRow) {
        rowCells(nextRow).forEach((cell: HTMLElement) => {
          cell.tagName = 'th';
        });
      }
    } else {
      // Convert first row TD elements to TH
      cells.forEach((cell: HTMLElement) => {
        cell.tagName = 'th';
      });
    }
  });

  // Process lists - remove unicode bullets from unnumbered list items
  root.querySelectorAll('ul li').forEach((listItem: HTMLElement) => {
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

function getTurndownService(
  options: object = {},
  keepTags: string[] = [],
): TurndownService {
  // Create a new instance if options or keep-tags are provided; otherwise reuse
  // the singleton. `keep()` mutates the instance, so it must never touch the
  // shared singleton — a fresh service is required whenever keepTags is set.
  if (Object.keys(options).length > 0 || keepTags.length > 0) {
    const service = new TurndownService({
      ...defaultTurndownOptions,
      ...options,
    });
    service.use(turndownPluginGfm.gfm);
    if (keepTags.length > 0) {
      service.keep(keepTags);
    }
    return service;
  }

  if (!turndownServiceInstance) {
    turndownServiceInstance = new TurndownService(defaultTurndownOptions);
    turndownServiceInstance.use(turndownPluginGfm.gfm);
  }
  return turndownServiceInstance;
}

// Convert HTML to GitHub-flavored Markdown. `keepTags` lists HTML tags to
// preserve verbatim as inline HTML (e.g. `['u']` to keep underlines) rather
// than let Turndown strip them to plain text.
export function htmlToMd(
  html: string,
  options: object = {},
  keepTags: string[] = [],
): string {
  // Turndown's DOM parser decodes entities exactly once. Don't pre-decode:
  // that would turn literal text like `&#60;b&#62;` into markup and truncate
  // attribute values containing `&quot;`.
  const turndownService = getTurndownService(options, keepTags);
  return turndownService.turndown(html).trim();
}

// Pre-compiled regex patterns for better performance
const numberedListRegex = /^(\s*)(\d+)\.\s/;
const fenceRegex = /^\s*(`{3,}|~{3,})/;
const nonBreakingSpacesRegex = /[\u00A0\u2007\u202F\u2060\uFEFF]/g;
const smartQuotesRegex = /[\u201C\u201D\u2018\u2019]/g;

// Mammoth renders footnotes/endnotes as a superscript reference link plus a
// trailing ordered list of note bodies with `\u2191` backlinks \u2014 not real Markdown
// footnotes. These two regexes rewrite that into GFM/Pandoc footnote syntax.
// Both anchor on Mammoth's stable anchor ids (`#footnote-N` / `#footnote-ref-N`,
// or the `endnote` variants), never the escaped display label, which prettier
// and markdownlint may re-escape.
//
// Reference in the body, e.g. `<sup>[\[1\]](#footnote-1)</sup>` \u2192 `[^1]`. The
// non-greedy link text backtracks past the escaped `\]` inside the label, but
// can't cross a `<`, so an earlier, unrelated `<sup>` link isn't swallowed.
const footnoteRefRegex = /<sup>\[[^<]*?\]\(#(?:foot|end)note-(\d+)\)<\/sup>/g;
// Definition list item, e.g. `1. Body text. [\u2191](#footnote-ref-1)` \u2192
// `[^1]: Body text.`. The list marker is unreliable (prettier renumbers), so the
// footnote number comes from the backlink. Only single-line note bodies match:
// a multi-paragraph body (a rare Word construct) puts the backlink on an indented
// continuation line the (newline-free) body group can't reach, so it's left as-is
// \u2014 see convertFootnotes for how the matching reference is then also left raw.
const footnoteDefRegex =
  /^[ \t]*\d+\.[ \t]+(.*?)[ \t]*\[\u2191\]\(#(?:foot|end)note-ref-(\d+)\)[ \t]*$/gm;

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
};

// Convert numbered lists to bullet lists, leaving fenced code blocks untouched
function convertNumberedListsToBullets(md: string): string {
  let fence: string | null = null;
  return md
    .split('\n')
    .map((line) => {
      const marker = line.match(fenceRegex)?.[1];
      if (marker) {
        // A fence closes only with the same character, at least as long
        if (fence === null) fence = marker;
        else if (marker[0] === fence[0] && marker.length >= fence.length)
          fence = null;
        return line;
      }
      return fence === null ? line.replace(numberedListRegex, '$1- ') : line;
    })
    .join('\n');
}

// Remove unicode non-breaking spaces and convert smart quotes to ASCII in a single pass
function normalizeText(md: string): string {
  return md
    .replace(nonBreakingSpacesRegex, (char) => nonBreakingSpaceMap[char])
    .replace(smartQuotesRegex, (char) => smartQuoteMap[char]);
}

// Rewrite Mammoth's footnote/endnote markup into GFM/Pandoc footnote syntax.
// See footnoteRefRegex / footnoteDefRegex for the shapes matched. Runs after
// lint() and before prettify() so prettier normalizes the resulting footnote
// block (prettier's markdown parser preserves `[^1]` / `[^1]:`).
function convertFootnotes(md: string): string {
  // Rewrite the note definitions first, recording which footnote numbers were
  // actually converted. A number won't convert if its body spans multiple
  // paragraphs (footnoteDefRegex only matches single-line bodies).
  const converted = new Set<string>();
  const withDefs = md.replace(footnoteDefRegex, (_match, body, num) => {
    converted.add(num);
    return `[^${num}]: ${body}`;
  });
  // Only convert references whose definition converted. Rewriting a reference
  // whose definition was left as a raw list item would produce a dangling `[^N]`
  // with no target; gating on `converted` keeps that (rare) note as intact raw
  // `<sup>` + list markup instead.
  return withDefs.replace(footnoteRefRegex, (match, num) =>
    converted.has(num) ? `[^${num}]` : match,
  );
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
    // `process` doesn't exist in the browser worker unless a bundler shims it
    if (
      typeof process !== 'undefined' &&
      process.env?.NODE_ENV === 'development'
    ) {
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
type MammothInput = { buffer: Buffer } | { arrayBuffer: ArrayBuffer };

// Encrypted (password-protected) .docx files and legacy .doc files are OLE
// Compound File Binary containers, not ZIPs. They start with this signature.
const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function isCompoundFile(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 8));
  return (
    head.length === CFB_SIGNATURE.length &&
    CFB_SIGNATURE.every((byte, i) => head[i] === byte)
  );
}

interface LoadedInput {
  bytes: ArrayBuffer;
  mammothInput: MammothInput;
}

// Read the input once and shape it for mammoth. In Node.js, mammoth's unzip
// only accepts { path | buffer | file }; the browser build takes { arrayBuffer }.
async function loadInput(input: string | ArrayBuffer): Promise<LoadedInput> {
  let bytes: ArrayBuffer;
  if (typeof input === 'string') {
    validateFileExtension(input);
    // Validate the file path to prevent path traversal attacks
    const fileBuffer = await fs.readFile(validateFilePath(input));
    bytes = toArrayBuffer(
      fileBuffer.buffer.slice(
        fileBuffer.byteOffset,
        fileBuffer.byteOffset + fileBuffer.byteLength,
      ),
    );
  } else {
    bytes = input;
  }

  if (isCompoundFile(bytes)) {
    throw new UnsupportedFileError(
      'This file is password-protected or is a legacy .doc file. Please remove the password or save it as a .docx file and try again.',
    );
  }

  const mammothInput: MammothInput =
    typeof Buffer !== 'undefined'
      ? { buffer: Buffer.from(bytes) }
      : { arrayBuffer: bytes };
  return { bytes, mammothInput };
}

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

// Synthetic paragraph-style name applied to code paragraphs detected by font
// (see tagCodeParagraphs). It's mapped to a fenced code block alongside the real
// Word/LibreOffice preformatted styles below.
const DETECTED_CODE_STYLE_NAME = 'W2M Code Block';

// Word and LibreOffice mark code blocks in two ways, both of which we route to a
// single `<pre><code>`:
//   - a dedicated paragraph style — "Preformatted Text" (LibreOffice) or "HTML
//     Preformatted" (Word) — one paragraph per line; and
//   - direct monospace-font runs on otherwise-Normal paragraphs (often inside a
//     shaded 1×1 table), which tagCodeParagraphs re-labels with the synthetic
//     style name above.
// Mapping each style to `pre > code:separator('\n')` tells Mammoth to merge the
// consecutive lines into one `<pre><code>` joined by newlines, which Turndown
// emits as a single fenced block with verbatim content — no per-line paragraphs
// and, crucially, no Markdown escaping of code punctuation (`[ ] { } * - /`). The
// `\n` in `separator` is a literal backslash-n in the source string; Mammoth's
// style-map parser interprets it as a newline.
const CODE_BLOCK_STYLE_MAP = [
  `p[style-name='${DETECTED_CODE_STYLE_NAME}'] => pre > code:separator('\\n')`,
  "p[style-name='Preformatted Text'] => pre > code:separator('\\n')",
  "p[style-name='HTML Preformatted'] => pre > code:separator('\\n')",
];

// Append our style-map additions to any caller-supplied Mammoth options: the
// code-block mappings always, plus `u => u` when underlines are being preserved
// (Mammoth ignores underlines unless the style map maps them to a `<u>`).
// Additions are appended, never replaced, so Mammoth's default mappings —
// including superscript/subscript — stay intact.
function withStyleMap(
  mammothOptions: MammothOptions | undefined,
  { preserveUnderline }: { preserveUnderline: boolean },
): MammothOptions {
  const existing = mammothOptions?.styleMap ?? [];
  const additions = [...CODE_BLOCK_STYLE_MAP];
  if (preserveUnderline) additions.push('u => u');
  return { ...mammothOptions, styleMap: [...existing, ...additions] };
}

// Minimal shape of the nodes in Mammoth's document model that we walk. Mammoth
// ships no types for this, so we narrow to just the fields we read: a node's
// `type`, a text node's `value`, a run's `font` (the `w:rFonts` ascii name), and
// child nodes.
interface MammothDocNode {
  type: string;
  value?: string;
  font?: string | null;
  children?: MammothDocNode[];
  [key: string]: unknown;
}

// Font names (lower-cased) treated as monospace/code fonts. The word-boundaried
// `mono` matches families like "Liberation Mono"/"DejaVu Sans Mono" without
// catching proportional fonts that merely start with those letters (e.g.
// "Monotype Corsiva"); the rest are common fixed-width families.
const MONOSPACE_FONT_RE =
  /(^|\s)mono(\s|$)|monospace|consolas|courier|menlo|monaco|inconsolata/;

function isMonospaceFont(font: string | null | undefined): boolean {
  return !!font && MONOSPACE_FONT_RE.test(font.toLowerCase());
}

// Concatenate all text under a node (runs, hyperlinks, etc.).
function docNodeText(node: MammothDocNode): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(docNodeText).join('');
}

// Collect every run descendant of a node (runs can be nested inside hyperlinks).
function collectRuns(
  node: MammothDocNode,
  out: MammothDocNode[] = [],
): MammothDocNode[] {
  if (node.type === 'run') out.push(node);
  (node.children ?? []).forEach((child) => collectRuns(child, out));
  return out;
}

// A paragraph reads as a code block when it has visible text and *every*
// text-bearing run uses a monospace font. Requiring all runs (not just one) to
// be monospace keeps ordinary prose that merely mentions a monospaced identifier
// out of code blocks — only wholly-monospace paragraphs qualify.
function isMonospaceParagraph(paragraph: MammothDocNode): boolean {
  const runs = collectRuns(paragraph).filter(
    (run) => docNodeText(run).trim().length > 0,
  );
  return runs.length > 0 && runs.every((run) => isMonospaceFont(run.font));
}

// A Mammoth `transformDocument` that recursively re-labels wholly-monospace
// paragraphs with DETECTED_CODE_STYLE_NAME so the style map turns them into
// fenced code blocks. Word often encodes code as monospace runs on Normal
// paragraphs (no code paragraph style), and Mammoth discards font information
// once it emits HTML — the document model is the only place the signal survives.
function tagCodeParagraphs(node: MammothDocNode): MammothDocNode {
  const transformed: MammothDocNode = node.children
    ? { ...node, children: node.children.map(tagCodeParagraphs) }
    : node;
  if (transformed.type === 'paragraph' && isMonospaceParagraph(transformed)) {
    return {
      ...transformed,
      styleId: 'W2MCodeBlock',
      styleName: DETECTED_CODE_STYLE_NAME,
    };
  }
  return transformed;
}

// Add the code-detection transform to any caller-supplied Mammoth options,
// composing with (running after) an existing `transformDocument` if present.
function withCodeTransform(mammothOptions: MammothOptions): MammothOptions {
  const existing = mammothOptions.transformDocument as
    ((doc: MammothDocNode) => MammothDocNode) | undefined;
  const transformDocument = existing
    ? (doc: MammothDocNode) => tagCodeParagraphs(existing(doc))
    : tagCodeParagraphs;
  return { ...mammothOptions, transformDocument };
}

// Common image content types → file extension. Word most often embeds PNG and
// JPEG; the rest cover formats Mammoth may surface. EMF/WMF are extracted as
// bytes for completeness but browsers can't render them (Mammoth won't transcode).
const CONTENT_TYPE_EXTENSIONS: { [contentType: string]: string } = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/tiff': 'tiff',
  'image/bmp': 'bmp',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/x-emf': 'emf',
  'image/x-wmf': 'wmf',
};

// Pick a file extension for an extracted image. Falls back to the content
// type's subtype when it's a clean alphanumeric token, else `bin`. Exported for
// unit testing since only a PNG fixture exists.
export function extensionForContentType(contentType: string): string {
  const normalized = contentType.toLowerCase();
  const known = CONTENT_TYPE_EXTENSIONS[normalized];
  if (known) return known;
  const subtype = normalized.split('/')[1] ?? '';
  return /^[a-z0-9]+$/.test(subtype) ? subtype : 'bin';
}

// Decode a base64 string to bytes in both Node (Buffer) and the browser (atob).
// Mammoth's `image.read('base64')` is the one encoding available in every build.
function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Build a Mammoth `convertImage` handler that pulls each image out into a byte
// array with a deterministic relative path (`imageDir/imageN.ext`) instead of
// inlining it as a base64 data URI. The collected images are exposed on the
// returned `images` array once conversion finishes.
function createImageExtractor(imageDir: string): {
  images: ExtractedImage[];
  convertImage: unknown;
} {
  const images: ExtractedImage[] = [];
  const convertImage = mammoth.images.imgElement(async (image) => {
    const bytes = base64ToBytes(await image.read('base64'));
    const ext = extensionForContentType(image.contentType);
    const path = `${imageDir}/image${images.length + 1}.${ext}`;
    images.push({ path, contentType: image.contentType, bytes });
    return { src: path };
  });
  return { images, convertImage };
}

// The shared conversion pipeline: mammoth HTML -> cleaned, formatted Markdown.
// Returns mammoth's messages so callers can surface content-loss warnings, and
// (in extract mode) the extracted image assets.
async function runConversionPipeline(
  mammothInput: MammothInput,
  options: ConvertOptions,
): Promise<{
  markdown: string;
  messages: MammothMessage[];
  images?: ExtractedImage[];
}> {
  // Preserving underline requires cooperation at both ends of the pipeline:
  // Mammoth must be told to emit `<u>` (it drops underlines by default), and
  // Turndown must be told to keep that tag rather than flatten it to text.
  const preserveUnderline = options.underline === 'preserve';
  let mammothOptions: MammothOptions | undefined = withCodeTransform(
    withStyleMap(options.mammoth as MammothOptions | undefined, {
      preserveUnderline,
    }),
  );

  // Extract mode swaps Mammoth's default base64 inliner for a collector that
  // returns each image's bytes and rewrites the src to a relative path.
  let extractor:
    { images: ExtractedImage[]; convertImage: unknown } | undefined;
  if (options.images === 'extract') {
    extractor = createImageExtractor(options.imageDir ?? 'images');
    mammothOptions = {
      ...mammothOptions,
      convertImage: extractor.convertImage,
    };
  }

  const mammothResult = await mammoth.convertToHtml(
    mammothInput,
    mammothOptions,
  );
  const processedHtml = processHtml(mammothResult.value, {
    stripImages: options.images === 'strip',
  });
  const md = htmlToMd(
    processedHtml,
    options.turndown,
    preserveUnderline ? ['u'] : [],
  );
  const normalizedMd = normalizeText(md);
  const cleanedMd = lint(normalizedMd);
  // Footnotes stay as GFM `[^1]` by default; skip the rewrite on request.
  const footnotedMd =
    options.footnotes === 'preserve' ? cleanedMd : convertFootnotes(cleanedMd);
  // Numbered lists stay numbered by default; flatten to bullets on request.
  // This must run after convertFootnotes, whose definition regex matches the
  // numbered `1. body [\u2191](#footnote-ref-1)` list items.
  const listMd =
    options.numberedLists === 'bullets'
      ? convertNumberedListsToBullets(footnotedMd)
      : footnotedMd;
  const formattedMd = await prettify(listMd);
  return {
    markdown: formattedMd,
    messages: mammothResult.messages,
    images: extractor?.images,
  };
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
  if (error instanceof WordToMarkdownError) {
    throw error;
  }

  // Handle specific error types from underlying libraries
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorCode =
    error && typeof error === 'object' && 'code' in error
      ? (error as { code: string }).code
      : undefined;

  // File not found errors (only occur with file path inputs)
  // ENOTDIR/ELOOP mean a path component isn't a usable directory, so the
  // file can't be reached either.
  if (
    errorCode === 'ENOENT' ||
    errorCode === 'ENOTDIR' ||
    errorCode === 'ELOOP'
  ) {
    throw new FileNotFoundError(filePath);
  }

  // A directory was passed where a .docx file was expected
  if (errorCode === 'EISDIR') {
    throw new InvalidFileError(filePath);
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
  options: ConvertOptions = {},
): Promise<ConvertResult> {
  const filePath = typeof input === 'string' ? input : undefined;

  try {
    const loaded = await loadInput(input);

    // Extract document properties to check for confidentiality flags
    const properties = await extractDocumentProperties(loaded.bytes);
    const warnings = generateWarnings(properties);

    const { markdown, messages, images } = await runConversionPipeline(
      loaded.mammothInput,
      options,
    );
    warnings.push(...extractMammothWarnings(messages));

    return images ? { markdown, warnings, images } : { markdown, warnings };
  } catch (error) {
    classifyConversionError(error, filePath);
  }
}

// Converts a Word document to crisp, clean Markdown.
// Unlike convertWithWarnings, this skips document-property extraction (and its
// extra ZIP parse) so callers that only need the Markdown pay no overhead.
export default async function convert(
  input: string | ArrayBuffer,
  options: ConvertOptions = {},
): Promise<string> {
  const filePath = typeof input === 'string' ? input : undefined;

  try {
    const loaded = await loadInput(input);

    const { markdown } = await runConversionPipeline(
      loaded.mammothInput,
      options,
    );
    return markdown;
  } catch (error) {
    classifyConversionError(error, filePath);
  }
}
