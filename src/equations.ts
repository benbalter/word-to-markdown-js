import JSZip from 'jszip';

// Word equations (Office Math, OMML) as LaTeX. Mammoth drops <m:oMath> and
// <m:oMathPara> with an "unrecognised element" warning, so before it reads the
// .docx each equation is converted here and swapped for a plain-text
// placeholder run. Once the rest of the pipeline is done (so Turndown doesn't
// escape the LaTeX), restoreEquations() puts the math back as `$…$`, or as a
// `$$…$$` block when the equation is alone on its line, where Word displays
// it too.

const MATH_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const ENTITIES: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (entity, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }
    return ENTITIES[body] ?? entity;
  });
}

// A minimal XML reader for one equation's markup. The math prefix is stripped
// from element and attribute names (`m:sSup` → `sSup`, `m:val` → `val`); other
// prefixes (`w:rPr`, `w:t`) are kept so they never collide with math names.
function parseXml(xml: string, prefix: string): XmlNode {
  const root: XmlNode = { name: '', attrs: {}, children: [], text: '' };
  const stack = [root];
  const localName = (name: string) =>
    name.startsWith(`${prefix}:`) ? name.slice(prefix.length + 1) : name;
  const token = /<(\/?)([\w.:-]+)([^>]*?)(\/?)>|<[!?][^>]*>|([^<]+)/g;
  for (const match of xml.matchAll(token)) {
    const [, closing, name, attrText, selfClosing, text] = match;
    const parent = stack[stack.length - 1];
    if (text !== undefined) {
      parent.text += decodeEntities(text);
    } else if (!name) {
      continue;
    } else if (closing) {
      if (stack.length > 1) stack.pop();
    } else {
      const attrs: Record<string, string> = {};
      for (const [, attr, value] of attrText.matchAll(
        /([\w.:-]+)\s*=\s*"([^"]*)"/g,
      )) {
        attrs[localName(attr)] = decodeEntities(value);
      }
      const node: XmlNode = {
        name: localName(name),
        attrs,
        children: [],
        text: '',
      };
      parent.children.push(node);
      if (!selfClosing) stack.push(node);
    }
  }
  return root;
}

const child = (node: XmlNode | undefined, name: string) =>
  node?.children.find((c) => c.name === name);

// The `m:val` of a property such as <m:chr m:val="∑"/> under node's <…Pr>.
function prop(node: XmlNode, pr: string, name: string): string | undefined {
  return child(child(node, pr), name)?.attrs.val;
}

const isOn = (value: string | undefined) =>
  value !== undefined && value !== '0' && value !== 'off' && value !== 'false';

