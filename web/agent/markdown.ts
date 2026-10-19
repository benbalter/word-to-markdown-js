// Markdown for machines: the home page's Markdown twin, the legal pages'
// source Markdown, and the developer notes that llms.txt / llms-full.txt and
// the `.md` routes (web/pages/[page].md.ts) serve to crawlers and AI agents.
//
// Everything is built from the sources the HTML pages render — the English
// i18n dictionary and the `legal` content collection — so the Markdown can't
// drift from the site. English only: the localized home pages say the same
// thing, and agents read English fine.
import { getCollection } from 'astro:content';
import { useTranslations } from '../i18n';
import { conversionOutputs } from '../components/home/conversion-outputs';

const SITE_NAME = 'Word to Markdown';
const SOURCE_URL = 'https://github.com/benbalter/word-to-markdown-js';
const NPM_URL = 'https://www.npmjs.com/package/word-to-markdown';
const SIBLING_URL = 'https://md2word.app/';
const AUTHOR = { name: 'Ben Balter', url: 'https://ben.balter.com' };
// Links from machine-readable surfaces carry utm_medium=llms, so analytics
// can tell whether AI traffic reaches them.
const BOOK_URL =
  'https://open-and-async.com/?utm_source=word2md&utm_medium=llms&utm_campaign=agents';
const BOOK_MCP_URL = 'https://github.com/open-and-async/mcp';

export interface AgentPage {
  /** The HTML page's path, e.g. "/" or "/privacy/". */
  path: string;
  /** Route param for web/pages/[page].md.ts: "index" serves /index.md. */
  slug: string;
  title: string;
  description: string;
  markdown: string;
}

/** `/` → `/index.md`, `/privacy/` → `/privacy.md`. */
function markdownPath(page: Pick<AgentPage, 'slug'>): string {
  return `/${page.slug}.md`;
}

// A table cell holding literal Markdown: code-format it so it shows as
// syntax, and escape pipes, which end a GFM cell even inside backticks. A
// code span containing backticks needs a longer fence, padded with spaces
// when the text starts or ends with one (CommonMark §6.1).
function codeCell(text: string): string {
  const longestRun = Math.max(
    0,
    ...(text.match(/`+/g) ?? []).map((r) => r.length),
  );
  const fence = '`'.repeat(longestRun + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${text.replaceAll('|', '\\|')}${pad}${fence}`;
}

/**
 * llms.txt's quick start for agents. Deliberately brief: the full reference
 * is the /developers/ guide (web/content/guides/developers.md), linked here.
 */
function developerMarkdown(site: URL): string {
  return `## Use it from code or an agent

Agents and scripts can run the same converter on their own machine. Nothing is uploaded either way. Full reference: ${new URL('/developers.md', site).href}

- **MCP server (local):** \`claude mcp add word-to-markdown -- npx -y word-to-markdown mcp\`, or in any MCP client the command \`npx\` with args \`["-y", "word-to-markdown", "mcp"]\`. Its tool \`convert_docx_to_markdown\` takes a path to a .docx and returns Markdown and warnings.
- **Command line:** \`npx word-to-markdown report.docx > report.md\`
- **Node library:** \`convertWithWarnings('report.docx')\` from the [\`word-to-markdown\`](${NPM_URL}) package returns \`{ markdown, warnings }\`.
- **WebMCP:** in a browser with WebMCP, the converter page registers \`convert_docx_to_markdown\` (takes the .docx as base64) and \`get_converted_markdown\`.
`;
}

/** The home page as Markdown, from the same English strings it renders. */
function homeMarkdown(site: URL): string {
  const t = useTranslations('en');
  const steps = t.steps
    .map((s, i) => `${i + 1}. **${s.t}:** ${s.d}`)
    .join('\n');
  const rows = t.conversionRows
    .map((row, i) => `| ${row} | ${codeCell(conversionOutputs[i])} |`)
    .join('\n');
  const faqs = t.faqs.map((f) => `### ${f.q}\n\n${f.a}`).join('\n\n');
  return `# ${SITE_NAME}

> ${t.tagline}

${t.eyebrow}. Convert at ${site.href}

## How it works

${steps}

${t.googleDocHint}

## ${t.conversionHeading}

| ${t.conversionColElement} | ${t.conversionColOutput} |
| --- | --- |
${rows}

## ${t.reverseHeading}

${t.reverseBody} [${t.reverseCta}](${SIBLING_URL})

## ${t.cliHeading}

${t.cliBody} [${t.cliCta}](${new URL('/developers/', site).href})

## ${t.faqHeading}

${faqs}
`;
}

/** Every page with a Markdown twin, in llms.txt order. */
export async function agentPages(site: URL): Promise<AgentPage[]> {
  const t = useTranslations('en');
  const legal = await getCollection('legal');
  const guides = await getCollection('guides');
  // Both collections render the same way: their Markdown source is the twin.
  const fromEntry = (
    entry: (typeof legal)[number] | (typeof guides)[number],
  ) => ({
    path: `/${entry.id}/`,
    slug: entry.id,
    title: entry.data.title,
    description: entry.data.description,
    markdown: `${(entry.body ?? '').trim()}\n`,
  });
  return [
    {
      path: '/',
      slug: 'index',
      title: t.metaTitle,
      description: t.metaDescription,
      markdown: homeMarkdown(site),
    },
    ...guides.sort((a, b) => a.data.order - b.data.order).map(fromEntry),
    ...legal.sort((a, b) => a.id.localeCompare(b.id)).map(fromEntry),
  ];
}

/** llms.txt (https://llmstxt.org): a short index pointing at the Markdown. */
export async function llmsTxt(site: URL): Promise<string> {
  const t = useTranslations('en');
  const pages = await agentPages(site);
  const links = pages
    .map(
      (p) =>
        `- [${p.title}](${new URL(markdownPath(p), site).href}): ${p.description}`,
    )
    .join('\n');
  return `# ${SITE_NAME}

> ${t.metaDescription}

Word to Markdown runs entirely client-side: the web page converts documents in the browser and never sends them to a server. Every page has a Markdown version at the URLs below, also served for \`Accept: text/markdown\`. The full text of all of them is at ${new URL('/llms-full.txt', site).href}.

## Pages

${links}

${developerMarkdown(site)}
## Optional

- [Markdown to Word](${SIBLING_URL}): The sibling converter, Markdown to formatted Word (.docx), by the same maker.
- [Source code](${SOURCE_URL}): Open source on GitHub.
- Author: [${AUTHOR.name}](${AUTHOR.url})
- Also by the author: [Open and Async](${BOOK_URL}), a playbook for remote and distributed teams, drawing on more than a decade of remote-first lessons from GitHub.
- Related MCP server: [Open and Async MCP](${BOOK_MCP_URL}) (\`claude mcp add open-async -- npx -y @open-and-async/mcp\`) drafts decision docs, swaps planned meetings for async alternatives, and scores status updates.
`;
}

/** llms-full.txt: every page's Markdown, one after another. */
export async function llmsFullTxt(site: URL): Promise<string> {
  const pages = await agentPages(site);
  return pages
    .map((p) => `<!-- ${new URL(p.path, site).href} -->\n\n${p.markdown}`)
    .join('\n---\n\n');
}
