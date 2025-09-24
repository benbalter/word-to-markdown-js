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
    if (firstRow) {
      firstRow.querySelectorAll('td').forEach((cell) => {
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
  const bulletRegex = new RegExp(`^\\s*[${unicodeBullets.map(b => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')}]\\s*`);
  
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
function htmlToMd(html: string, options: object = {}): string {
  const cleanedHtml = removeUnicodeBullets(html);
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
  const mdWithBullets = convertNumberedListsToBullets(md);
  const cleanedMd = lint(mdWithBullets);
  return cleanedMd;
}