// Unicode characters Word writes in <m:t> → LaTeX. Commands end in a space so
// a following letter doesn't run into them; tidy() drops the extra spaces.
const SYMBOLS: Record<string, string> = {
  α: '\\alpha ',
  β: '\\beta ',
  γ: '\\gamma ',
  δ: '\\delta ',
  ε: '\\epsilon ',
  ϵ: '\\epsilon ',
  ζ: '\\zeta ',
  η: '\\eta ',
  θ: '\\theta ',
  ϑ: '\\vartheta ',
  ι: '\\iota ',
  κ: '\\kappa ',
  λ: '\\lambda ',
  μ: '\\mu ',
  ν: '\\nu ',
  ξ: '\\xi ',
  π: '\\pi ',
  ϖ: '\\varpi ',
  ρ: '\\rho ',
  ϱ: '\\varrho ',
  σ: '\\sigma ',
  ς: '\\varsigma ',
  τ: '\\tau ',
  υ: '\\upsilon ',
  φ: '\\varphi ',
  ϕ: '\\phi ',
  χ: '\\chi ',
  ψ: '\\psi ',
  ω: '\\omega ',
  Γ: '\\Gamma ',
  Δ: '\\Delta ',
  Θ: '\\Theta ',
  Λ: '\\Lambda ',
  Ξ: '\\Xi ',
  Π: '\\Pi ',
  Σ: '\\Sigma ',
  Υ: '\\Upsilon ',
  Φ: '\\Phi ',
  Ψ: '\\Psi ',
  Ω: '\\Omega ',
  '×': '\\times ',
  '÷': '\\div ',
  '±': '\\pm ',
  '∓': '\\mp ',
  '·': '\\cdot ',
  '⋅': '\\cdot ',
  '∙': '\\cdot ',
  '∗': '\\ast ',
  '∘': '\\circ ',
  '−': '-',
  '≤': '\\le ',
  '≥': '\\ge ',
  '≠': '\\ne ',
  '≈': '\\approx ',
  '≡': '\\equiv ',
  '∼': '\\sim ',
  '≅': '\\cong ',
  '≃': '\\simeq ',
  '∝': '\\propto ',
  '≪': '\\ll ',
  '≫': '\\gg ',
  '∞': '\\infty ',
  '∂': '\\partial ',
  '∇': '\\nabla ',
  '∈': '\\in ',
  '∉': '\\notin ',
  '∋': '\\ni ',
  '⊂': '\\subset ',
  '⊆': '\\subseteq ',
  '⊃': '\\supset ',
  '⊇': '\\supseteq ',
  '∪': '\\cup ',
  '∩': '\\cap ',
  '∅': '\\emptyset ',
  '∀': '\\forall ',
  '∃': '\\exists ',
  '¬': '\\neg ',
  '∧': '\\wedge ',
  '∨': '\\vee ',
  '⊕': '\\oplus ',
  '⊗': '\\otimes ',
  '⊥': '\\perp ',
  '∥': '\\parallel ',
  '→': '\\to ',
  '←': '\\leftarrow ',
  '↔': '\\leftrightarrow ',
  '⇒': '\\Rightarrow ',
  '⇐': '\\Leftarrow ',
  '⇔': '\\Leftrightarrow ',
  '↦': '\\mapsto ',
  '…': '\\ldots ',
  '⋯': '\\cdots ',
  '⋮': '\\vdots ',
  '⋱': '\\ddots ',
  '′': "'",
  '″': "''",
  '°': '^{\\circ}',
  ℝ: '\\mathbb{R}',
  ℕ: '\\mathbb{N}',
  ℤ: '\\mathbb{Z}',
  ℚ: '\\mathbb{Q}',
  ℂ: '\\mathbb{C}',
  ℏ: '\\hbar ',
  ℓ: '\\ell ',
  '√': '\\surd ',
  '⟨': '\\langle ',
  '⟩': '\\rangle ',
  // LaTeX and Markdown specials. `|` never appears in the output, so an
  // equation can't split a GFM table cell, and `<`/`>` can't read as HTML.
  '\\': '\\backslash ',
  '{': '\\{',
  '}': '\\}',
  '#': '\\#',
  '%': '\\%',
  $: '\\$',
  _: '\\_',
  '&': '\\&',
  '^': '\\wedge ',
  '~': '\\sim ',
  '|': '\\vert ',
  '‖': '\\Vert ',
  '<': '\\lt ',
  '>': '\\gt ',
};

const FUNCTIONS = new Set(
  'sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh coth log ln lg exp lim liminf limsup max min sup inf det gcd deg dim ker arg hom Pr'.split(
    ' ',
  ),
);

function symbols(text: string): string {
  return Array.from(text, (ch) => SYMBOLS[ch] ?? ch).join('');
}

// Text for \text{…}: only braces, backslashes, and the Markdown-sensitive
// characters need care.
function textMode(text: string): string {
  return text.replace(/[\\{}$|<>]/g, (ch) => SYMBOLS[ch] ?? ch);
}

function runText(node: XmlNode): string {
  return node.children
    .filter((c) => c.name === 't' || c.name === 'w:t')
    .map((c) => c.text)
    .join('');
}

function convertRun(node: XmlNode, inFunctionName: boolean): string {
  const text = runText(node);
  if (!text) return '';
  const rPr = child(node, 'rPr');
  if (child(rPr, 'nor')) return `\\text{${textMode(text)}}`;
  const word = text.trim();
  if (FUNCTIONS.has(word)) return `\\${word} `;
  if (inFunctionName && /^[A-Za-z]+$/.test(word)) {
    return `\\operatorname{${word}}`;
  }
  if (child(rPr, 'sty')?.attrs.val === 'p' && /^[A-Za-z]{2,}$/.test(word)) {
    return `\\mathrm{${word}}`;
  }
  return symbols(text);
}

