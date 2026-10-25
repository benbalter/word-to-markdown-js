import TurndownService from '@joplin/turndown';
import * as turndownPluginGfm from '@joplin/turndown-plugin-gfm';
import * as mammoth from 'mammoth';
import * as markdownlint from 'markdownlint/sync';
import { applyFixes } from 'markdownlint';
import GithubSlugger from 'github-slugger';
import domino from '@mixmark-io/domino';
import * as prettier from 'prettier';
import * as prettierMarkdown from 'prettier/plugins/markdown';
import JSZip from 'jszip';
import {
  extractEquations,
  restoreEquations,
  restoreInlineEquations,
} from './equations.js';
import { applyListStarts, labelNumbering } from './numbering.js';
import { reportProgress } from './progress.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * How to treat curly quotes (“ ” ‘ ’). Chinese quotation marks share these code
 * points with the curly quotes Word writes for English, so the two can only be
 * told apart by context.
 */
export type QuoteStyle = 'auto' | 'ascii' | 'preserve';

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
  /**
   * How to handle Word equations (Office Math). `'latex'` (default) converts
   * each to LaTeX: inline `$…$`, or a `$$…$$` block for an equation on its
   * own line, which GitHub and most Markdown math renderers display.
   * `'strip'` drops them, as Mammoth does, with a content-loss warning.
   */
  equations?: 'latex' | 'strip';
  /**
   * How to handle curly quotes (“ ” ‘ ’). `'auto'` (default) keeps them when the
   * text is mostly Chinese, where they are the Chinese quotation marks rather
   * than Word's curly quotes, and converts them to ASCII everywhere else.
   * `'ascii'` always converts; `'preserve'` always keeps them.
   */
  quotes?: QuoteStyle;
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

// A machine-readable form of one entry in `ConvertResult.warnings`, so callers
// (like the web UI) can present or localize warnings without parsing the
// English text. `detail` carries the document's own label/marker, or for
// `content-loss` either mammoth's raw message or, for content the converter
// finds dropped itself, one of `comments (N)`, `headers and footers`, or
// `text boxes (N)`.
export type WarningKind =
  | 'encrypted'
  | 'sensitivity'
  | 'confidentiality'
  | 'protected'
  | 'content-loss';

export interface WarningDetail {
  kind: WarningKind;
  /** The same English string that appears in `warnings`. */
  message: string;
  detail?: string;
}

export interface ConvertResult {
  markdown: string;
  warnings: string[];
  /** One entry per `warnings` string, in the same order. */
  warningDetails: WarningDetail[];
  /** Present (possibly empty) when converting with `images: 'extract'`. */
  images?: ExtractedImage[];
}

export interface DocumentProperties {
  sensitivity?: string;
  confidentiality?: string;
  encryption?: boolean;
  protection?: boolean;
  /** Comments with text; mammoth doesn't convert them. */
  comments?: number;
  /** Whether a header or footer has text beyond page-number fields. */
  headersFooters?: boolean;
  /** Text boxes with text and no VML fallback, which mammoth drops. */
  textBoxes?: number;
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

// A .docx that unpacks to more than MAX_UNCOMPRESSED_SIZE: a decompression
// bomb, or a document too big to convert in memory
export class DocumentTooLargeError extends WordToMarkdownError {
  constructor(filePath?: string) {
    const location = filePath ? `: "${filePath}"` : '';
    super(
      `Document too large${location}. It unpacks to more than ${MAX_UNCOMPRESSED_SIZE / 1024 / 1024} MB, too much to convert in memory, which can mean it's damaged or built to exhaust memory. If it's a real document, try splitting it into smaller ones.`,
    );
    this.name = 'DocumentTooLargeError';
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

// Node types, spelled out: Node has no DOM globals at runtime (the DOM types
// come from tsconfig's lib), so `Node.ELEMENT_NODE` isn't available.
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;

// Parse an HTML fragment into the body of a fresh domino document. domino is
// the DOM Turndown parses with in Node and in the conversion worker, so these
// fixups see the tree Turndown will. Parsing in a body context matches
// Turndown's own wrapper, so <html>/<head>/<body> tags are dropped and <style>
// or <title> stay in place. Comments are never content, so they're removed.
function parseFragment(html: string): HTMLElement {
  const { body } = domino.createDocument('');
  body.innerHTML = html;
  removeComments(body);
  return body;
}

function removeComments(node: Node): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === COMMENT_NODE) node.removeChild(child);
    else removeComments(child);
  }
}

// Serialize a fragment for Turndown to re-parse. An HTML parser drops the
// newline right after <pre>, and domino's serializer doesn't add one back, so a
// block starting with a blank line would lose it on the second parse; restore
// it so the round trip is lossless.
function serializeFragment(root: Element): string {
  for (const pre of all(root, 'pre, textarea, listing')) {
    const first = pre.firstChild;
    if (
      first?.nodeType === TEXT_NODE &&
      (first as Text).data.startsWith('\n')
    ) {
      (first as Text).data = `\n${(first as Text).data}`;
    }
  }
  return root.innerHTML;
}

// Replace `target` with `nodes` (an empty list just removes it), one
// insertBefore at a time. Not Element.replaceWith: domino builds a document
// fragment for it and splices the fragment in at the target's cached child
// index, which goes stale once earlier siblings are removed, so the nodes land
// in the wrong place or vanish. Chrome's clipboard copy of a Google Docs
// selection (two <meta> tags, both removed, before the wrapper unwrapped
// below) lost the whole selection that way.
function replaceNode(target: Node, nodes: readonly Node[]): void {
  const parent = target.parentNode;
  if (!parent) return;
  for (const node of nodes) parent.insertBefore(node, target);
  parent.removeChild(target);
}

// Move an element's children up into its place, dropping the element.
function unwrap(element: Element): void {
  replaceNode(element, Array.from(element.childNodes));
}

// querySelectorAll as an array, so it can be filtered and mapped
function all(root: ParentNode, selector: string): Element[] {
  return Array.from(root.querySelectorAll(selector));
}

