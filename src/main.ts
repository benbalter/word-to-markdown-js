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
export class WordToMarkdownError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

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
  constructor(filePath?: string, cause?: unknown) {
    const location = filePath ? `: "${filePath}"` : '';
    super(
      `Invalid file${location}. The file is not a valid .docx file or is corrupted. Please ensure the file is a valid Microsoft Word document (.docx format).`,
      cause === undefined ? undefined : { cause },
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

// Read a .docx from disk into a standalone ArrayBuffer (Node.js only). The
// path is resolved as-is: a local caller already has full filesystem access, so
// there's nothing to sandbox. Paths containing `..` (`../report.docx`,
// `notes..docx`) are legitimate, and the OS enforces permissions (EACCES maps
// to FilePermissionError in classifyConversionError).
async function readFileBytes(filePath: string): Promise<ArrayBuffer> {
  const fileBuffer = await fs.readFile(path.resolve(filePath));
  // Copy out of Node's pooled Buffer so the bytes don't alias unrelated data.
  // readFile never returns a SharedArrayBuffer-backed Buffer, hence the cast.
  return fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength,
  ) as ArrayBuffer;
}

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

// Word's table grid, flattened onto the rows: every row gets one explicit
// <td> per grid column, and no cell keeps a colspan/rowspan.
//
// Markdown has no merged cells, so the only faithful degradation is to expand
// each merge into real cells: the spanned text lands in the first of the merged
// cells and the rest are empty. That also removes the reason the output was
// invalid before. Turndown's GFM table plugin derives the delimiter row's cell
// count from the table's *cell* count (max over rows) while expanding the
// header row's colspans, so a header whose colspans make it shorter than the
// widest row yields a delimiter with too many cells and the whole table stops
// being a GFM table. It ignores rowspan entirely, leaving later rows one cell
// short. Filling the grid up front makes every row the same width, leaves both
// plugin assumptions true, and is the behavior Markdown can actually represent.
//
// Must run after the 1×1 <pre> unwrap above (which keys on a cell count of 1)
// and before the header promotion below.
function expandMergedCells(table: HTMLElement): void {
  const rows = table.querySelectorAll('tr');
  if (rows.length === 0) return;
  // Turndown's GFM plugin renders a one-row, one-cell table as plain content
  // instead of a table, so the colspan has to survive for that check to fire:
  // without it, a bordered single-cell box turns into a two-column table.
  if (rows.length === 1 && rowCells(rows[0]).length === 1) return;

  // Grid columns covered by a rowspan that started in an earlier row, mapped to
  // the first row that reaches them and dropped as it is filled.
  const carriedOver = new Map<number, number>();

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    // The cells this row contributes itself (colspans still collapsed), each
    // read alongside the column it starts at, which skips the columns carried
    // over from the rows above.
    const placed: { cell: HTMLElement; column: number; colspan: number }[] = [];
    let column = 0;
    for (const cell of rowCells(row)) {
      while (carriedOver.has(column)) column++;
      const colspan = spanOf(cell, 'colspan');
      placed.push({ cell, column, colspan });
      column += colspan;
    }

    // One output cell per grid column: the row's own cell where it starts, an
    // empty cell for the rest of its colspan, and an empty cell wherever a
    // rowspan from above covers this row.
    const expanded = new Map<number, HTMLElement>();
    for (const { cell, column: start, colspan } of placed) {
      for (let i = 0; i < colspan; i++) {
        if (i === 0) {
          expanded.set(start, cell);
          continue;
        }
        const filler = emptyCellLike(cell);
        cell.after(filler);
        expanded.set(start + i, filler);
      }
      // Cover this cell's columns in the rows it spans. A column already taken
      // by a merge from higher up keeps its original start, so a merge that
      // collides is truncated rather than stealing the column.
      const rowspan = spanOf(cell, 'rowspan');
      for (let c = start; c < start + colspan; c++) {
        for (let i = 1; i < rowspan && r + i < rows.length; i++) {
          const covered = carriedOver.get(c);
          if (covered === undefined || r + i < covered) {
            carriedOver.set(c, r + i);
          }
        }
      }
    }

    // Fill the columns this row inherits from a rowspan above. Anchoring each
    // filler to the cell before it — or to the front of the row when it is the
    // first column — keeps them in grid order however the row itself is built.
    for (const [target, firstRow] of [...carriedOver].sort(
      (a, b) => a[0] - b[0],
    )) {
      if (firstRow !== r) continue;
      const anchor = expanded.get(target - 1);
      const filler = emptyCellLike(anchor ?? placed[0]?.cell ?? null);
      if (anchor) anchor.after(filler);
      else row.prepend(filler);
      expanded.set(target, filler);
      carriedOver.delete(target);
    }

    for (const { cell } of placed) {
      cell.removeAttribute('colspan');
      cell.removeAttribute('rowspan');
    }
  }
}

