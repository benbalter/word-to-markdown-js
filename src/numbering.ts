import type JSZip from 'jszip';

// Word's compound ("legal") numbering, such as `1.` → `1.1`, `1.2`, as literal
// text. Mammoth's numbering model keeps only whether a level is ordered and
// how deep it is: no level text (`%1.%2`), no start values, and no list
// identity. So a clause numbered `%1.%2` under a numbered heading comes out as
// `- 1.` (Mammoth opens a `ul` for the missing parent level) and restarts at 1
// after every body paragraph, and the heading loses its number. Before Mammoth
// reads the .docx, each paragraph of such a list gets the number Word would
// show as a leading run, and its numbering is switched off, so it converts as
// the plain paragraph or heading it reads as.
//
// Only lists that have a level whose text refers to another level (`%1.%2`) or
// that force legal numbering (`w:isLgl`) are rewritten: an ordinary list keeps
// converting as a Markdown list. Its items only get a marker with Word's
// number, which applyListStarts turns into the `start` of a list Mammoth
// restarted after an interruption (Word's `1.`, a paragraph, `2.`), so it
// doesn't come out as `1.` again. Its headings, which Mammoth makes headings
// and not list items, get their number as text: `## 1. Introduction`.

interface Level {
  start: number;
  format: string;
  text: string;
  legal: boolean;
  // One-based level whose use restarts this one; 0 means never. Undefined is
  // Word's default: any shallower level restarts it.
  restart?: number;
  suffix: string;
}

interface Num {
  abstractId: string;
  // Levels a `w:lvlOverride` replaces, and starts a `w:startOverride` sets.
  levels: Map<number, Level>;
  starts: Map<number, number>;
}

interface Style {
  // Named `heading 1` to `heading 6`, which Mammoth makes a heading.
  heading: boolean;
  basedOn?: string;
  numId?: string;
  ilvl?: number;
}

// The `w:val` of the first `<w:name …/>` in xml.
function val(xml: string, name: string): string | undefined {
  return xml.match(new RegExp(`<w:${name}\\b[^>]*?\\bw:val="([^"]*)"`))?.[1];
}

// Whether an on/off property such as <w:isLgl/> is present and on.
function isOn(xml: string, name: string): boolean {
  const tag = xml.match(new RegExp(`<w:${name}\\b[^>]*>`))?.[0];
  if (!tag) return false;
  const value = tag.match(/\bw:val="([^"]*)"/)?.[1];
  return value === undefined || !/^(0|false|off)$/.test(value);
}

function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_, e) => {
    if (e[0] === '#') {
      const code =
        e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1);
      return String.fromCodePoint(code);
    }
    return { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[
      e.toLowerCase() as 'lt'
    ];
  });
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Word's start values run from 0 to 32767. Clamping to that keeps a crafted
// document from asking for, say, the 2-billionth letter (`AAAA…`, a string
// that long) and running the converter out of memory.
function clampStart(value: string): number {
  return Math.min(Math.max(Math.trunc(Number(value)) || 0, 0), 32767);
}

function readLevel(xml: string): Level {
  const restart = val(xml, 'lvlRestart');
  const suff = val(xml, 'suff');
  return {
    start: clampStart(val(xml, 'start') ?? '1'),
    format: val(xml, 'numFmt') ?? 'decimal',
    // Word's level text is a few characters. Capping it keeps a crafted one
    // from being copied, huge, into every paragraph of a long list.
    text: decodeEntities(val(xml, 'lvlText') ?? '').slice(0, 255),
    legal: isOn(xml, 'isLgl'),
    restart: restart === undefined ? undefined : Number(restart),
    suffix: suff === 'nothing' ? '' : ' ',
  };
}

function readLevels(xml: string): Map<number, Level> {
  const levels = new Map<number, Level>();
  for (const [, attrs, body] of xml.matchAll(
    /<w:lvl\b([^>]*)>([\s\S]*?)<\/w:lvl>/g,
  )) {
    levels.set(Number(attr(attrs, 'w:ilvl') ?? 0), readLevel(body));
  }
  return levels;
}

function readStyles(xml: string): Map<string, Style> {
  const styles = new Map<string, Style>();
  for (const [, attrs, body] of xml.matchAll(
    /<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g,
  )) {
    const id = attr(attrs, 'w:styleId');
    if (id === undefined) continue;
    const numPr = body.match(/<w:numPr>([\s\S]*?)<\/w:numPr>/)?.[1] ?? '';
    const ilvl = val(numPr, 'ilvl');
    styles.set(id, {
      heading: /^heading [1-6]$/i.test(val(body, 'name') ?? ''),
      basedOn: val(body, 'basedOn'),
      numId: val(numPr, 'numId'),
      ilvl: ilvl === undefined ? undefined : Number(ilvl),
    });
  }
  return styles;
}

