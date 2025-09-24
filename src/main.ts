import TurndownService from '@joplin/turndown';
import * as turndownPluginGfm from '@joplin/turndown-plugin-gfm';
import * as mammoth from 'mammoth';
import * as markdownlint from 'markdownlint/sync';
import { applyFixes } from 'markdownlint';
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
function htmlToMd(html: string, options: object = {}): string {
  const turndownService = new TurndownService({
    ...options,
    ...defaultTurndownOptions,
  });
  turndownService.use(turndownPluginGfm.gfm);
  return turndownService.turndown(html).trim();
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
    inputObj = { path: input };
  } else {
    inputObj = { arrayBuffer: input };
  }
  const mammothResult = await mammoth.convertToHtml(inputObj, options.mammoth);
  const html = autoTableHeaders(mammothResult.value);
  const md = htmlToMd(html, options.turndown);
  const mdWithoutNbsp = removeNonBreakingSpaces(md);
  const cleanedMd = lint(mdWithoutNbsp);
  return cleanedMd;
}