// An element's child nodes as HTML: elements as their outer HTML, text with
// `&`, `<` and `>` escaped. Non-breaking spaces stay literal (as Mammoth writes
// them), so trimming a line still removes them.
function serializeNode(node: ChildNode): string {
  if (node.nodeType === ELEMENT_NODE) return (node as Element).outerHTML;
  if (node.nodeType !== TEXT_NODE) return '';
  return (node as Text).data
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Swap an element for one with another tag, keeping its attributes and
// children: the DOM can't rename an element in place.
function renameElement(element: Element, tag: string): Element {
  const renamed = element.ownerDocument.createElement(tag);
  for (const { name, value } of Array.from(element.attributes)) {
    renamed.setAttribute(name, value);
  }
  while (element.firstChild) renamed.appendChild(element.firstChild);
  replaceNode(element, [renamed]);
  return renamed;
}

// A table's own rows, excluding rows of any table nested in one of its cells
function ownRows(table: Element): Element[] {
  return all(table, 'tr').filter((row) => row.closest('table') === table);
}

// A row's own cells, excluding cells of any table nested inside it
function rowCells(row: Element): Element[] {
  return Array.from(row.children).filter(
    (node) => node.tagName.toLowerCase() === 'td',
  );
}

// Word's table grid, flattened onto the rows: every row gets one explicit
// cell per grid column, and no cell keeps a colspan/rowspan.
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
function expandMergedCells(table: Element): void {
  // Only this table's own rows: a table nested in a cell is expanded on its
  // own, and must not inherit the outer table's merges.
  const rows = ownRows(table);
  if (rows.length === 0) return;
  // Turndown's GFM plugin renders a one-row, one-cell table as plain content
  // instead of a table, so the colspan has to survive for that check to fire:
  // without it, a bordered single-cell box turns into a two-column table.
  if (rows.length === 1 && gridCells(rows[0]).length === 1) return;

  // For each grid column, the last row a rowspan from above still covers.
  const coveredUntil: number[] = [];
  const isCovered = (column: number, r: number) =>
    (coveredUntil[column] ?? -1) >= r;

  rows.forEach((row: Element, r: number) => {
    const cells = gridCells(row);
    let column = 0;
    let previous: Element | null = null;
    // Insert an empty cell at the current column, right after the last one
    // placed (or at the front of the row), so cells stay in grid order.
    const fill = (model: Element | null) => {
      const filler = emptyCellLike(row.ownerDocument, model);
      if (previous) previous.after(filler);
      else row.insertBefore(filler, row.firstChild);
      previous = filler;
      column++;
    };

    for (const cell of cells) {
      while (isCovered(column, r)) fill(previous ?? cell);
      const colspan = spanOf(cell, 'colspan');
      const rowspan = spanOf(cell, 'rowspan');
      for (let i = 0; i < colspan; i++) {
        coveredUntil[column + i] = Math.max(
          coveredUntil[column + i] ?? -1,
          r + rowspan - 1,
        );
      }
      cell.removeAttribute('colspan');
      cell.removeAttribute('rowspan');
      previous = cell;
      column++;
      for (let i = 1; i < colspan; i++) fill(cell);
    }

    // Columns past the row's last cell that a rowspan from above still covers.
    while (coveredUntil.slice(column).some((until) => until >= r)) {
      fill(previous ?? cells[0] ?? null);
    }
  });
}

// A row's own cells, header cells included: Mammoth writes a Word header row
// marked "Repeat as header row" as <th>, and its merges need expanding too.
function gridCells(row: Element): Element[] {
  return Array.from(row.children).filter((node) =>
    ['td', 'th'].includes(node.tagName.toLowerCase()),
  );
}

// A merge's extent. Only counts above one: `colspan="0"`/`"-1"` (which Word
// writes for a merge running to the end of the row) and junk values mean "one
// cell", the same as no attribute at all.
function spanOf(cell: Element, attribute: string): number {
  const raw = Number.parseInt(cell.getAttribute(attribute) ?? '', 10);
  return Number.isInteger(raw) && raw > 1 ? raw : 1;
}

// An empty, unspanned cell with the same tag and attributes as `cell`, so a
// filler in a <th> header row is a <th> too. With no model (a row made up
// entirely of cells merged down from above) it is a <td>, which the header
// promotion below treats like any other cell.
function emptyCellLike(doc: Document, cell: Element | null): Element {
  const tag = cell?.tagName.toLowerCase() === 'th' ? 'th' : 'td';
  const empty = doc.createElement(tag);
  for (const { name, value } of Array.from(cell?.attributes ?? [])) {
    if (name !== 'colspan' && name !== 'rowspan') {
      empty.setAttribute(name, value);
    }
  }
  return empty;
}

// A row with no text and no image in any of its own cells. An image-only cell
// isn't empty: dropping the row would drop the image.
function isEmptyRow(row: Element): boolean {
  return rowCells(row).every(
    (cell) => !cell.textContent?.trim() && !cell.querySelector('img'),
  );
}

// Block elements that make Turndown's GFM plugin give up on a table and emit
// it as raw HTML (in a Joplin-specific wrapper div). Word cells routinely hold
// them: a bulleted list of open items, a heading-styled label. A nested table
// is worse: the plugin drops the outer table's grid entirely and renders its
// cells one after another as paragraphs.
const CELL_FALLBACK_BLOCKS = new Set([
  'ul',
  'ol',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'blockquote',
  'table',
  'pre',
]);
const CELL_BLOCKS = new Set([...CELL_FALLBACK_BLOCKS, 'p', 'div', 'li']);
const CELL_FALLBACK_SELECTOR = [...CELL_FALLBACK_BLOCKS].join(', ');
// Bullet markers for list items in a cell, by nesting depth.
const CELL_BULLETS = ['•', '◦', '▪'];
// Joins a nested table's cells on its one line per row.
const NESTED_CELL_SEPARATOR = ' · ';

// A code block's text, with each <br> read as the line break it renders as
// (textContent alone would run the lines together).
function codeText(node: Node): string {
  if (node.nodeType === TEXT_NODE) return (node as Text).data;
  if (node.nodeType !== ELEMENT_NODE) return '';
  if ((node as Element).tagName.toLowerCase() === 'br') return '\n';
  return Array.from(node.childNodes, codeText).join('');
}

// A cell's content as lines of inline HTML, one per paragraph, heading, or list
// item. Headings become bold; list items keep a bullet (or their number), with
// a different bullet per nesting level, since a cell can't hold a real list.
// A code block becomes inline code, one line per line of code.
function cellLines(node: Element, depth = 0): string[] {
  const lines: string[] = [];
  let inline = '';
  const flush = () => {
    if (inline.trim()) lines.push(inline.trim());
    inline = '';
  };
  for (const childNode of Array.from(node.childNodes)) {
    const tag =
      childNode.nodeType === ELEMENT_NODE
        ? (childNode as Element).tagName.toLowerCase()
        : undefined;
    // Any other element (a <figure>, <section>, or <span> from pasted HTML)
    // is inline content, unless it wraps a block: then it's flattened like a
    // <div>, or the block would reach the GFM plugin intact.
    if (
      !tag ||
      (!CELL_BLOCKS.has(tag) &&
        !(childNode as Element).querySelector(CELL_FALLBACK_SELECTOR))
    ) {
      inline += serializeNode(childNode);
      continue;
    }
    const child = childNode as Element;
    flush();
    if (tag === 'ul' || tag === 'ol') {
      let number = Number.parseInt(child.getAttribute('start') ?? '', 10) || 1;
      for (const item of Array.from(child.children)) {
        if (item.tagName.toLowerCase() !== 'li') continue;
        const marker =
          tag === 'ol'
            ? `${number++}.`
            : CELL_BULLETS[depth % CELL_BULLETS.length];
        const [first = '', ...rest] = cellLines(item, depth + 1);
        lines.push(`${marker} ${first.replace(bulletRegex, '')}`, ...rest);
      }
    } else if (/^h[1-6]$/.test(tag)) {
      lines.push(
        ...cellLines(child, depth).map((line) => `<strong>${line}</strong>`),
      );
    } else if (tag === 'table') {
      // A table nested in a cell: its caption, then one line per row, its
      // cells joined by a separator (a table nested deeper still collapses
      // the same way, keeping its own row breaks).
      for (const caption of Array.from(child.children)) {
        if (caption.tagName.toLowerCase() === 'caption') {
          lines.push(...cellLines(caption, depth));
        }
      }
      for (const row of ownRows(child)) {
        const line = gridCells(row)
          .map((cell) => cellLines(cell, depth).join('<br>'))
          .filter(Boolean)
          .join(NESTED_CELL_SEPARATOR);
        if (line) lines.push(line);
      }
    } else if (tag === 'pre') {
      for (const text of codeText(child).split('\n')) {
        if (!text.trim()) continue;
        const code = child.ownerDocument.createElement('code');
        code.textContent = text.trimEnd();
        lines.push(code.outerHTML);
      }
    } else if (tag !== 'hr') {
      lines.push(...cellLines(child, depth));
    }
  }
  flush();
  return lines;
}

// A backslash right before a pipe. In a GFM table cell that pipe needs its
// own escape, but in code a backslash is literal, so `\\|` would show both
// backslashes: code containing `\|` can't sit in a Markdown table unchanged.
const UNSAFE_CODE_PIPES = /\\\|/;

// Flatten lists, headings, code blocks, nested tables, and other blocks in a
// table's cells into lines joined by <br>, so the table stays a GFM table
// instead of falling back to raw HTML or losing its grid. Leaves alone a
// one-cell table, which the plugin renders as plain content, so its blocks
// survive.
function flattenCellBlocks(table: Element): void {
  const rows = ownRows(table);
  const cells = rows.flatMap(gridCells);
  if (cells.length <= 1) return;
  // Code must come through exactly, so a table whose code has `\|` stays HTML.
  if (all(table, 'pre').some((pre) => UNSAFE_CODE_PIPES.test(codeText(pre)))) {
    return;
  }
  for (const cell of cells) {
    if (cell.querySelector(CELL_FALLBACK_SELECTOR))
      cell.innerHTML = cellLines(cell).join('<br>');
  }
}

// Mammoth renders footnotes/endnotes as a trailing <ol> whose items carry ids
// like `footnote-1` / `endnote-1`.
const NOTE_ITEM_ID = /^(?:foot|end)note-\d+$/;
// ...and their references as <a id="footnote-ref-1">: anchors, but not bookmarks.
const NOTE_ANCHOR_ID = /^(?:foot|end)note-(?:ref-)?\d+$/;

// The first non-blank text node in an element, in document order, without
// descending into a nested list (whose items are handled on their own).
function firstTextNode(node: Element): Text | null {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === TEXT_NODE) {
      if ((child as Text).data.trim()) return child as Text;
      continue;
    }
    if (child.nodeType !== ELEMENT_NODE) continue;
    const tag = (child as Element).tagName.toLowerCase();
    if (tag === 'ul' || tag === 'ol') return null;
    const text = firstTextNode(child as Element);
    if (text) return text;
  }
  return null;
}

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