// A style's numbering, inherited through `w:basedOn`.
function styleNumbering(
  styles: Map<string, Style>,
  id: string | undefined,
): { numId?: string; ilvl?: number } {
  const seen = new Set<string>();
  let numId: string | undefined;
  let ilvl: number | undefined;
  while (id !== undefined && !seen.has(id)) {
    seen.add(id);
    const style = styles.get(id);
    if (!style) break;
    numId ??= style.numId;
    ilvl ??= style.ilvl;
    id = style.basedOn;
  }
  return { numId, ilvl };
}

// Whether a level's text shows another level's number (`%1.%2` at level 1).
function isCompound(levels: Map<number, Level>): boolean {
  for (const [ilvl, level] of levels) {
    if (level.legal) return true;
    for (const [, k] of level.text.matchAll(/%(\d)/g)) {
      if (Number(k) !== ilvl + 1) return true;
    }
  }
  return false;
}

function letters(n: number): string {
  // Word repeats the letter past Z: AA, BB, …. Past 30 repeats, which no
  // real list reaches, the number is shown instead, so a long run of
  // paragraphs can't each add a label hundreds of letters long.
  if (n < 1 || n > 26 * 30) return String(n);
  const letter = String.fromCharCode(65 + ((n - 1) % 26));
  return letter.repeat(Math.floor((n - 1) / 26) + 1);
}

function roman(n: number): string {
  if (n < 1 || n >= 4000) return String(n);
  const numerals: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  for (const [value, numeral] of numerals) {
    while (n >= value) {
      out += numeral;
      n -= value;
    }
  }
  return out;
}

function formatNumber(n: number, format: string): string {
  switch (format) {
    case 'none':
      return '';
    case 'decimalZero':
      return n < 10 ? `0${n}` : String(n);
    case 'upperLetter':
      return letters(n);
    case 'lowerLetter':
      return letters(n).toLowerCase();
    case 'upperRoman':
      return roman(n);
    case 'lowerRoman':
      return roman(n).toLowerCase();
    default:
      return String(n);
  }
}

interface NumberingDefinitions {
  nums: Map<string, Num>;
  // The definition whose count a linked definition (`w:numStyleLink`) shares.
  links: Map<string, string>;
  abstracts: Map<string, Map<number, Level>>;
  styles: Map<string, Style>;
}

function readDefinitions(
  numberingXml: string,
  stylesXml: string,
): NumberingDefinitions {
  const styles = readStyles(stylesXml);
  const abstracts = new Map<string, Map<number, Level>>();
  const links = new Map<string, string>();
  for (const [, attrs, body] of numberingXml.matchAll(
    /<w:abstractNum\b([^>]*)>([\s\S]*?)<\/w:abstractNum>/g,
  )) {
    const id = attr(attrs, 'w:abstractNumId');
    if (id === undefined) continue;
    abstracts.set(id, readLevels(body));
    const link = val(body, 'numStyleLink');
    if (link !== undefined) links.set(id, link);
  }
  const nums = new Map<string, Num>();
  for (const [, attrs, body] of numberingXml.matchAll(
    /<w:num\b([^>]*)>([\s\S]*?)<\/w:num>/g,
  )) {
    const id = attr(attrs, 'w:numId');
    const abstractId = val(body, 'abstractNumId');
    if (id === undefined || abstractId === undefined) continue;
    const levels = new Map<number, Level>();
    const starts = new Map<number, number>();
    for (const [, overrideAttrs, override] of body.matchAll(
      /<w:lvlOverride\b([^>]*)>([\s\S]*?)<\/w:lvlOverride>/g,
    )) {
      const ilvl = Number(attr(overrideAttrs, 'w:ilvl') ?? 0);
      const start = val(override, 'startOverride');
      if (start !== undefined) starts.set(ilvl, clampStart(start));
      const lvl = override.match(/<w:lvl\b[^>]*>[\s\S]*?<\/w:lvl>/)?.[0];
      if (lvl) levels.set(ilvl, readLevel(lvl));
    }
    nums.set(id, { abstractId, levels, starts });
  }
  // A list that links to a numbering style uses the levels of the list that
  // style points to.
  const shared = new Map<string, string>();
  for (const [id, link] of links) {
    const target = nums.get(styles.get(link)?.numId ?? '');
    const levels = target && abstracts.get(target.abstractId);
    if (levels && target.abstractId !== id) {
      abstracts.set(id, levels);
      shared.set(id, target.abstractId);
    }
  }
  return { nums, links: shared, abstracts, styles };
}