// A merge's extent. Only counts above one: `colspan="0"`/`"-1"` (which Word
// writes for a merge running to the end of the row) and junk values mean "one
// cell", the same as no attribute at all.
function spanOf(cell: HTMLElement, attribute: string): number {
  const raw = Number.parseInt(cell.getAttribute(attribute) ?? '', 10);
  return Number.isInteger(raw) && raw > 1 ? raw : 1;
}

// An empty, unspanned <td> shaped like `cell`, so the filler inherits the same
// tag (the header promotion pass runs later) and paragraph nesting as the cell
// it stands in for. No model to copy means every cell in the row is empty,
// where a <td> keeps the existing behavior of promoting the next non-empty row
// instead.
function emptyCellLike(cell: HTMLElement | null): HTMLElement {
  const copy = cell ? parse(cell.outerHTML) : null;
  const source = (copy?.querySelector('td, th') ?? copy) as HTMLElement | null;
  const empty =
    source ?? parse('<table><tr><td></td></tr></table>').querySelector('td')!;
  empty.tagName = 'td';
  empty.removeAttribute('colspan');
  empty.removeAttribute('rowspan');
  empty.innerHTML = '';
  return empty;
}

// Mammoth renders footnotes/endnotes as a trailing <ol> whose items carry ids
// like `footnote-1` / `endnote-1`.
const NOTE_ITEM_ID = /^(?:foot|end)note-\d+$/;

function isNoteList(list: HTMLElement): boolean {
  return (list.childNodes as HTMLElement[]).some(
    (node: HTMLElement) =>
      node.tagName?.toLowerCase() === 'li' &&
      NOTE_ITEM_ID.test(node.getAttribute('id') ?? ''),
  );
}

// Link schemes allowed through to the Markdown. Fragments and relative URLs
// resolve against an https: base below, so they pass too.
const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
// Browsers (via the WHATWG URL parser) ignore leading and trailing C0 controls
// and spaces, so `\x01javascript:` is still a `javascript:` URL. String#trim()
// doesn't remove them, so strip them explicitly along with other whitespace.
// eslint-disable-next-line no-control-regex
const EDGE_CONTROLS_REGEX = /^[\s\u0000-\u001F]+|[\s\u0000-\u001F]+$/g;

// Returns the cleaned href if it's safe to keep, or null if the link should be
// unwrapped to its text. Parsing with the WHATWG URL parser (available in Node
// and browsers) determines the scheme exactly as a browser would, including
// tabs/newlines inside the scheme (`java\tscript:`) and any letter case.
function safeHref(href: string): string | null {
  const trimmed = href.replace(EDGE_CONTROLS_REGEX, '');
  let url: URL;
  try {
    url = new URL(trimmed, 'https://base.invalid/');
  } catch {
    return null;
  }
  return SAFE_LINK_PROTOCOLS.has(url.protocol) ? trimmed : null;
}

