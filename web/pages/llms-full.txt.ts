// /llms-full.txt — every page's Markdown in one file (see web/agent/markdown.ts).
import type { APIRoute } from 'astro';
import { llmsFullTxt } from '../agent/markdown';

export const GET: APIRoute = async ({ site }) =>
  new Response(await llmsFullTxt(site!), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
