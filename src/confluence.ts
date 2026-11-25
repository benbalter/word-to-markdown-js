// Markdown → Confluence wiki markup (h1., *bold*, ||header||, {code}…), the
// syntax Confluence's Insert → Markup → "Confluence wiki" dialog and its
// Data Center editors accept. It runs on the converter's finished Markdown, so
// every fix the pipeline makes (list starts, merged cells, bookmark links,
// footnotes) carries over, and the web page can switch formats without
// converting again.
//
// Written here rather than taken from npm: the maintained converters
// (@shogobg/markdown2confluence and its forks) need Node's `querystring`,
// escape nothing in prose (so a literal `{name}` becomes a broken macro and
// `[x]` a link), mangle inline <sup>, and drop footnotes. This parses with
// the remark packages the page's preview already loads, so the browser
// downloads no new parser.
import type {
  Nodes,
  PhrasingContent,
  Root,
  RootContent,
  Table,
  List,
  ListItem,
} from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { extensionForContentType } from './image-types.js';

const processor = unified().use(remarkParse).use(remarkGfm);

// An inline run is built as pieces so a formatting marker can see the
// characters on both sides of it once the whole run is assembled: Confluence
// only honors `*bold*` at word boundaries, and mid-word needs `{*}bold{*}`.
type Piece =
  | { kind: 'text'; value: string }
  | { kind: 'mark'; marker: string; pair: { braced: boolean } };

interface Context {
  // Images numbered in document order, as image extraction names them
  // (image1.png, image2.jpg, …), so an inline image's attachment name matches
  // the file in a "Download .zip".
  images: number;
  // Link reference definitions ([text][ref]), by identifier.
  definitions: Map<string, { url: string; title?: string | null }>;
  inTable: boolean;
  // Blocks found inside list items ({code}, tables, quotes), which a wiki list
  // item can't hold: written after the whole list instead.
  deferred: string[];
}

const WORD = /[\p{L}\p{N}]/u;
const SPACE = /\s/;

// Confluence turns these into icons: (i), (/), (x), (!), :), ;) and so on.
const EMOTICON =
  /^(?:\((?:[yni/x!+\-?*]|on|off|\*[rgby]|flag|flagoff)\)|[:;][)(PpDd])/;

// Escape prose so Confluence shows it literally. Braces would open a macro,
// brackets a link, a pipe a table cell, `!x!` an image; the formatting
// characters are escaped only where they could open or close formatting, so
// "word-to-markdown" stays readable. A backslash escapes the next character
// and `\\` is a line break, so a literal one is an entity.
function escapeText(value: string): string {
  // A soft line break inside a paragraph is a visible break in wiki markup.
  const text = value.replace(/[ \t]*\n[ \t]*/g, ' ');
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prev = text[i - 1];
    const next = text[i + 1];
    switch (ch) {
      case '\\':
        out += '&#92;';
        continue;
      case '{':
      case '}':
      case '[':
      case ']':
      case '|':
        out += `\\${ch}`;
        continue;
      case '!':
        out += next !== undefined && !SPACE.test(next) ? '\\!' : ch;
        continue;
      case '?':
        out += prev === '?' ? '\\?' : ch;
        continue;
      case '&':
        out += /^&#?\w+;/.test(text.slice(i)) ? '&amp;' : ch;
        continue;
      case '(':
      case ':':
      case ';':
        out += EMOTICON.test(text.slice(i)) ? `\\${ch}` : ch;
        continue;
      case '*':
      case '_':
      case '-':
      case '+':
      case '^':
      case '~': {
        const prevWord = prev !== undefined && WORD.test(prev);
        const nextWord = next !== undefined && WORD.test(next);
        const prevSpace = prev === undefined || SPACE.test(prev);
        const nextSpace = next === undefined || SPACE.test(next);
        const couldOpen = !nextSpace && !prevWord;
        const couldClose = !prevSpace && !nextWord;
        out += couldOpen || couldClose ? `\\${ch}` : ch;
        continue;
      }
      default:
        out += ch;
    }
  }
  return out;
}