// Point Word's internal links (table-of-contents entries, cross-references) at
// the Markdown heading they target. Mammoth renders a bookmark as an empty
// <a id="_Toc123"> and links to it as href="#_Toc123", but Turndown drops the
// anchor, so the link would point nowhere. A bookmark inside a heading maps to
// that heading's GitHub-style slug (what GitHub, and most renderers, generate);
// links to any other bookmark are unwrapped to their text. `headingText` maps
// a heading's text to what the Markdown will finally hold (equation
// placeholders back to LaTeX), so the slug matches the rendered heading.
function rewriteBookmarkLinks(
  root: Element,
  headingText: (text: string) => string = (text) => text,
): void {
  const bookmarks = all(root, 'a[id]').filter(
    (anchor) => !NOTE_ANCHOR_ID.test(anchor.id),
  );
  if (bookmarks.length === 0) return;

  // Every heading is slugged, in document order, so repeated titles get the
  // same `-1`, `-2` suffixes the renderer will give them.
  const slugger = new GithubSlugger();
  const headingSlugs = new Map<Element, string>();
  for (const el of all(root, '*')) {
    if (HEADING_TAGS.has(el.tagName.toLowerCase())) {
      headingSlugs.set(
        el,
        slugger.slug(normalizeText(headingText(el.textContent ?? ''))),
      );
    }
  }

  const targets = new Map<string, string | null>();
  for (const anchor of bookmarks) {
    let heading = anchor.parentElement;
    while (heading && !headingSlugs.has(heading)) {
      heading = heading.parentElement;
    }
    targets.set(anchor.id, heading ? headingSlugs.get(heading)! : null);
  }

  for (const link of all(root, 'a[href^="#"]')) {
    const id = link.getAttribute('href')!.slice(1);
    if (!targets.has(id)) continue;
    const slug = targets.get(id);
    if (slug) link.setAttribute('href', `#${slug}`);
    else unwrap(link);
  }
}

