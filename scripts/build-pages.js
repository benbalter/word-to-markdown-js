#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// HTML template for the pages
const getHtmlTemplate = (title, content) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, shrink-to-fit=no"
    />
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">

    <title>Word to Markdown Converter</title>
    <meta property="og:title" content="Word to Markdown Converter" />
    <meta property="og:locale" content="en_US" />
    <meta
      name="description"
      content="Convert Word or Google documents to Markdown online"
    />
    <meta
      property="og:description"
      content="Convert Word or Google documents to Markdown online"
    />
    <link rel="canonical" href="https://word2md.com" />
    <meta property="og:url" content="https://word2md.com" />
    <meta property="og:site_name" content="Word to Markdown Converter" />
  </head>
  <body>
    <div class="container text-center mt-2">
      <h1 class="display-4">
        <a href="/" class="text-decoration-none text-body"
          >Word to Markdown Converter</a
        >
      </h1>

      <h1>${title}</h1>

      <div class="text-start">
        ${content}
      </div>

      <nav class="nav justify-content-center mt-2">
        <a
          href="https://github.com/benbalter/word-to-markdown-js/blob/master/CONTRIBUTING.md"
          class="nav-link"
          >Feedback</a
        >

        <a
          href="https://github.com/benbalter/word-to-markdown-js"
          class="nav-link"
          >Source</a
        >

        <a href="https://www.patreon.com/benbalter" class="nav-link">Donate</a>

        <a href="/terms/" class="nav-link">Terms</a>

        <a href="/privacy/" class="nav-link">Privacy</a>

        <a href="https://ben.balter.com" class="nav-link">@benbalter</a>
      </nav>
    </div>

    <script src="/main.js"></script>
    <script
      defer
      src="https://static.cloudflareinsights.com/beacon.min.js/vef91dfe02fce4ee0ad053f6de4f175db1715022073587"
      integrity="sha512-sDIX0kl85v1Cl5tu4WGLZCpH/dV9OHbA4YlKCuCiMmOQIk4buzoYDZSFj+TvC71mOBLh8CDC/REgE0GX0xcbjA=="
      data-cf-beacon='{"rayId":"88f450304aa02d11","r":1,"version":"2024.4.1","token":"7ae006a18c77456fa61aa7d04a3480d4"}'
      crossorigin="anonymous"
    ></script>
  </body>
</html>`;

async function convertMarkdownToHtml(markdownPath) {
  const markdown = await readFile(markdownPath, 'utf-8');
  
  // Remove the first H1 title if it exists, since it's already in the template
  const markdownWithoutTitle = markdown.replace(/^# .+\n\n?/, '');
  
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(markdownWithoutTitle);
    
  return String(result);
}

async function buildPage(pageName) {
  try {
    console.log(`Building ${pageName} page...`);
    
    const markdownPath = join(projectRoot, 'pages', `${pageName}.md`);
    const outputDir = join(projectRoot, 'dist', pageName);
    const outputPath = join(outputDir, 'index.html');
    
    // Convert markdown to HTML
    const content = await convertMarkdownToHtml(markdownPath);
    
    // Get the title from the page name
    const title = pageName === 'privacy' ? 'Your privacy' : 'Terms of Use';
    
    // Wrap in template
    const html = getHtmlTemplate(title, content);
    
    // Ensure output directory exists
    await mkdir(outputDir, { recursive: true });
    
    // Write the HTML file
    await writeFile(outputPath, html, 'utf-8');
    
    console.log(`✅ Built ${pageName} page: ${outputPath}`);
  } catch (error) {
    console.error(`❌ Error building ${pageName} page:`, error);
    process.exit(1);
  }
}

async function main() {
  console.log('Building pages from Markdown sources...');
  
  // Build both pages
  await buildPage('privacy');
  await buildPage('terms');
  
  console.log('✅ All pages built successfully!');
}

main().catch(console.error);