// Process HTML in a single pass: optionally strip images, convert table
// headers, and remove unicode bullets. This is more efficient than parsing the
// HTML twice.
/** @internal Exported for tests only. */
export function processHtml(
  html: string,
  opts: { stripImages?: boolean; bulletLists?: boolean } = {},
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

  // Flatten Word's merged cells into one empty <td> per spanned grid column.
  // Runs after the 1×1 <pre> unwrap above, which keys on a cell count of one.
  root.querySelectorAll('table').forEach((table: HTMLElement) => {
    expandMergedCells(table);
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

  // Optionally render numbered lists as bullet lists by renaming <ol> to <ul>.
  // Doing it on the DOM (rather than rewriting `1.` markers in the Markdown)
  // can't touch numbered lines inside code blocks or literal text. Mammoth's
  // footnote/endnote list stays ordered: it's not a real list, and the footnote
  // conversion (or, with footnotes preserved, the numbered note list) relies on
  // it. Runs after the unicode-bullet strip above so formerly numbered items
  // keep their content as-is.
  if (opts.bulletLists) {
    root.querySelectorAll('ol').forEach((list: HTMLElement) => {
      if (isNoteList(list)) return;
      list.tagName = 'ul';
      list.removeAttribute('start');
      list.removeAttribute('type');
    });
  }

  return root.toString();
}

// Mammoth renders footnotes/endnotes as a superscript reference link plus a
// trailing ordered list of note bodies with `↑` backlinks, not real Markdown
// footnotes:
//
//   <p>Text<sup><a href="#footnote-1" id="footnote-ref-1">[1]</a></sup>.</p>
//   <ol><li id="footnote-1"><p>Body. <a href="#footnote-ref-1">↑</a></p></li></ol>
//
// These Turndown rules emit GFM/Pandoc footnote syntax instead (`[^1]`
// references and `[^1]:` definitions), keyed on Mammoth's stable anchor ids.
// Endnotes use the same numbering scheme, so they share it.
const NOTE_REF_HREF = /^#(?:foot|end)note-(\d+)$/;
const NOTE_BACKLINK_HREF = /^#(?:foot|end)note-ref-\d+$/;

function addFootnoteRules(service: TurndownService): void {
  // The reference: a <sup> wrapping only the link to the note.
  service.addRule('footnoteReference', {
    filter: (node) => {
      const link = node.firstElementChild;
      return (
        node.nodeName === 'SUP' &&
        node.childElementCount === 1 &&
        link?.nodeName === 'A' &&
        NOTE_REF_HREF.test(link.getAttribute('href') ?? '')
      );
    },
    replacement: (_content, node) => {
      const href = node.firstElementChild?.getAttribute('href') ?? '';
      return `[^${NOTE_REF_HREF.exec(href)?.[1]}]`;
    },
  });
  // The `↑` link back to the reference is meaningless in Markdown footnotes.
  service.addRule('footnoteBacklink', {
    filter: (node) =>
      node.nodeName === 'A' &&
      NOTE_BACKLINK_HREF.test(node.getAttribute('href') ?? ''),
    replacement: () => '',
  });
  // Each note becomes a definition. Later paragraphs of a multi-paragraph note
  // are indented four spaces, which GFM/Pandoc read as a continuation.
  service.addRule('footnoteDefinition', {
    filter: (node) =>
      node.nodeName === 'LI' &&
      NOTE_ITEM_ID.test(node.getAttribute('id') ?? ''),
    replacement: (content, node) => {
      const num = node.getAttribute('id')?.replace(/^\D+/, '');
      const body = content
        .trim()
        .split('\n')
        .map((line, i) =>
          i === 0 || line.trim() === '' ? line : `    ${line}`,
        )
        .join('\n');
      return `[^${num}]: ${body}\n\n`;
    },
  });
}

// Allowlist link schemes on the DOM Turndown converts. A Word hyperlink (or
// caller-supplied HTML) can target any URL, and Turndown's own `javascript:`
// check is bypassable (e.g. a leading U+0001), so keep only http(s)/mailto,
// fragment and relative links; drop the href of anything else so the link
// renders as its text and can't become a script link downstream.
//
// This runs as a rule filter rather than a separate HTML pre-pass so it sees
// exactly the DOM Turndown builds (no parser differential; e.g. node-html-parser
// treats <pre> and <noscript> content as raw text). Turndown asks the rules for
// a node before converting its children, and it's added last so it's checked
// first, so every <a> is cleaned before any rule reads its href or an ancestor
// is kept verbatim as HTML (keepTags, GFM tables it can't convert). The filter
// never matches: it only cleans the node and lets the normal rules convert it.
function addLinkAllowlistRule(service: TurndownService): void {
  service.addRule('linkSchemeAllowlist', {
    filter: (node) => {
      if (node.nodeName !== 'A') return false;
      const href = node.getAttribute('href');
      if (href === null) return false;
      const safe = safeHref(href);
      if (safe === null) node.removeAttribute('href');
      else if (safe !== href) node.setAttribute('href', safe);
      return false;
    },
    replacement: (content) => content,
  });
}

function createTurndownService(
  options: object,
  keepTags: string[],
  gfmFootnotes: boolean,
): TurndownService {
  const service = new TurndownService({
    ...defaultTurndownOptions,
    ...options,
  });
  service.use(turndownPluginGfm.gfm);
  if (keepTags.length > 0) service.keep(keepTags);
  if (gfmFootnotes) addFootnoteRules(service);
  addLinkAllowlistRule(service);
  return service;
}

// Reusable services for the default options, keyed by keep-tags (e.g. '' or
// 'u' for --underline) and footnote mode, so repeat conversions don't rebuild
// Turndown and its GFM rules. `keep()` and `addRule()` mutate a service, hence
// one per combination.
const turndownServices = new Map<string, TurndownService>();

function getTurndownService(
  options: object = {},
  keepTags: string[] = [],
  gfmFootnotes = false,
): TurndownService {
  // Caller-supplied Turndown options may hold functions (custom rules), which
  // can't be keyed reliably; build a fresh service for those.
  if (Object.keys(options).length > 0) {
    return createTurndownService(options, keepTags, gfmFootnotes);
  }
  const key = `${[...keepTags].sort().join(',')}|${gfmFootnotes}`;
  let service = turndownServices.get(key);
  if (!service) {
    service = createTurndownService({}, keepTags, gfmFootnotes);
    turndownServices.set(key, service);
  }
  return service;
}

// Convert HTML to GitHub-flavored Markdown. `keepTags` lists HTML tags to
// preserve verbatim as inline HTML (e.g. `['u']` to keep underlines) rather
// than let Turndown strip them to plain text. `gfmFootnotes` rewrites Mammoth's
// footnote/endnote markup into `[^1]` footnotes (see addFootnoteRules).
export function htmlToMd(
  html: string,
  options: object = {},
  keepTags: string[] = [],
  gfmFootnotes = false,
): string {
  // Turndown's DOM parser decodes entities exactly once. Don't pre-decode:
  // that would turn literal text like `&#60;b&#62;` into markup and truncate
  // attribute values containing `&quot;`.
  const turndownService = getTurndownService(options, keepTags, gfmFootnotes);
  return turndownService.turndown(html).trim();
}

// Pre-compiled regex patterns for better performance
const nonBreakingSpacesRegex = /[\u00A0\u2007\u202F\u2060\uFEFF]/g;
const smartQuotesRegex = /[\u201C\u201D\u2018\u2019]/g;

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
// The text of docProps/core.xml's classification fields (cp:keywords,
// cp:category, cp:contentStatus), with or without a namespace prefix.
const CORE_CLASSIFICATION_FIELDS =
  /<(?:\w+:)?(?:keywords|category|contentStatus)\b[^>]*>([^<]*)</g;

export async function extractDocumentProperties(
  input: string | ArrayBuffer,
): Promise<DocumentProperties> {
  const properties: DocumentProperties = {};

  // A path that can't be read is the caller's problem, not a "no properties"
  // result, so surface it as a typed error before the lenient parsing below.
  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer =
      typeof input === 'string' ? await readFileBytes(input) : input;
  } catch (error) {
    classifyConversionError(
      error,
      typeof input === 'string' ? input : undefined,
    );
  }

  try {
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
      // Look for confidentiality markers in the classification fields only.
      // Free-text fields (title, subject, description, author) are skipped, so a
      // title like "Case-sensitive search" isn't flagged.
      for (const [, value] of coreXml.matchAll(CORE_CLASSIFICATION_FIELDS)) {
        if (/confidential|sensitive/i.test(value)) {
          properties.confidentiality = 'detected in core properties';
          break;
        }
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
    bytes = await readFileBytes(input);
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
// Headings, titles, and list items keep their structure even when set wholly in
// a monospace font: their style (or numbering) is a stronger signal than font.
const STRUCTURAL_STYLE_RE = /^(heading|title|subtitle)\b/i;

function isStructuralParagraph(paragraph: MammothDocNode): boolean {
  const styleName = paragraph.styleName;
  return (
    Boolean(paragraph.numbering) ||
    (typeof styleName === 'string' && STRUCTURAL_STYLE_RE.test(styleName))
  );
}

function tagCodeParagraphs(node: MammothDocNode): MammothDocNode {
  const transformed: MammothDocNode = node.children
    ? { ...node, children: node.children.map(tagCodeParagraphs) }
    : node;
  if (
    transformed.type === 'paragraph' &&
    !isStructuralParagraph(transformed) &&
    isMonospaceParagraph(transformed)
  ) {
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
/** @internal */
export function extensionForContentType(contentType: string): string {
  const normalized = contentType.toLowerCase();
  const known = CONTENT_TYPE_EXTENSIONS[normalized];
  if (known) return known;
  const subtype = normalized.split('/')[1] ?? '';
  return /^[a-z0-9]+$/.test(subtype) ? subtype : 'bin';
}

// The image object Mammoth passes to a `convertImage` handler (not exported).
type MammothImage = Parameters<
  Parameters<typeof mammoth.images.imgElement>[0]
>[0];

// Read an image's raw bytes as a standalone Uint8Array. Mammoth types
// `readAsArrayBuffer()` as an ArrayBuffer, but at runtime it returns JSZip's
// `uint8array` output, which can be a Node Buffer or a view into a larger buffer
// (e.g. an uncompressed entry sliced from the .docx itself). `new Uint8Array()`
// covers every case: it wraps a real ArrayBuffer whole and copies any typed-array
// view into a fresh, exactly-sized buffer. That matters for the worker, which
// transfers each image's `.buffer` to the page (src/converter.worker.ts):
// transferring a shared view would detach unrelated bytes.
async function readImageBytes(image: MammothImage): Promise<Uint8Array> {
  // No instanceof check: under Jest's vm modules (and across worker realms) a
  // Uint8Array may not be an instance of this realm's class, and the
  // constructor handles both shapes anyway.
  return new Uint8Array(await image.readAsArrayBuffer());
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
    const bytes = await readImageBytes(image);
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
    // Drop trailing slashes so `img/` doesn't produce `img//image1.png` links
    const imageDir = (options.imageDir ?? 'images').replace(/(?<=.)\/+$/, '');
    extractor = createImageExtractor(imageDir);
    mammothOptions = {
      ...mammothOptions,
      convertImage: extractor.convertImage,
    };
  }

  const mammothResult = await mammoth.convertToHtml(
    mammothInput,
    mammothOptions,
  );
  // Numbered lists stay numbered by default; flatten to bullets on request.
  const processedHtml = processHtml(mammothResult.value, {
    stripImages: options.images === 'strip',
    bulletLists: options.numberedLists === 'bullets',
  });
  // Footnotes become GFM `[^1]` by default; keep Mammoth's markup on request.
  const md = htmlToMd(
    processedHtml,
    options.turndown,
    preserveUnderline ? ['u'] : [],
    options.footnotes !== 'preserve',
  );
  const normalizedMd = normalizeText(md);
  const cleanedMd = lint(normalizedMd);
  const formattedMd = await prettify(cleanedMd);
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
    throw new InvalidFileError(filePath, error);
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