function isNoteList(list: Element): boolean {
  return Array.from(list.children).some(
    (node) =>
      node.tagName.toLowerCase() === 'li' &&
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
  opts: {
    stripImages?: boolean;
    bulletLists?: boolean;
    headingText?: (text: string) => string;
    // The marker src/numbering.ts wrote Word's list numbers with.
    listStartToken?: string;
    // Receives the document's visible text once the fixups are done: no tags,
    // attributes, link URLs, or base64 image data.
    onText?: (text: string) => void;
  } = {},
): string {
  const root = parseFragment(html);

  // First, so no other fixup (a heading's slug, a list flattened into a
  // table cell, the document's text) sees a list-number marker.
  if (opts.listStartToken) applyListStarts(root, opts.listStartToken);

  // Mammoth opens a list item for a missing parent level, so a sub-item
  // with no item above it (after a paragraph, say) came out under an empty
  // bullet: `- 1. b`. A list whose one item holds nothing but a list is
  // replaced by that list, unless a list of its kind sits right next to it:
  // Markdown would merge the two, renumbering the other list's items. Deepest
  // first, so a chain unwraps fully.
  all(root, 'ul, ol')
    .reverse()
    .forEach((list) => {
      const items = Array.from(list.children);
      if (items.length !== 1 || items[0].tagName !== 'LI') return;
      const inner = Array.from(items[0].childNodes).filter(
        (node) =>
          node.nodeType !== TEXT_NODE || (node as Text).data.trim() !== '',
      );
      const only = inner[0] as Element | undefined;
      if (inner.length !== 1 || !/^(UL|OL)$/.test(only?.nodeName ?? '')) {
        return;
      }
      const kind = only!.nodeName;
      if (
        list.previousElementSibling?.nodeName === kind ||
        list.nextElementSibling?.nodeName === kind
      ) {
        return;
      }
      replaceNode(list, [only!]);
    });

  // Remove images (Mammoth inlines them as base64 data URIs by default, which
  // can bloat the output for image-heavy documents).
  if (opts.stripImages) {
    all(root, 'img').forEach((img) => img.remove());
  }

  // Unwrap single-cell tables whose only content is a <pre> code block. Word and
  // LibreOffice commonly wrap a code block in a bordered 1×1 table (a shaded box);
  // left alone, Turndown would render the code as a one-cell Markdown table. This
  // must run before the header-promotion pass below, which would otherwise turn
  // the code cell's <td> into a <th> and mangle the block.
  all(root, 'table').forEach((table) => {
    // This table's own row and cell only: a table nested in the cell would
    // otherwise add to the counts.
    const rows = ownRows(table);
    if (rows.length !== 1) return;
    const cells = rowCells(rows[0]);
    if (cells.length !== 1) return;
    const cell = cells[0];
    const pres = all(cell, 'pre');
    // Only unwrap when the cell holds exactly one <pre> and nothing else of
    // substance (its text is entirely the code) — never strip a table that also
    // contains prose or other elements alongside the code.
    if (pres.length !== 1) return;
    if (cell.textContent?.trim() !== pres[0].textContent?.trim()) return;
    replaceNode(table, [pres[0]]);
  });

  // Flatten Word's merged cells into one empty <td> per spanned grid column.
  // Runs after the 1×1 <pre> unwrap above, which keys on a cell count of one.
  all(root, 'table').forEach((table) => {
    expandMergedCells(table);
  });

  // Turn lists and headings in cells into <br>-separated lines, so the table
  // isn't kept as raw HTML. Runs after the merge expansion (it counts cells)
  // and before the bookmark rewrite below (a heading in a cell stops being a
  // heading, so it gets no slug).
  all(root, 'table').forEach((table) => {
    flattenCellBlocks(table);
  });

  rewriteBookmarkLinks(root, opts.headingText);

  // Process tables - convert first row to table headers
  all(root, 'table').forEach((table) => {
    const rows = ownRows(table);
    if (rows.length === 0) return;

    // If first row already has TH elements, leave it alone
    if (gridCells(rows[0]).some((cell) => cell.tagName === 'TH')) return;

    // Drop leading empty rows (Word tables often start with spacer rows) and
    // promote the first row with content. A table with no content at all is
    // left as-is.
    const headerIndex = rows.findIndex((row) => !isEmptyRow(row));
    if (headerIndex === -1) return;
    rows.slice(0, headerIndex).forEach((row) => row.remove());
    rowCells(rows[headerIndex]).forEach((cell) => renameElement(cell, 'th'));
  });

  // Process lists - remove unicode bullets from unnumbered list items. Edit
  // the item's first text node in place rather than re-setting its innerHTML,
  // which would re-parse the item and detach any nested <li> collected here,
  // leaving their bullets behind.
  all(root, 'ul li').forEach((listItem) => {
    const text = firstTextNode(listItem);
    if (text) text.data = text.data.replace(bulletRegex, '');
  });

  // Optionally render numbered lists as bullet lists by renaming <ol> to <ul>.
  // Doing it on the DOM (rather than rewriting `1.` markers in the Markdown)
  // can't touch numbered lines inside code blocks or literal text. Mammoth's
  // footnote/endnote list stays ordered: it's not a real list, and the footnote
  // conversion (or, with footnotes preserved, the numbered note list) relies on
  // it. Runs after the unicode-bullet strip above so formerly numbered items
  // keep their content as-is.
  if (opts.bulletLists) {
    all(root, 'ol').forEach((list) => {
      if (isNoteList(list)) return;
      const bullets = renameElement(list, 'ul');
      bullets.removeAttribute('start');
      bullets.removeAttribute('type');
    });
  }

  opts.onText?.(root.textContent ?? '');
  return serializeFragment(root);
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
// exactly the DOM Turndown builds (no parser differential: processHtml's tree is
// serialized and re-parsed, and in the browser's main-thread fallback Turndown
// uses the browser's own parser). Turndown asks the rules for
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

// A line break inside a table cell. Turndown renders <br> as a two-space hard
// break, and the GFM plugin then turns the newline into a literal `<br>`,
// leaving `text  <br>more` in the cell. A bare newline becomes the same `<br>`
// without the stray spaces. A one-cell table is the exception: the plugin
// renders its content as plain paragraphs, where a newline would collapse.
function addTableCellLineBreakRule(service: TurndownService): void {
  service.addRule('tableCellLineBreak', {
    filter: (node) => {
      if (node.nodeName !== 'BR') return false;
      const cell = node.closest('td, th');
      const rows = cell?.closest('table')?.rows;
      if (!rows) return false;
      // The plugin's own one-cell test, which counts child nodes.
      return rows.length > 1 || rows[0].childNodes.length > 1;
    },
    replacement: () => '\n',
  });
}

// Give each table a fixed `rows` list before the GFM plugin renders it. The
// plugin reads `table.rows` inside loops: once per row to count columns, and
// once per row for every column to vote on alignment. Browsers return the same
// live collection from every read, but domino, the DOM Turndown parses with in
// Node and in the worker, builds a new list on each read by walking the whole
// table, so a table cost time quadratic in its rows (one table of 2,000 rows
// spent about 20 s in Turndown). Caching the list the getter returns keeps the
// plugin's results identical, since domino's list is still live: it rebuilds
// itself if the table changes. This rule never matches: its filter runs ahead
// of the other rules on each cell (and each <br>, which a cell's content
// reaches first and addTableCellLineBreakRule checks), so the list is cached
// before any table rule reads `rows`.
function addTableRowsCacheRule(service: TurndownService): void {
  const cached = new WeakSet<object>();
  service.addRule('tableRowsCache', {
    filter: (node) => {
      if (!['TD', 'TH', 'BR'].includes(node.nodeName)) return false;
      const table = node.closest('table');
      if (table && !cached.has(table)) {
        cached.add(table);
        Object.defineProperty(table, 'rows', { value: table.rows });
      }
      return false;
    },
    replacement: () => '',
  });
}

// An ordered-list item numbered 100 or higher. Turndown pads every marker to
// four columns (`' '.repeat(3 - digits)`), so `100.` gets no space after it
// and doesn't parse as a list item, and from 1000 the negative repeat throws.
// This mirrors Turndown's listItem rule for those items only, with at least one
// space after the marker and continuation lines indented to the marker's width
// so nested lists and later paragraphs stay inside the item. Items in code
// blocks and Joplin checklists (never produced by mammoth) keep Turndown's rule.
type TurndownRule = Parameters<TurndownService['addRule']>[1];
type TurndownNode = Parameters<TurndownRule['replacement']>[1];

function addLongOrderedListItemRule(service: TurndownService): void {
  // Each list's element positions, indexed once per list. Finding an item's
  // position with indexOf on every <li> (the filter checks every item, and the
  // replacement asks again) cost time quadratic in the list's length: an
  // ordered list of 16,000 items spent about half its Turndown time there. The
  // DOM doesn't change shape while Turndown converts it, so the index holds.
  const positions = new WeakMap<TurndownNode, Map<unknown, number>>();
  const indexIn = (parent: TurndownNode, node: TurndownNode): number => {
    let index = positions.get(parent);
    if (!index) {
      index = new Map();
      const { children } = parent;
      for (let i = 0; i < children.length; i++) index.set(children[i], i);
      positions.set(parent, index);
    }
    return index.get(node) ?? -1;
  };
  const itemNumber = (node: TurndownNode): number | null => {
    const parent = node.parentNode;
    if (!parent) return null;
    const ordered =
      parent.nodeName === 'OL' || parent.style?.listStyleType === 'decimal';
    if (!ordered) return null;
    const start = parent.getAttribute('start');
    return (start ? Number(start) : 1) + indexIn(parent, node);
  };
  service.addRule('longOrderedListItem', {
    filter: (node) => {
      if (node.nodeName !== 'LI') return false;
      if (node.isCode) return false;
      if (
        node.classList.contains('joplin-checkbox') ||
        node.classList.contains('joplin-checklist-item') ||
        node.closest('.joplin-checklist')
      ) {
        return false;
      }
      const number = itemNumber(node);
      return number !== null && number >= 100;
    },
    replacement: (content, node) => {
      const prefix = `${itemNumber(node)}. `;
      let body = content.replace(/^\n+/, '').replace(/\n+$/, '\n');
      body = body.replace(/\n/gm, `\n${' '.repeat(prefix.length)}`);
      // As in Turndown: an item must not start with a blank line.
      body = body.replace(/^[ \n]*\n[ \n]*/, '');
      return (
        prefix + body + (node.nextSibling && !/\n$/.test(body) ? '\n' : '')
      );
    },
  });
}

// A heading that starts with a number, such as `1. Scope` from a numbered
// heading (see src/numbering.ts) or one typed by hand. Turndown escapes a
// leading `1. ` so a paragraph doesn't turn into a list, which gave
// `## 1\. Scope`, but an ATX heading can't be a list item, so the escape is
// only noise. Setext headings (levels 1 and 2 with `headingStyle: 'setext'`)
// keep it: their text is a line of its own, which `1. ` would make a list.
function addNumberedHeadingRule(
  service: TurndownService,
  setext: boolean,
): void {
  service.addRule('numberedHeading', {
    filter: (node) =>
      /^H[1-6]$/.test(node.nodeName) &&
      (!setext || Number(node.nodeName[1]) > 2),
    replacement: (content, node) =>
      `\n\n${'#'.repeat(Number(node.nodeName[1]))} ${content.replace(/^(\d+)\\\. /, '$1. ')}\n\n`,
  });
}

// The GFM plugin wraps a table it can't convert in a Joplin-specific scroll
// container div before emitting it as HTML. processHtml flattens the cell
// content that triggers this, but if some table still falls back, emit the
// plain <table> rather than markup that only means something to Joplin. Only
// the plugin's output for a real table is touched, never text that merely
// looks like the wrapper (in a code block).
const JOPLIN_TABLE_WRAPPER =
  /^(\s*)<div class="joplin-table-wrapper">([\s\S]*)<\/div>(\s*)$/;

// The plugin escapes a cell's pipes by replacing each run of them with one
// `\|`, so `a || b` came out as `a | b`. Hide each pipe from it behind a
// private-use character and escape them one by one afterwards.
// The placeholder is a private-use character the cell doesn't already hold,
// so a literal one in the document is never mistaken for a pipe.
function escapeCellPipes(
  content: string,
  escapeRuns: (hidden: string) => string,
): string {
  if (!content.includes('|')) return escapeRuns(content);
  let code = 0xe000;
  while (content.includes(String.fromCharCode(code)) && code < 0xf8ff) code++;
  const placeholder = String.fromCharCode(code);
  return escapeRuns(content.replaceAll('|', placeholder)).replaceAll(
    placeholder,
    '\\|',
  );
}

// Add the GFM plugin, then wrap two of its rules (each wrapper is added later,
// so Turndown tries it first and it calls the plugin's own replacement).
function useGfm(service: TurndownService): void {
  const addRule = service.addRule;
  const gfmRules = new Map<string, TurndownRule>();
  service.addRule = function (key, rule) {
    gfmRules.set(key, rule);
    return addRule.call(this, key, rule);
  };
  try {
    service.use(turndownPluginGfm.gfm);
  } finally {
    service.addRule = addRule;
  }
  const table = gfmRules.get('table');
  if (table) {
    service.addRule('tableWithoutJoplinWrapper', {
      filter: table.filter,
      replacement: (content, node) =>
        table
          .replacement(content, node)
          .replace(JOPLIN_TABLE_WRAPPER, '$1$2$3'),
    });
  }
  const tableCell = gfmRules.get('tableCell');
  if (tableCell) {
    service.addRule('tableCellPipes', {
      filter: tableCell.filter,
      replacement: (content, node) =>
        escapeCellPipes(content, (hidden) =>
          tableCell.replacement(hidden, node),
        ),
    });
  }
}

function createTurndownService(
  options: object,
  keepTags: string[],
  gfmFootnotes: boolean,
): TurndownService {
  const merged: turndownOptions = { ...defaultTurndownOptions, ...options };
  const service = new TurndownService(merged);
  useGfm(service);
  addTableCellLineBreakRule(service);
  addLongOrderedListItemRule(service);
  addNumberedHeadingRule(service, merged.headingStyle === 'setext');
  if (keepTags.length > 0) service.keep(keepTags);
  if (gfmFootnotes) addFootnoteRules(service);
  addLinkAllowlistRule(service);
  // Added last so its filter runs first: Turndown checks the newest rule first.
  addTableRowsCacheRule(service);
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

/**
 * Whether most of the letters in `text` are Chinese characters, used to decide
 * whether curly quotes are Chinese quotation marks. Kana means Japanese, which
 * also uses Han characters, so text with a meaningful share of kana does not
 * count. Mirrors the preset heuristic in markdown-to-word-js.
 *
 * Pass the document's visible text, not the Markdown: link URLs and inlined
 * base64 images are letters too, and would outweigh the Chinese. Counts in one
 * pass rather than with `match()`, which would build an array per character.
 */
const LETTER = /\p{L}/u;
const HAN = /\p{Script=Han}/u;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
function isMostlyChinese(text: string): boolean {
  let letters = 0;
  let han = 0;
  let kana = 0;
  for (const char of text) {
    if (!LETTER.test(char)) continue;
    letters++;
    if (HAN.test(char)) han++;
    else if (KANA.test(char)) kana++;
  }

  return han >= 10 && han / letters >= 0.5 && kana < han / 10;
}

// Remove unicode non-breaking spaces and convert smart quotes to ASCII in a
// single pass. Chinese quotation marks use the same code points, so callers
// pass `keepQuotes` for mostly-Chinese text instead of flattening them.
function normalizeText(md: string, keepQuotes = false): string {
  const normalized = md.replace(
    nonBreakingSpacesRegex,
    (char) => nonBreakingSpaceMap[char],
  );

  return keepQuotes
    ? normalized
    : normalized.replace(smartQuotesRegex, (char) => smartQuoteMap[char]);
}

// Every rule but MD029 (ol-prefix), whose fix renumbers any ordered list to
// start at 1, so `<ol start="5">` (e.g. in pasted HTML) lost its number.
// Prettier runs next and numbers lists itself, keeping the first number and
// counting up, so lists that start at 1 come out exactly as before.
const lintConfig = { MD029: false };

// Lint the Markdown and correct any issues
function lint(md: string): string {
  const lintResult = markdownlint.lint({ strings: { md }, config: lintConfig });
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

// Custom property names that hold a classification, whose value is the label.
const CLASSIFICATION_PROPERTY_NAME = /sensitiv|classif|msip_label/i;
const CUSTOM_PROPERTY_OPEN = /<property\b[^>]*\bname="([^"]*)"[^>]*>/i;

// Whether docProps/custom.xml marks the document confidential: a property
// named for it, or a classification property whose value says so. Like the
// field-scoped core check above, free-text properties don't count, so a
// "Notes" value of "not confidential" isn't flagged. Splitting on the closing
// tag keeps this linear on large or malformed XML.
function hasConfidentialCustomProperty(customXml: string): boolean {
  return customXml.split(/<\/property>/i).some((chunk) => {
    const start = chunk.lastIndexOf('<property');
    if (start === -1) return false;
    const property = chunk.slice(start);
    const match = CUSTOM_PROPERTY_OPEN.exec(property);
    if (!match) return false;
    const [openTag, name] = match;
    if (/confidential/i.test(name)) return true;
    // The value's wrapper tags (<vt:lpwstr> and the like) can't contain the
    // word, so test the inner XML as-is rather than stripping tags.
    const value = property.slice(openTag.length);
    return (
      CLASSIFICATION_PROPERTY_NAME.test(name) && /confidential/i.test(value)
    );
  });
}

// The visible text of a WordprocessingML part, leaving out field results (the
// "3" a PAGE field displays) but keeping text typed around them. Fields nest,
// so this tracks depth.
//
// This reads untrusted XML, so it's built to stay linear on malformed input:
// attribute scans stop at the next `<` or `>` and are length-bounded, so a
// failed match can't rescan the rest of the part (an unbounded `[^>]*` made
// 256 KB of unterminated `<w:t ` take seconds); the input, nesting depth, and
// part count are capped too.
const TEXT_OR_FIELD =
  /<w:fldChar\b[^<>]{0,512}?w:fldCharType="(begin|separate|end)"|<w:fldSimple\b[^<>]{0,2048}?(\/)?>|<\/w:fldSimple>|<w:t(?:\s[^<>]{0,512})?>([^<]*)/g;

// Enough for any real part; past it, a scan is best-effort.
const MAX_SCAN_CHARS = 8 * 1024 * 1024;
const MAX_FIELD_DEPTH = 64;

function visibleText(xml: string): string {
  let text = '';
  // One entry per open field: whether we're past its "separate" (its result).
  const fields: boolean[] = [];
  // How many of those are past "separate", so text checks are O(1).
  let inResult = 0;
  // Fields opened past MAX_FIELD_DEPTH, tracked only to stay balanced.
  let overflow = 0;
  let simpleDepth = 0;
  for (const [token, fldChar, selfClosing, t] of xml
    .slice(0, MAX_SCAN_CHARS)
    .matchAll(TEXT_OR_FIELD)) {
    if (fldChar === 'begin') {
      if (fields.length < MAX_FIELD_DEPTH) fields.push(false);
      else overflow++;
    } else if (fldChar === 'separate') {
      if (overflow === 0 && fields.length > 0 && !fields[fields.length - 1]) {
        fields[fields.length - 1] = true;
        inResult++;
      }
    } else if (fldChar === 'end') {
      if (overflow > 0) overflow--;
      else if (fields.pop()) inResult--;
    } else if (token.startsWith('<w:fldSimple')) {
      if (!selfClosing) simpleDepth++;
    } else if (token === '</w:fldSimple>') {
      simpleDepth = Math.max(0, simpleDepth - 1);
    } else if (t !== undefined && simpleDepth === 0 && inResult === 0) {
      text += t;
    }
  }
  return text;
}

// Has a letter or digit: whitespace and punctuation alone aren't content.
const HAS_CONTENT = /[\p{L}\p{N}]/u;

// Comments with text in word/comments.xml. Splitting on the closing tag keeps
// this linear on large or malformed XML.
function countComments(commentsXml: string): number {
  return commentsXml.split(/<\/w:comment>/).filter((chunk) => {
    const start = chunk.lastIndexOf('<w:comment ');
    return start !== -1 && HAS_CONTENT.test(visibleText(chunk.slice(start)));
  }).length;
}

// Text boxes mammoth drops: a DrawingML text box (<wps:txbx>) outside any
// <mc:AlternateContent>. Word writes text boxes as an AlternateContent whose
// VML fallback mammoth does read, so only a text box without that fallback
// (as some other tools write them) is lost.
const TEXT_BOX_TOKEN =
  /<mc:AlternateContent\b|<\/mc:AlternateContent>|<wps:txbx\b|<\/wps:txbx>/g;

function countDroppedTextBoxes(documentXml: string): number {
  let depth = 0;
  let count = 0;
  let start = -1;
  for (const match of documentXml
    .slice(0, MAX_SCAN_CHARS)
    .matchAll(TEXT_BOX_TOKEN)) {
    const token = match[0];
    if (token === '<mc:AlternateContent') depth++;
    else if (token === '</mc:AlternateContent>') depth = Math.max(0, depth - 1);
    else if (token === '<wps:txbx') start = depth === 0 ? match.index : -1;
    else if (start !== -1) {
      if (HAS_CONTENT.test(visibleText(documentXml.slice(start, match.index))))
        count++;
      start = -1;
    }
  }
  return count;
}

const HEADER_FOOTER_PART = /^word\/(?:header|footer)\d*\.xml$/;
// Word writes up to three headers and three footers per section; this covers
// dozens of sections, and the scan stops at the first one with text anyway.
const MAX_HEADER_FOOTER_PARTS = 64;

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

  let zip: JSZip | undefined;
  try {
    zip = await JSZip.loadAsync(arrayBuffer);
  } catch {
    // Not a readable zip: no properties to find
  }
  // Outside the lenient try below, since it reads (inflates) parts
  if (zip) {
    assertUnpackedSizeWithinLimit(
      zip,
      typeof input === 'string' ? input : undefined,
    );
  }

  try {
    if (!zip) return properties;

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
      const hasMSIPLabel = customXmlLower.includes('msip_label');

      if (hasSensitivityProperty || hasMSIPLabel) {
        properties.sensitivity = 'detected in custom properties';
      }

      if (hasConfidentialCustomProperty(customXml)) {
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

    // Content mammoth leaves out without a message of its own: comments,
    // headers and footers, and text boxes it can't read.
    const commentsFile = zip.file('word/comments.xml');
    if (commentsFile) {
      const comments = countComments(await commentsFile.async('string'));
      if (comments > 0) properties.comments = comments;
    }

    for (const part of zip
      .file(HEADER_FOOTER_PART)
      .slice(0, MAX_HEADER_FOOTER_PARTS)) {
      if (HAS_CONTENT.test(visibleText(await part.async('string')))) {
        properties.headersFooters = true;
        break;
      }
    }

    const documentFile = zip.file('word/document.xml');
    if (documentFile) {
      const textBoxes = countDroppedTextBoxes(
        await documentFile.async('string'),
      );
      if (textBoxes > 0) properties.textBoxes = textBoxes;
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
  return generateWarningDetails(properties).map((w) => w.message);
}

function generateWarningDetails(
  properties: DocumentProperties,
): WarningDetail[] {
  const warnings: WarningDetail[] = [];

  if (properties.encryption) {
    warnings.push({
      kind: 'encrypted',
      message:
        'Warning: This document appears to be encrypted. Conversion may not include all content or may fail entirely.',
    });
  }

  if (properties.sensitivity) {
    warnings.push({
      kind: 'sensitivity',
      detail: properties.sensitivity,
      message: `Warning: This document has sensitivity labels (${properties.sensitivity}). Please ensure you have permission to convert and share this content.`,
    });
  }

  if (properties.confidentiality) {
    warnings.push({
      kind: 'confidentiality',
      detail: properties.confidentiality,
      message: `Warning: This document contains confidentiality markers (${properties.confidentiality}). Please verify that conversion is authorized.`,
    });
  }

  if (properties.protection) {
    warnings.push({
      kind: 'protected',
      message:
        'Warning: This document has editing restrictions enabled. Some content may not convert properly.',
    });
  }

  const dropped = [
    properties.comments && `comments (${properties.comments})`,
    properties.headersFooters && 'headers and footers',
    properties.textBoxes && `text boxes (${properties.textBoxes})`,
  ];
  for (const detail of dropped) {
    if (!detail) continue;
    warnings.push({
      kind: 'content-loss',
      detail,
      message: `Warning: Some document content was not converted and is missing from the Markdown (${detail}).`,
    });
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

// The most a .docx may unpack to. A .docx is a zip, so a small file can
// inflate to gigabytes (a "zip bomb"): one of 714 KB whose document.xml
// unpacks to 700 MB drove memory past 3 GB before failing. V8 can't hold a
// string over about 512 MB, and Mammoth parses the XML into a DOM on top of
// that, so 200 MB leaves headroom while staying far above real documents
// (the web UI's 20 MB limit is on the compressed file).
const MAX_UNCOMPRESSED_SIZE = 200 * 1024 * 1024;

// Refuse a zip whose parts add up to more than MAX_UNCOMPRESSED_SIZE, judged
// from the sizes in its central directory, which JSZip reads without
// inflating anything. Those sizes are only declared: a forged header can
// understate them, which this doesn't catch. JSZip reads them as signed
// 32-bit ints, so `>>> 0` restores sizes of 2 GiB and up (which would
// otherwise count as negative); a ZIP64 size of 4 GiB or more reaches us
// with its high bits already dropped, the same blind spot as a forged one.
function assertUnpackedSizeWithinLimit(zip: JSZip, filePath?: string): void {
  let total = 0;
  for (const entry of Object.values(zip.files)) {
    // JSZip keeps the declared size on a private field; its typings note it.
    const size = (entry as { _data?: { uncompressedSize?: number } })._data
      ?.uncompressedSize;
    total += (size ?? 0) >>> 0;
    if (total > MAX_UNCOMPRESSED_SIZE) {
      throw new DocumentTooLargeError(filePath);
    }
  }
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

  // Before anything inflates a part. A file that isn't a zip at all is left
  // for Mammoth to reject, so it's classified as before.
  const zip = await JSZip.loadAsync(bytes).catch(() => undefined);
  if (zip) {
    assertUnpackedSizeWithinLimit(
      zip,
      typeof input === 'string' ? input : undefined,
    );
  }

  return { bytes, mammothInput: toMammothInput(bytes) };
}

function toMammothInput(bytes: ArrayBuffer): MammothInput {
  return typeof Buffer !== 'undefined'
    ? { buffer: Buffer.from(bytes) }
    : { arrayBuffer: bytes };
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

// Edits the .docx before Mammoth reads it, in one read and one write: each
// paragraph of a compound-numbered list gets its number as text, and an
// ordinary list's items a marker with theirs for processHtml (see
// src/numbering.ts), and each equation becomes a placeholder Mammoth keeps
// (see src/equations.ts), put back as LaTeX once the Markdown is formatted.
// `bytes` is undefined when nothing changed. Both passes are best-effort
// extras: if one fails outright, the document converts without it, as it did
// before the pass existed, rather than failing. An unreadable .docx is
// Mammoth's to report, with the error it always has.
async function rewriteDocx(
  bytes: ArrayBuffer,
  options: ConvertOptions,
): Promise<{
  bytes?: ArrayBuffer;
  math?: Awaited<ReturnType<typeof extractEquations>>;
  listStartToken?: string;
}> {
  // Bullets were asked for, so a list's numbers aren't written out either.
  const numbering = options.numberedLists !== 'bullets';
  const equations = options.equations !== 'strip';
  if (!numbering && !equations) return {};
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    return {};
  }
  const labeled: { changed: boolean; token?: string } = numbering
    ? await labelNumbering(zip).catch(() => ({ changed: false }))
    : { changed: false };
  const math = equations
    ? await extractEquations(zip).catch(() => undefined)
    : undefined;
  const changed = labeled.changed || Boolean(math?.equations.length);
  return {
    bytes: changed
      ? await zip.generateAsync({ type: 'arraybuffer' })
      : undefined,
    math,
    listStartToken: labeled.token,
  };
}

// The shared conversion pipeline: mammoth HTML -> cleaned, formatted Markdown.
// Returns mammoth's messages so callers can surface content-loss warnings, and
// (in extract mode) the extracted image assets.
async function runConversionPipeline(
  loaded: LoadedInput,
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

  reportProgress('rewrite-docx');
  const rewrite = await rewriteDocx(loaded.bytes, options);
  const math = rewrite.math;
  reportProgress('mammoth');
  const mammothResult = await mammoth.convertToHtml(
    rewrite.bytes ? toMammothInput(rewrite.bytes) : loaded.mammothInput,
    mammothOptions,
  );
  const messages: MammothMessage[] = [...mammothResult.messages];
  if (math?.failed) {
    // Worded like Mammoth's own messages, so extractMammothWarningDetails
    // surfaces it and the web UI names it as equations (it matches /oMath/).
    messages.push({
      type: 'warning',
      message: `Equations that could not be converted were left out: m:oMath (${math.failed})`,
    });
  }
  const markdown = await htmlPipeline(
    mammothResult.value,
    options,
    math &&
      ((text) => restoreInlineEquations(text, math.token, math.equations)),
    rewrite.listStartToken,
  );
  if (math?.equations.length) reportProgress('restore-equations');
  return {
    markdown: math
      ? restoreEquations(markdown, math.token, math.equations)
      : markdown,
    messages,
    images: extractor?.images,
  };
}

// Everything after mammoth: HTML fixups, Turndown, then the Markdown cleanup
// passes. Shared by .docx conversion and convertHtml.
async function htmlPipeline(
  html: string,
  options: ConvertOptions,
  headingText?: (text: string) => string,
  listStartToken?: string,
): Promise<string> {
  // Each stage reports as it starts, so the web worker can tell the page it's
  // alive (see src/progress.ts).
  reportProgress('process-html');
  // Curly quotes are kept on request, or by default when the document's text
  // (not its Markdown, see isMostlyChinese) is mostly Chinese.
  const quotes = options.quotes ?? 'auto';
  let keepQuotes = quotes === 'preserve';
  // Numbered lists stay numbered by default; flatten to bullets on request.
  const processedHtml = processHtml(html, {
    stripImages: options.images === 'strip',
    bulletLists: options.numberedLists === 'bullets',
    headingText,
    listStartToken,
    onText:
      quotes === 'auto'
        ? (text) => (keepQuotes = isMostlyChinese(text))
        : undefined,
  });
  // Footnotes become GFM `[^1]` by default; keep Mammoth's markup on request.
  reportProgress('turndown');
  const md = htmlToMd(
    processedHtml,
    options.turndown,
    options.underline === 'preserve' ? ['u'] : [],
    options.footnotes !== 'preserve',
  );
  reportProgress('normalize');
  const normalizedMd = normalizeText(md, keepQuotes);
  reportProgress('lint');
  const cleanedMd = lint(normalizedMd);
  reportProgress('prettier');
  return prettify(cleanedMd);
}

// Markup in clipboard HTML that isn't content: Word's <style> and
// conditional-comment blocks, <meta>/<title>/<link> head elements, and
// Office's <o:p> paragraph placeholders and <xml> islands.
const CLIPBOARD_NOISE_SELECTOR = 'style, script, meta, title, link, xml, o\\:p';

// Converts an HTML fragment, such as text copied from Word, Google Docs, or a
// web page, to Markdown with the same cleanup .docx conversion gets. There's no
// .docx to read, so mammoth, its style map, and image extraction don't apply:
// `options.mammoth`, `images: 'extract'`, and `imageDir` are ignored.
export async function convertHtml(
  html: string,
  options: ConvertOptions = {},
): Promise<string> {
  reportProgress('load');
  const root = parseFragment(html);
  all(root, CLIPBOARD_NOISE_SELECTOR).forEach((node) => node.remove());
  // Google Docs wraps a whole copied selection in a <b> with a
  // docs-internal-guid id and font-weight:normal; Turndown would make all of
  // it bold.
  all(root, 'b[id^="docs-internal-guid"]').forEach((wrapper) => {
    unwrap(wrapper);
  });
  // Google Docs also puts each list item's text in a <p>, which Turndown
  // renders as a loose list (a blank line between items).
  all(root, 'li').forEach((item) => {
    const children = Array.from(item.childNodes).filter(
      (node) =>
        node.nodeType === ELEMENT_NODE || node.textContent?.trim() !== '',
    );
    const only = children[0] as Element | undefined;
    if (children.length === 1 && only?.tagName === 'P') {
      unwrap(only);
    }
  });
  try {
    return await htmlPipeline(serializeFragment(root), {
      ...options,
      images: options.images === 'strip' ? 'strip' : 'inline',
    });
  } catch (error) {
    throw new ConversionError(
      'An error occurred while converting the HTML. Please try again.',
      error instanceof Error ? error : undefined,
    );
  }
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
  return extractMammothWarningDetails(messages).map((w) => w.message);
}

function extractMammothWarningDetails(
  messages: readonly MammothMessage[],
): WarningDetail[] {
  const seen = new Set<string>();
  const warnings: WarningDetail[] = [];

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
      warnings.push({
        kind: 'content-loss',
        message: warning,
        detail: message.message,
      });
    }
  }

  return warnings;
}

// A caller's style map can have mammoth render comments
// (`comment-reference => sup`), in which case they aren't missing.
function mapsComments(options: ConvertOptions): boolean {
  const styleMap = (options.mammoth as MammothOptions | undefined)?.styleMap;
  return [styleMap]
    .flat()
    .some(
      (entry) =>
        typeof entry === 'string' && /^\s*comment-reference\b/m.test(entry),
    );
}

// Converts a Word document to crisp, clean Markdown with warnings
export async function convertWithWarnings(
  input: string | ArrayBuffer,
  options: ConvertOptions = {},
): Promise<ConvertResult> {
  const filePath = typeof input === 'string' ? input : undefined;

  try {
    reportProgress('load');
    const loaded = await loadInput(input);

    // Extract document properties to check for confidentiality flags
    reportProgress('properties');
    const properties = await extractDocumentProperties(loaded.bytes);
    if (mapsComments(options)) delete properties.comments;
    const warningDetails = generateWarningDetails(properties);

    const { markdown, messages, images } = await runConversionPipeline(
      loaded,
      options,
    );
    warningDetails.push(...extractMammothWarningDetails(messages));

    const warnings = warningDetails.map((w) => w.message);
    return images
      ? { markdown, warnings, warningDetails, images }
      : { markdown, warnings, warningDetails };
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
    reportProgress('load');
    const loaded = await loadInput(input);

    const { markdown } = await runConversionPipeline(loaded, options);
    return markdown;
  } catch (error) {
    classifyConversionError(error, filePath);
  }
}