// The end of the `<w:pPr>` that starts at `start`, counting the `<w:pPr>`
// nested in a tracked change (`<w:pPrChange>`), or -1.
function pPrEnd(xml: string, start: number): number {
  const tags = /<w:pPr>|<\/w:pPr>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let tag = tags.exec(xml); tag; tag = tags.exec(xml)) {
    depth += tag[0] === '<w:pPr>' ? 1 : -1;
    if (depth === 0) return tag.index + tag[0].length;
  }
  return -1;
}

const NO_NUMBERING =
  '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="0"/></w:numPr>';

// The paragraph properties with their own numbering replaced by numbering
// switched off. An explicit numId 0 (with an ilvl, which Mammoth needs before
// it reads the numId) also overrides numbering the style would give. A tracked
// change's old properties are left as they were.
function withoutNumbering(pPr: string): string {
  const change = pPr.match(/<w:pPrChange\b[\s\S]*<\/w:pPrChange>/);
  const before = change ? pPr.slice(0, change.index) : pPr;
  const after = change ? pPr.slice(change.index! + change[0].length) : '';
  const strip = (xml: string) =>
    xml.replace(/<w:numPr>[\s\S]*?<\/w:numPr>|<w:numPr\/>/g, '');
  const own = strip(before);
  const style = own.match(/<w:pStyle\b[^>]*\/>/);
  const at = style ? style.index! + style[0].length : '<w:pPr>'.length;
  return (
    own.slice(0, at) +
    NO_NUMBERING +
    own.slice(at) +
    (change?.[0] ?? '') +
    strip(after)
  );
}

// Rewrites one document part, returning undefined when nothing in it changed.
function labelParagraphs(
  xml: string,
  defs: NumberingDefinitions,
  compound: Set<string>,
  token: string,
): string | undefined {
  // Counters per list definition (`w:abstractNum`): in Word, lists made from
  // one definition count on from one another, while those of two definitions
  // count on their own. A list that starts a level at its own number
  // (`w:startOverride`, or a `w:lvl` of its own) does so once, at its first
  // paragraph of that level, and the others go on from there. As observed in
  // Word 16 by docx's layout probes (dolanmiu/docx,
  // scripts/layout-probes/word-lists.ts).
  const counters = new Map<string, (number | undefined)[]>();
  const restarted = new Set<string>();
  let out = '';
  let from = 0;
  let changed = false;
  let scanned = 0;
  for (const open of xml.matchAll(/<w:p(?:\s[^>]*)?>/g)) {
    // A paragraph inside properties already scanned (only in malformed XML,
    // where a <w:pPr> runs on) was read, or copied, with them. Skipping it
    // also scans each character once: nested runaway properties would
    // otherwise each be scanned to their end, quadratic in their number.
    if (open.index < scanned) continue;
    const pPrStart = open.index + open[0].length;
    if (!xml.startsWith('<w:pPr>', pPrStart)) continue;
    const end = pPrEnd(xml, pPrStart);
    if (end === -1) break;
    scanned = end;
    const pPr = xml.slice(pPrStart, end);
    const own = pPr.replace(/<w:pPrChange\b[\s\S]*<\/w:pPrChange>/, '');
    const numPr = own.match(/<w:numPr>([\s\S]*?)<\/w:numPr>/)?.[1];
    const styleId = val(own, 'pStyle');
    const inherited = styleNumbering(defs.styles, styleId);
    const numId = (numPr && val(numPr, 'numId')) ?? inherited.numId;
    const num = numId === undefined ? undefined : defs.nums.get(numId);
    if (!num) continue;
    const directLevel = numPr && val(numPr, 'ilvl');
    const ilvl = Math.min(
      directLevel === undefined ? (inherited.ilvl ?? 0) : Number(directLevel),
      8,
    );
    const levels = defs.abstracts.get(num.abstractId)!;
    const levelOf = (i: number) => num.levels.get(i) ?? levels.get(i);
    const startOf = (i: number) => num.starts.get(i) ?? levelOf(i)?.start ?? 1;
    const level = levelOf(ilvl);
    // A bullet level reads fine as a list item: leave it to Mammoth.
    if (!level || level.format === 'bullet') continue;

    const key = defs.links.get(num.abstractId) ?? num.abstractId;
    let count = counters.get(key);
    if (!count) counters.set(key, (count = []));
    const previous = count[ilvl];
    const override = num.starts.get(ilvl) ?? num.levels.get(ilvl)?.start;
    if (override !== undefined && !restarted.has(`${numId}:${ilvl}`)) {
      restarted.add(`${numId}:${ilvl}`);
      count[ilvl] = override;
    } else {
      count[ilvl] =
        previous === undefined ? (levelOf(ilvl)?.start ?? 1) : previous + 1;
    }
    for (let deeper = ilvl + 1; deeper < count.length; deeper++) {
      const restart = levelOf(deeper)?.restart;
      if (restart === undefined || (restart > 0 && ilvl < restart)) {
        count[deeper] = undefined;
      }
    }

    // An ordinary list stays a list. An item whose number isn't 1 gets a
    // marker with the number, so a list Mammoth restarts after a paragraph,
    // table, or another list's item can continue from where Word's does. A
    // heading isn't a list item to Mammoth, so it gets its number as text,
    // as every paragraph of a compound list does.
    const heading = defs.styles.get(styleId ?? '')?.heading ?? false;
    if (!compound.has(num.abstractId) && !heading) {
      if (level.format === 'none' || count[ilvl] === 1) continue;
      out += `${xml.slice(from, end)}<w:r><w:t>${token}${count[ilvl]}Z</w:t></w:r>`;
      from = end;
      changed = true;
      continue;
    }

    const label = level.text.replace(/%(\d)/g, (_, k: string) => {
      const i = Number(k) - 1;
      const n = count[i] ?? startOf(i);
      const format = level.legal ? 'decimal' : (levelOf(i)?.format ?? '');
      return formatNumber(n, format);
    });
    out += xml.slice(from, pPrStart) + withoutNumbering(pPr);
    if (label) {
      out += `<w:r><w:t xml:space="preserve">${escapeXml(label + level.suffix)}</w:t></w:r>`;
    }
    from = end;
    changed = true;
  }
  return changed ? out + xml.slice(from) : undefined;
}