const NARY: Record<string, string> = {
  '∑': '\\sum',
  '∏': '\\prod',
  '∐': '\\coprod',
  '∫': '\\int',
  '∬': '\\iint',
  '∭': '\\iiint',
  '∮': '\\oint',
  '⋃': '\\bigcup',
  '⋂': '\\bigcap',
  '⋁': '\\bigvee',
  '⋀': '\\bigwedge',
  '⨁': '\\bigoplus',
  '⨂': '\\bigotimes',
};

const ACCENTS: Record<string, string> = {
  '\u0300': '\\grave',
  '\u0301': '\\acute',
  '\u0302': '\\hat',
  '\u0303': '\\tilde',
  '\u0304': '\\bar',
  '\u0305': '\\bar',
  '\u0306': '\\breve',
  '\u0307': '\\dot',
  '\u0308': '\\ddot',
  '\u030c': '\\check',
  '\u20d7': '\\vec',
};

const DELIMITERS: Record<string, string> = {
  '': '.',
  '(': '(',
  ')': ')',
  '[': '[',
  ']': ']',
  '{': '\\{',
  '}': '\\}',
  '|': '\\vert',
  '‖': '\\Vert',
  '⟨': '\\langle',
  '〈': '\\langle',
  '⟩': '\\rangle',
  '〉': '\\rangle',
  '⌊': '\\lfloor',
  '⌋': '\\rfloor',
  '⌈': '\\lceil',
  '⌉': '\\rceil',
};

const delimiter = (ch: string) => DELIMITERS[ch] ?? (symbols(ch).trim() || '.');

// A superscript, subscript, or limit: braces unless it's one character.
const script = (latex: string) =>
  /^[A-Za-z0-9]$/.test(latex) ? latex : `{${latex}}`;

// Whether `latex` is one group from its first character to its last: a
// `{…}` or a `\left…\right…` pair.
function isGroup(latex: string): boolean {
  const left = /^\\left(?![A-Za-z])/;
  const right = /^\\right(?![A-Za-z])/;
  if (!latex.startsWith('{') && !left.test(latex)) return false;
  let depth = 0;
  for (let i = 0; i < latex.length; i++) {
    const rest = latex.slice(i);
    if (left.test(rest)) {
      depth++;
      i += 4;
    } else if (right.test(rest)) {
      if (--depth === 0) return /^\\right(?:\\[A-Za-z]+|\\?\S)$/.test(rest);
      i += 5;
    } else if (latex[i] === '\\') {
      i++;
    } else if (latex[i] === '{') {
      depth++;
    } else if (latex[i] === '}' && --depth === 0) {
      return i === latex.length - 1;
    }
  }
  return false;
}

// A base that a script attaches to: braced unless it's one symbol, one
// command, or already a group, so `{a+b}^2` doesn't become `a+b^2`.
function base(latex: string): string {
  const trimmed = latex.trim();
  if (/^(?:[A-Za-z0-9]|\\[A-Za-z]+)$/.test(trimmed) || isGroup(trimmed)) {
    return trimmed;
  }
  return `{${trimmed}}`;
}

function convertChildren(node: XmlNode | undefined, ctx: Context): string {
  if (!node) return '';
  return node.children.map((c) => convertNode(c, ctx)).join('');
}

interface Context {
  inFunctionName: boolean;
  inEquationArray: boolean;
}

function arg(node: XmlNode, name: string, ctx: Context): string {
  return tidy(convertChildren(child(node, name), ctx));
}

