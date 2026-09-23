// Content collections. The English-only legal pages (/privacy/, /terms/) live
// in web/content/legal as Markdown; the schema makes a missing or empty
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

export const collections = { legal };
