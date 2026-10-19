// Markdown twin of each page: /index.md for the home page, /privacy.md and
// /terms.md for the legal pages. The Worker serves the same file for
// `Accept: text/markdown` on the HTML URL (worker/index.js), and Layout.astro
// advertises it with <link rel="alternate" type="text/markdown">.
import type { APIRoute, GetStaticPaths } from 'astro';
import { agentPages } from '../agent/markdown';

export const getStaticPaths = (async () => {
  const pages = await agentPages(new URL(import.meta.env.SITE));
  return pages.map((page) => ({
    params: { page: page.slug },
    props: { markdown: page.markdown },
  }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) =>
  new Response(props.markdown as string, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