function convertNode(node: XmlNode, ctx: Context): string {
  switch (node.name) {
    case 'r':
    case 'w:r': {
      const text = convertRun(node, ctx.inFunctionName);
      return ctx.inEquationArray ? text.replace(/\\&/g, '&') : text;
    }
    case 'f': {
      const num = arg(node, 'num', ctx);
      const den = arg(node, 'den', ctx);
      const type = prop(node, 'fPr', 'type');
      if (type === 'lin' || type === 'skw') return `${base(num)}/${base(den)}`;
      if (type === 'noBar') return `\\genfrac{}{}{0pt}{}{${num}}{${den}}`;
      return `\\frac{${num}}{${den}}`;
    }
    case 'sSup': {
      // Word writes f′ as a superscript prime; LaTeX's ' is already one.
      const sup = arg(node, 'sup', ctx);
      const e = base(arg(node, 'e', ctx));
      return /^'+$/.test(sup) ? `${e}${sup}` : `${e}^${script(sup)}`;
    }
    case 'sSub':
      return `${base(arg(node, 'e', ctx))}_${script(arg(node, 'sub', ctx))}`;
    case 'sSubSup':
      return `${base(arg(node, 'e', ctx))}_${script(arg(node, 'sub', ctx))}^${script(arg(node, 'sup', ctx))}`;
    case 'sPre':
      return `{}_${script(arg(node, 'sub', ctx))}^${script(arg(node, 'sup', ctx))}${arg(node, 'e', ctx)}`;
    case 'rad': {
      const degree = arg(node, 'deg', ctx);
      const e = arg(node, 'e', ctx);
      return isOn(prop(node, 'radPr', 'degHide')) || !degree
        ? `\\sqrt{${e}}`
        : `\\sqrt[${degree}]{${e}}`;
    }
    case 'nary': {
      const chr = prop(node, 'naryPr', 'chr') ?? '∫';
      let latex = NARY[chr] ?? symbols(chr).trim();
      const sub = arg(node, 'sub', ctx);
      const sup = arg(node, 'sup', ctx);
      if (sub && !isOn(prop(node, 'naryPr', 'subHide'))) {
        latex += `_${script(sub)}`;
      }
      if (sup && !isOn(prop(node, 'naryPr', 'supHide'))) {
        latex += `^${script(sup)}`;
      }
      return `${latex} ${arg(node, 'e', ctx)}`;
    }
    case 'd': {
      const begin = prop(node, 'dPr', 'begChr') ?? '(';
      const end = prop(node, 'dPr', 'endChr') ?? ')';
      const separator = delimiter(prop(node, 'dPr', 'sepChr') ?? '|');
      const parts = node.children
        .filter((c) => c.name === 'e')
        .map((c) => tidy(convertChildren(c, ctx)));
      const inner = parts.join(
        separator === '.' ? ',' : ` \\mathrel{${separator}} `,
      );
      return `\\left${delimiter(begin)} ${inner}\\right${delimiter(end)} `;
    }
    case 'func': {
      const name = tidy(
        convertChildren(child(node, 'fName'), { ...ctx, inFunctionName: true }),
      );
      return `${name}{${arg(node, 'e', ctx)}}`;
    }
    case 'limLow': {
      const e = arg(node, 'e', ctx);
      const lim = arg(node, 'lim', ctx);
      return /^\\(?:lim|liminf|limsup|max|min|sup|inf|operatorname\{[^}]*\})$/.test(
        e,
      )
        ? `${e}_${script(lim)}`
        : `\\underset{${lim}}{${e}}`;
    }
    case 'limUpp':
      return `\\overset{${arg(node, 'lim', ctx)}}{${arg(node, 'e', ctx)}}`;
    case 'acc': {
      const chr = prop(node, 'accPr', 'chr') ?? '\u0302';
      return `${ACCENTS[chr] ?? '\\hat'}{${arg(node, 'e', ctx)}}`;
    }
    case 'bar': {
      const top = prop(node, 'barPr', 'pos') === 'top';
      return `${top ? '\\overline' : '\\underline'}{${arg(node, 'e', ctx)}}`;
    }
    case 'groupChr': {
      const chr = prop(node, 'groupChrPr', 'chr') ?? '\u23df';
      const top = prop(node, 'groupChrPr', 'pos') === 'top';
      const e = arg(node, 'e', ctx);
      if (chr === '\u23df') return `\\underbrace{${e}}`;
      if (chr === '\u23de') return `\\overbrace{${e}}`;
      const mark = symbols(chr).trim();
      return top ? `\\overset{${mark}}{${e}}` : `\\underset{${mark}}{${e}}`;
    }
    case 'borderBox':
      return `\\boxed{${arg(node, 'e', ctx)}}`;
    case 'm': {
      const rows = node.children
        .filter((c) => c.name === 'mr')
        .map((row) =>
          row.children
            .filter((c) => c.name === 'e')
            .map((c) => tidy(convertChildren(c, ctx)))
            .join(' & '),
        );
      return `\\begin{matrix}${rows.join(' \\\\ ')}\\end{matrix}`;
    }
    case 'eqArr': {
      const rows = node.children
        .filter((c) => c.name === 'e')
        .map((c) =>
          tidy(convertChildren(c, { ...ctx, inEquationArray: true })),
        );
      const env = rows.some((row) => /(?<!\\)&/.test(row))
        ? 'aligned'
        : 'gathered';
      return `\\begin{${env}}${rows.join(' \\\\ ')}\\end{${env}}`;
    }
    case 'oMath':
      return tidy(convertChildren(node, ctx));
    default:
      // Properties (`…Pr`, `ctrlPr`) carry no content; anything else (box,
      // phant, e, …) is a plain container.
      if (/Pr$/.test(node.name) || node.name.startsWith('w:')) return '';
      return convertChildren(node, ctx);
  }
}

