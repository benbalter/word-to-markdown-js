// /llms.txt — the index for AI agents (https://llmstxt.org), generated from
// the same sources as the pages (see web/agent/markdown.ts).
import type { APIRoute } from 'astro';
import { llmsTxt } from '../agent/markdown';

export const GET: APIRoute = async ({ site }) =>
  new Response(await llmsTxt(site!), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
