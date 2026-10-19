// Local MCP server (`w2m mcp`): exposes the converter to AI agents over stdio,
// so an agent can turn a .docx on this machine into Markdown without a
// browser. Like the website, nothing leaves the machine: the server reads
// the file from disk and converts it in-process.
//
// The CLI loads this module only for the `mcp` subcommand (a dynamic
// import), so library users and plain conversions never load the MCP SDK.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { convertWithWarnings } from './main.js';

const INSTRUCTIONS =
  'Converts Word (.docx) files on this machine to clean, GitHub-flavored ' +
  'Markdown. Pass an absolute path. Images are dropped by default, since ' +
  'base64 images would flood the context; set image_dir to extract them to ' +
  'files instead. Set output_path to write the Markdown to a file rather ' +
  'than returning it.';

function createMcpServer(version: string): McpServer {
  const server = new McpServer(
    { name: 'word-to-markdown', version },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    'convert_docx_to_markdown',
    {
      title: 'Convert Word to Markdown',
      description:
        'Convert a Word (.docx) file to GitHub-flavored Markdown. Returns the ' +
        'Markdown plus any document warnings (encryption, sensitivity labels, ' +
        'content that could not be converted). Only .docx is supported; ' +
        're-save older .doc files as .docx first.',
      inputSchema: {
        path: z
          .string()
          .describe(
            'Path to the .docx file. Relative paths resolve against the ' +
              "server's working directory, so prefer an absolute path.",
          ),
        output_path: z
          .string()
          .optional()
          .describe(
            'Write the Markdown to this file instead of returning it. Useful ' +
              'for long documents.',
          ),
        image_dir: z
          .string()
          .optional()
          .describe(
            'Extract images into this directory and link them from the ' +
              'Markdown. Relative to output_path when set, else to the .docx. ' +
              'Omit to drop images.',
          ),
        bullet_lists: z
          .boolean()
          .optional()
          .describe('Turn numbered lists into bullets.'),
        preserve_footnotes: z
          .boolean()
          .optional()
          .describe(
            'Keep footnotes as raw <sup> links instead of GFM [^1] footnotes.',
          ),
      },
      outputSchema: {
        markdown: z
          .string()
          .optional()
          .describe('The Markdown, unless output_path was set.'),
        output_path: z.string().optional(),
        images_written: z.number().optional(),
        warnings: z.array(z.string()),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const input = path.resolve(args.path);
        const output = args.output_path && path.resolve(args.output_path);
        const result = await convertWithWarnings(input, {
          images: args.image_dir ? 'extract' : 'strip',
          imageDir: args.image_dir,
          numberedLists: args.bullet_lists ? 'bullets' : 'ordered',
          footnotes: args.preserve_footnotes ? 'preserve' : 'gfm',
        });

        // Image links are relative to the Markdown, so write images next to
        // wherever the Markdown lives: output_path's folder, else the .docx's.
        const markdownDir = path.dirname(output || input);
        for (const image of result.images ?? []) {
          const target = path.resolve(markdownDir, image.path);
          await mkdir(path.dirname(target), { recursive: true });
          await writeFile(target, image.bytes);
        }

        const structured = {
          warnings: result.warnings,
          ...(result.images && { images_written: result.images.length }),
        };
        if (output) {
          await mkdir(path.dirname(output), { recursive: true });
          await writeFile(output, `${result.markdown}\n`);
          const summary = { ...structured, output_path: output };
          return {
            content: [{ type: 'text', text: JSON.stringify(summary) }],
            structuredContent: summary,
          };
        }
        const notes = result.warnings.map((w) => `Warning: ${w}`).join('\n');
        return {
          content: [
            { type: 'text', text: result.markdown },
            ...(notes ? [{ type: 'text' as const, text: notes }] : []),
          ],
          structuredContent: { ...structured, markdown: result.markdown },
        };
      } catch (error) {
        // The converter's typed errors carry messages meant for people
        // ("not a .docx", "file not found"), which suit an agent too.
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: error instanceof Error ? error.message : String(error),
            },
          ],
        };
      }
    },
  );

  return server;
}

export async function startMcpServer(version: string): Promise<void> {
  await createMcpServer(version).connect(new StdioServerTransport());
}