// Collapse the spaces commands leave behind where they don't separate a
// command from a following letter.
function tidy(latex: string): string {
  return latex
    .replace(/\s+/g, ' ')
    .replace(/ (?=[}^_)\],]|\\right|$)/g, '')
    .replace(/(?<=[{([]|^) /g, '')
    .trim();
}

/** @internal Converts one <m:oMath> or <m:oMathPara> element to LaTeX. */
export function ommlToLatex(xml: string, prefix = 'm'): string {
  const root = parseXml(xml, prefix);
  const ctx: Context = { inFunctionName: false, inEquationArray: false };
  const element = root.children[0];
  if (!element) return '';
  if (element.name === 'oMathPara') {
    const lines = element.children
      .filter((c) => c.name === 'oMath')
      .map((c) => convertNode(c, ctx))
      .filter(Boolean);
    return lines.length > 1
      ? `\\begin{gathered}${lines.join(' \\\\ ')}\\end{gathered}`
      : (lines[0] ?? '');
  }
  return convertNode(element, ctx);
}

// The parts of a .docx whose paragraphs mammoth reads.
const PART = /^word\/(?:document\d*|footnotes|endnotes|comments)\.xml$/;

// End of an element starting at `start` (whose name is `name`), or -1.
function elementEnd(xml: string, start: number, name: string): number {
  const openEnd = xml.indexOf('>', start);
  if (openEnd === -1) return -1;
  if (xml[openEnd - 1] === '/') return openEnd + 1;
  const close = xml.indexOf(`</${name}>`, openEnd);
  return close === -1 ? -1 : close + name.length + 3;
}

// Whether the equation at xml[start, end) is all its paragraph holds, which
// Word displays on its own line. A paragraph with text, a break, a tab, an
// image, or another equation keeps the equation inline.
function isAloneInParagraph(xml: string, start: number, end: number): boolean {
  const before = xml.slice(0, start);
  const open = Math.max(
    before.lastIndexOf('<w:p>'),
    before.lastIndexOf('<w:p '),
  );
  if (open === -1 || before.indexOf('</w:p>', open) !== -1) return false;
  const close = xml.indexOf('</w:p>', end);
  if (close === -1) return false;
  const rest = (xml.slice(open, start) + xml.slice(end, close))
    .replace(/<w:pPr>[\s\S]*?<\/w:pPr>/g, '')
    .replace(/<w:t(?:\s[^>]*)?>\s*<\/w:t>/g, '');
  return !/<w:(?:t|br|cr|tab|drawing|pict|object|sym)[\s/>]|:oMath[\s/>]/.test(
    rest,
  );
}

// Replace each equation in one XML part with a placeholder run: `<token><id>D`
// for a display equation, `<token><id>X` for an inline one.
function replaceEquations(
  xml: string,
  prefix: string,
  token: string,
  equations: string[],
): string {
  const para = `${prefix}:oMathPara`;
  const inline = `${prefix}:oMath`;
  let out = '';
  let from = 0;
  for (;;) {
    const start = xml.indexOf(`<${inline}`, from);
    if (start === -1) break;
    const after = xml[start + inline.length + 1];
    const isPara = xml.startsWith(`<${para}`, start);
    const nextChar = isPara ? xml[start + para.length + 1] : after;
    if (!/[\s/>]/.test(nextChar ?? '')) {
      out += xml.slice(from, start + 1);
      from = start + 1;
      continue;
    }
    const end = elementEnd(xml, start, isPara ? para : inline);
    if (end === -1) break;
    const latex = ommlToLatex(xml.slice(start, end), prefix);
    const id = equations.push(latex) - 1;
    const kind = isPara || isAloneInParagraph(xml, start, end) ? 'D' : 'X';
    out += `${xml.slice(from, start)}<w:r><w:t>${token}${id}${kind}</w:t></w:r>`;
    from = end;
  }
  return out + xml.slice(from);
}

// A placeholder that's plain letters and digits (so no stage of the pipeline
// escapes or reflows it) and doesn't already occur in the document.
function pickToken(texts: string[]): string {
  let token = 'WTMEQ';
  while (texts.some((text) => text.includes(token))) token += 'Q';
  return token;
}

/**
 * Rewrites a .docx so each equation is a placeholder mammoth keeps. Returns
 * the original bytes untouched when the document has no equations.
 */
export async function extractEquations(bytes: ArrayBuffer): Promise<{
  bytes: ArrayBuffer;
  token: string;
  equations: string[];
}> {
  // An unreadable .docx is mammoth's to report, with the error it always has.
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    return { bytes, token: '', equations: [] };
  }
  const parts: [string, string, string][] = [];
  // Every part mammoth reads, with or without math, so the placeholder can't
  // match text in a footnote or comment that has no equations.
  const texts: string[] = [];
  for (const name of Object.keys(zip.files)) {
    if (!PART.test(name)) continue;
    const xml = await zip.file(name)!.async('string');
    texts.push(xml);
    const prefix = xml.match(
      new RegExp(`xmlns:([\\w.-]+)="${MATH_NS.replace(/[./]/g, '\\$&')}"`),
    )?.[1];
    if (prefix && xml.includes(`<${prefix}:oMath`)) {
      parts.push([name, xml, prefix]);
    }
  }
  const equations: string[] = [];
  const token = pickToken(texts);
  if (parts.length === 0) return { bytes, token, equations };
  for (const [name, xml, prefix] of parts) {
    zip.file(name, replaceEquations(xml, prefix, token, equations));
  }
  return {
    bytes: await zip.generateAsync({ type: 'arraybuffer' }),
    token,
    equations,
  };
}

/**
 * Puts each equation back as inline `$…$`, for text that can't hold a block
 * (a heading's slug, say).
 */
export function restoreInlineEquations(
  text: string,
  token: string,
  equations: string[],
): string {
  if (equations.length === 0) return text;
  return text.replace(
    new RegExp(`${token}(\\d+)[XD]`, 'g'),
    (match, id: string) => {
      const latex = equations[Number(id)];
      if (latex === undefined) return match;
      return latex ? `$${latex}$` : '';
    },
  );
}

/**
 * Puts the LaTeX back in place of each placeholder: a display equation that
 * Markdown leaves alone on its line becomes a `$$` block; any other equation,
 * or a display one in a table cell, list item, or heading, is inline `$…$`.
 */
export function restoreEquations(
  markdown: string,
  token: string,
  equations: string[],
): string {
  if (equations.length === 0) return markdown;
  const alone = new RegExp(`^${token}(\\d+)D$`);
  return markdown
    .split('\n')
    .map((line) => {
      const display = equations[Number(line.match(alone)?.[1])];
      if (display) return `$$\n${display}\n$$`;
      return restoreInlineEquations(line, token, equations);
    })
    .join('\n');
}