// The parts of a .docx whose body paragraphs share list numbering.
const DOCUMENT_PART = /^word\/document\d*\.xml$/;

/**
 * Writes Word's list numbers into the .docx, in place in `zip`: as text for
 * each paragraph of a compound-numbered list (see the top of this file), and
 * as a `<token><n>Z` marker for each item of an ordinary numbered list that
 * Word numbers other than 1, for applyListStarts to turn into a list's
 * `start` and remove. `token` is undefined when no marker was written.
 */
export async function labelNumbering(
  zip: JSZip,
): Promise<{ changed: boolean; token?: string }> {
  const numberingXml = await zip.file('word/numbering.xml')?.async('string');
  if (!numberingXml) return { changed: false };
  const stylesXml = (await zip.file('word/styles.xml')?.async('string')) ?? '';
  const defs = readDefinitions(numberingXml, stylesXml);
  const compound = new Set(
    [...defs.abstracts]
      .filter(([, levels]) => isCompound(levels))
      .map(([id]) => id),
  );
  const parts: [string, string][] = [];
  for (const name of Object.keys(zip.files)) {
    if (DOCUMENT_PART.test(name)) {
      parts.push([name, await zip.file(name)!.async('string')]);
    }
  }
  // Plain letters and digits, so nothing escapes or reflows it, and not
  // already in the document.
  let token = 'WTMLI';
  while (parts.some(([, xml]) => xml.includes(token))) token += 'Q';
  let changed = false;
  let marked = false;
  for (const [name, xml] of parts) {
    const rewritten = labelParagraphs(xml, defs, compound, token);
    if (rewritten === undefined) continue;
    zip.file(name, rewritten);
    changed = true;
    marked ||= rewritten.includes(token);
  }
  return { changed, token: marked ? token : undefined };
}

/**
 * Removes the markers labelNumbering wrote from Mammoth's HTML, and gives
 * each `<ol>` whose first item had one a `start` of that number.
 */
export function applyListStarts(root: Element, token: string): void {
  const marker = new RegExp(`${token}(\\d+)Z`, 'g');
  const stack: Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.nodeType !== 3) {
      // One push per child: spreading a long document's children into a
      // single push() call overflows the call stack.
      for (const child of Array.from(node.childNodes)) stack.push(child);
      continue;
    }
    const text = node as Text;
    if (!text.data.includes(token)) continue;
    const number = text.data.match(marker)?.[0].slice(token.length, -1);
    text.data = text.data.replace(marker, '');
    let item = text.parentNode;
    while (item && item.nodeName !== 'LI') item = item.parentNode;
    const list = item?.parentNode as Element | null;
    if (
      number &&
      list?.nodeName === 'OL' &&
      list.firstElementChild === item &&
      !list.hasAttribute('start')
    ) {
      list.setAttribute('start', number);
    }
  }
}
