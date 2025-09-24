import TurndownService from '@joplin/turndown';
import * as turndownPluginGfm from '@joplin/turndown-plugin-gfm';
import * as mammoth from 'mammoth';
import markdownlint from 'markdownlint';
import markdownlintRuleHelpers from 'markdownlint-rule-helpers';
import { parse } from 'node-html-parser';

interface convertOptions {
  mammoth?: object;
  turndown?: object;
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
    '&rdquo;': '\u201D'
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
    firstRow.querySelectorAll('td').forEach((cell) => {
      cell.tagName = 'th';
    });
  });
  return root.toString();
}

// Convert HTML to GitHub-flavored Markdown
export function htmlToMd(html: string, options: object = {}): string {
  // Decode HTML entities before conversion
  const decodedHtml = decodeHtmlEntities(html);
  
  const turndownService = new TurndownService({
    ...options,
    ...defaultTurndownOptions,
  });
  turndownService.use(turndownPluginGfm.gfm);
  return turndownService.turndown(decodedHtml).trim();
}

// Lint the Markdown and correct any issues
function lint(md: string): string {
  const lintResult = markdownlint.sync({ strings: { md } });
  return markdownlintRuleHelpers.applyFixes(md, lintResult['md']).trim();
}

// Converts a Word document to crisp, clean Markdown
export default async function convert(
  input: string | ArrayBuffer,
  options: convertOptions = {},
): Promise<string> {
  let inputObj: { path: string } | { arrayBuffer: ArrayBuffer };
  if (typeof input === 'string') {
    inputObj = { path: input };
  } else {
    inputObj = { arrayBuffer: input };
  }
  const mammothResult = await mammoth.convertToHtml(inputObj, options.mammoth);
  const html = autoTableHeaders(mammothResult.value);
  const md = htmlToMd(html, options.turndown);
  const cleanedMd = lint(md);
  return cleanedMd;
}
