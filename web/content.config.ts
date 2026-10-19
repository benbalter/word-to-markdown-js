// Content collections. The English-only legal pages (/privacy/, /terms/) live
// in web/content/legal as Markdown, and the task pages in web/content/guides; the schema makes a missing or empty
// title/description a build error instead of a silently blank <head>.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const legal = defineCollection({
  loader: glob({ pattern: '*.md', base: './web/content/legal' }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
  }),
});

// English-only task pages (/google-docs-to-markdown/, /developers/, …):
// the same Markdown feeds the HTML page, its .md twin, and llms-full.txt.
// `order` sets their order in llms.txt and the footer.
const guides = defineCollection({
  loader: glob({ pattern: '*.md', base: './web/content/guides' }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    order: z.number(),
  }),
});

export const collections = { legal, guides };