// Inside {{monospace}} Confluence still reads markup, so anything that isn't
// a letter, digit, or space becomes an entity.
function escapeCode(value: string): string {
  return value
    .replace(/\s*\n\s*/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, (ch) => `&#${ch.codePointAt(0)};`);
}

// A line that starts like a list, heading, quote, or rule would become one.
function escapeLineStart(line: string): string {
  return /^(?:[#*-]+\s|h[1-6]\.\s|bq\.\s|----)/.test(line) ? `\\${line}` : line;
}

function wrap(marker: string, inner: Piece[]): Piece[] {
  if (inner.length === 0) return [];
  const pair = { braced: false };
  return [
    { kind: 'mark', marker, pair },
    ...inner,
    { kind: 'mark', marker, pair },
  ];
}

const HTML_MARKERS: Record<string, string> = {
  sup: '^',
  sub: '~',
  u: '+',
  ins: '+',
  del: '-',
  s: '-',
  strike: '-',
};

// A link or image target, with what would end the link escaped.
function safeUrl(url: string): string {
  return url.replace(/\|/g, '%7C').replace(/\]/g, '%5D').replace(/!/g, '%21');
}

function imageTarget(url: string, ctx: Context): string {
  const data = /^data:([^;,]+)[;,]/i.exec(url);
  if (data) {
    // Only inline images count, as extraction numbers only those.
    ctx.images++;
    return `image${ctx.images}.${extensionForContentType(data[1])}`;
  }
  // Confluence attachment names are flat: images/image1.png is attached as
  // image1.png.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) return url.split('/').pop() || url;
  return safeUrl(url);
}

function link(text: Piece[], url: string): Piece[] {
  const label = finalize(text);
  const target = safeUrl(url);
  return [
    {
      kind: 'text',
      value:
        label && label !== escapeText(url)
          ? `[${label}|${target}]`
          : `[${target}]`,
    },
  ];
}

function inline(nodes: PhrasingContent[], ctx: Context): Piece[] {
  const pieces: Piece[] = [];
  // Open inline HTML tags (<sup>…</sup> arrive as separate nodes), so each
  // closing tag reuses its opening marker's pair.
  const open: { tag: string; pair: { braced: boolean } }[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        pieces.push({ kind: 'text', value: escapeText(node.value) });
        break;
      case 'strong':
        pieces.push(...wrap('*', inline(node.children, ctx)));
        break;
      case 'emphasis':
        pieces.push(...wrap('_', inline(node.children, ctx)));
        break;
      case 'delete':
        pieces.push(...wrap('-', inline(node.children, ctx)));
        break;
      case 'inlineCode':
        pieces.push({ kind: 'text', value: `{{${escapeCode(node.value)}}}` });
        break;
      case 'break':
        pieces.push({ kind: 'text', value: ctx.inTable ? ' \\\\ ' : '\n' });
        break;
      case 'link':
        pieces.push(...link(inline(node.children, ctx), node.url));
        break;
      case 'linkReference': {
        const definition = ctx.definitions.get(node.identifier);
        const children = inline(node.children, ctx);
        pieces.push(
          ...(definition ? link(children, definition.url) : children),
        );
        break;
      }
      case 'image':
      case 'imageReference': {
        const url =
          node.type === 'image'
            ? node.url
            : ctx.definitions.get(node.identifier)?.url;
        if (!url) break;
        const alt = (node.alt ?? '').replace(/["|!\n]/g, ' ').trim();
        const target = imageTarget(url, ctx);
        pieces.push({
          kind: 'text',
          value: alt ? `!${target}|alt="${alt}"!` : `!${target}!`,
        });
        break;
      }
      case 'footnoteReference':
        // Confluence has no footnotes: a superscript number, matching the
        // numbered notes at the end.
        pieces.push(
          ...wrap('^', [
            { kind: 'text', value: escapeText(node.label ?? node.identifier) },
          ]),
        );
        break;
      case 'html': {
        const tag = /^<(\/?)([a-z]+)\b[^>]*?(\/?)>$/i.exec(node.value.trim());
        if (!tag) break;
        const name = tag[2].toLowerCase();
        if (name === 'br') {
          pieces.push({ kind: 'text', value: ctx.inTable ? ' \\\\ ' : '\n' });
          break;
        }
        const marker = HTML_MARKERS[name];
        if (!marker) break;
        if (tag[1]) {
          const index = open.map((entry) => entry.tag).lastIndexOf(name);
          if (index === -1) break;
          const [{ pair }] = open.splice(index, 1);
          pieces.push({ kind: 'mark', marker, pair });
        } else {
          const pair = { braced: false };
          open.push({ tag: name, pair });
          pieces.push({ kind: 'mark', marker, pair });
        }
        break;
      }
      default:
        break;
    }
  }
  return pieces;
}

// Join a run's pieces, bracing each formatting pair that touches a letter or
// digit on the outside (Confluence: "add braces around the markup" mid-word).
function finalize(pieces: Piece[]): string {
  const text = (index: number, step: 1 | -1): string | undefined => {
    for (let i = index + step; i >= 0 && i < pieces.length; i += step) {
      const piece = pieces[i];
      if (piece.kind === 'text' && piece.value) {
        return step === 1
          ? piece.value[0]
          : piece.value[piece.value.length - 1];
      }
      if (piece.kind === 'mark') return undefined;
    }
    return undefined;
  };
  // Each pair is seen twice, opening then closing.
  const seen = new Set<{ braced: boolean }>();
  for (const [index, piece] of pieces.entries()) {
    if (piece.kind !== 'mark') continue;
    const outside = seen.has(piece.pair) ? text(index, 1) : text(index, -1);
    seen.add(piece.pair);
    if (outside !== undefined && WORD.test(outside)) piece.pair.braced = true;
  }
  return pieces
    .map((piece) =>
      piece.kind === 'text'
        ? piece.value
        : piece.pair.braced
          ? `{${piece.marker}}`
          : piece.marker,
    )
    .join('');
}

function phrasing(nodes: PhrasingContent[], ctx: Context): string {
  return finalize(inline(nodes, ctx));
}

function list(node: List, prefix: string, ctx: Context): string {
  const marker = prefix + (node.ordered ? '#' : '*');
  const lines = node.children
    .map((item) => listItem(item, marker, ctx))
    .join('\n');
  // The outermost list writes out what its items couldn't hold.
  if (prefix !== '' || ctx.deferred.length === 0) return lines;
  const deferred = ctx.deferred.splice(0);
  return [lines, ...deferred].join('\n\n');
}

// A wiki list item is one line: its paragraphs join with line breaks, and a
// nested list follows on its own lines with a longer marker.
function listItem(item: ListItem, marker: string, ctx: Context): string {
  const text: string[] = [];
  const nested: string[] = [];
  for (const child of item.children) {
    if (child.type === 'list') nested.push(list(child, marker, ctx));
    else if (child.type === 'paragraph' || child.type === 'heading') {
      text.push(block(child, ctx).replace(/\n+/g, ' \\\\ '));
    } else {
      const rendered = block(child, ctx);
      if (rendered) ctx.deferred.push(rendered);
    }
  }
  return [`${marker} ${text.join(' \\\\ ')}`.trimEnd(), ...nested].join('\n');
}

function table(node: Table, ctx: Context): string {
  const inTable = ctx.inTable;
  ctx.inTable = true;
  const rows = node.children.map((row, index) => {
    const separator = index === 0 ? '||' : '|';
    const cells = row.children.map(
      (cell) => phrasing(cell.children, ctx).trim() || ' ',
    );
    return `${separator}${cells.join(separator)}${separator}`;
  });
  ctx.inTable = inTable;
  return rows.join('\n');
}

// A Confluence {code} language, or undefined for one it doesn't highlight
// (an unknown language is an error there, so those get {noformat}).
const LANGUAGES: Record<string, string> = {
  actionscript: 'actionscript3',
  actionscript3: 'actionscript3',
  applescript: 'applescript',
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  'c#': 'c#',
  cs: 'c#',
  csharp: 'c#',
  c: 'cpp',
  'c++': 'cpp',
  cpp: 'cpp',
  css: 'css',
  coldfusion: 'coldfusion',
  delphi: 'delphi',
  pascal: 'delphi',
  diff: 'diff',
  patch: 'diff',
  erlang: 'erlang',
  groovy: 'groovy',
  html: 'html',
  xml: 'xml',
  java: 'java',
  javafx: 'javafx',
  javascript: 'javascript',
  js: 'javascript',
  perl: 'perl',
  php: 'php',
  powershell: 'powershell',
  ps1: 'powershell',
  python: 'python',
  py: 'python',
  ruby: 'ruby',
  rb: 'ruby',
  sass: 'sass',
  scss: 'sass',
  scala: 'scala',
  sql: 'sql',
  vb: 'vb',
  yaml: 'yaml',
  yml: 'yaml',
};

function block(node: RootContent, ctx: Context): string {
  switch (node.type) {
    case 'paragraph': {
      // A LaTeX block ($$…$$, from a Word equation) stays verbatim.
      const only = node.children.length === 1 ? node.children[0] : undefined;
      if (only?.type === 'text' && /^\$\$[\s\S]*\$\$$/.test(only.value)) {
        return `{noformat}\n${only.value}\n{noformat}`;
      }
      return phrasing(node.children, ctx)
        .split('\n')
        .map(escapeLineStart)
        .join('\n');
    }
    case 'heading':
      return `h${node.depth}. ${phrasing(node.children, ctx)}`;
    case 'thematicBreak':
      return '----';
    case 'blockquote':
      return `{quote}\n${blocks(node.children, ctx)}\n{quote}`;
    case 'code': {
      const language = LANGUAGES[(node.lang ?? '').toLowerCase()];
      return language
        ? `{code:language=${language}}\n${node.value}\n{code}`
        : `{noformat}\n${node.value}\n{noformat}`;
    }
    case 'list':
      return list(node, '', ctx);
    case 'table':
      return table(node, ctx);
    case 'html':
      // Block HTML has no wiki equivalent: keep its text.
      return escapeText(node.value.replace(/<[^>]*>/g, ' ').trim());
    default:
      return '';
  }
}

function blocks(nodes: RootContent[], ctx: Context): string {
  return nodes
    .map((node) => block(node, ctx))
    .filter((text) => text !== '')
    .join('\n\n');
}

// Collect link reference definitions, which can appear anywhere.
function collectDefinitions(node: Nodes, ctx: Context): void {
  if (node.type === 'definition') {
    ctx.definitions.set(node.identifier, { url: node.url, title: node.title });
  }
  if ('children' in node) {
    for (const child of node.children) collectDefinitions(child, ctx);
  }
}

/**
 * Convert Markdown (GitHub-flavored, as the converter produces it) to
 * Confluence wiki markup. Footnotes become superscript numbers with the notes
 * listed at the end, inline images are named `image1.png`, `image2.jpg`, … in
 * document order (as `images: 'extract'` names the files to attach), and
 * ordered lists lose any start number, which wiki markup can't express.
 */
export function toConfluenceWiki(markdown: string): string {
  const tree = processor.parse(markdown) as Root;
  const ctx: Context = {
    images: 0,
    definitions: new Map(),
    inTable: false,
    deferred: [],
  };
  collectDefinitions(tree, ctx);
  const body = tree.children.filter(
    (node) => node.type !== 'footnoteDefinition',
  );
  const notes = tree.children.flatMap((node) =>
    node.type === 'footnoteDefinition'
      ? [
          `^${escapeText(node.label ?? node.identifier)}^ ${blocks(
            node.children,
            ctx,
          ).replace(/\n+/g, ' \\\\ ')}`,
        ]
      : [],
  );
  return [blocks(body, ctx), ...(notes.length ? ['----', ...notes] : [])]
    .filter((text) => text !== '')
    .join('\n\n');
}
