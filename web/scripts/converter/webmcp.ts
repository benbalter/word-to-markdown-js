// WebMCP tools: let an AI agent in the visitor's browser use the converter
// directly (https://webmachinelearning.github.io/webmcp/). The tools run in
// this page, through the same Web Worker as a drop, so nothing is uploaded
// any more than it is for a person. Browsers without WebMCP skip this.
//
// The spec moved the entry point from navigator.modelContext to
// document.modelContext, and both still ship, so detect either.

interface ToolResult {
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

interface ModelContextTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean };
  execute: (input: Record<string, unknown>) => Promise<ToolResult>;
}

interface ModelContext {
  registerTool(tool: ModelContextTool): unknown;
}

export interface WebMcpConverter {
  /** Convert a .docx and show the result on the page, as a drop would. */
  convert(
    fileName: string,
    buffer: ArrayBuffer,
  ): Promise<{ markdown: string; warnings: string[] }>;
  /** What's on the page now: the last converted file's name and Markdown. */
  current(): { fileName: string; markdown: string } | null;
}

function modelContext(): ModelContext | undefined {
  const holder = (target: object): ModelContext | undefined =>
    (target as { modelContext?: ModelContext }).modelContext;
  return holder(document) ?? holder(navigator);
}

function text(value: string, structured?: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: 'text', text: value }],
    ...(structured && { structuredContent: structured }),
  };
}

function error(message: string): ToolResult {
  return { ...text(message), isError: true };
}

// Inline images are base64 data URIs that can run to megabytes, which would
// swamp an agent's context. Replace them with a note unless asked; the page
// itself still shows them, and "Download .zip" saves them as files.
const DATA_URI_IMAGE = /!\[([^\]]*)\]\(data:[^)]*\)/g;
function withoutInlineImages(markdown: string): {
  markdown: string;
  omitted: number;
} {
  let omitted = 0;
  const stripped = markdown.replace(DATA_URI_IMAGE, (_match, alt: string) => {
    omitted++;
    return `![${alt}](image-omitted)`;
  });
  return { markdown: stripped, omitted };
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64.replace(/^data:[^,]*,/, '').replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Register the tools if the browser supports WebMCP; otherwise do nothing. */
export function registerWebMcpTools(converter: WebMcpConverter): void {
  const context = modelContext();
  if (!context) return;

  const tools: ModelContextTool[] = [
    {
      name: 'convert_docx_to_markdown',
      description:
        'Convert a Word (.docx) file to clean, GitHub-flavored Markdown, ' +
        "in this browser tab. The file never leaves the user's device. " +
        'The result also appears on the page for the user. Returns the ' +
        'Markdown and any document warnings. Images are replaced with ' +
        '"image-omitted" placeholders unless include_images is true.',
      inputSchema: {
        type: 'object',
        properties: {
          docx_base64: {
            type: 'string',
            description: 'The .docx file, base64-encoded (a data: URL works).',
          },
          filename: {
            type: 'string',
            description: 'Shown with the result, e.g. "report.docx".',
          },
          include_images: {
            type: 'boolean',
            description:
              'Keep images as base64 data URIs in the Markdown (can be large).',
          },
        },
        required: ['docx_base64'],
      },
      async execute(input) {
        let buffer: ArrayBuffer;
        try {
          buffer = base64ToBuffer(String(input.docx_base64 ?? ''));
        } catch {
          return error('docx_base64 is not valid base64.');
        }
        if (buffer.byteLength === 0) return error('docx_base64 is empty.');
        const fileName =
          typeof input.filename === 'string' && input.filename
            ? input.filename
            : 'document.docx';
        try {
          const result = await converter.convert(fileName, buffer);
          const { markdown, omitted } = input.include_images
            ? { markdown: result.markdown, omitted: 0 }
            : withoutInlineImages(result.markdown);
          return text(markdown, {
            markdown,
            warnings: result.warnings,
            images_omitted: omitted,
          });
        } catch (e) {
          return error(e instanceof Error ? e.message : String(e));
        }
      },
    },
    {
      name: 'get_converted_markdown',
      description:
        'Get the Markdown currently shown on the page, from the last ' +
        'document the user (or an agent) converted. Images are replaced ' +
        'with "image-omitted" placeholders.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      async execute() {
        const current = converter.current();
        if (!current) {
          return error(
            'Nothing has been converted yet. Ask the user to drop a .docx ' +
              'on the page, or call convert_docx_to_markdown.',
          );
        }
        const { markdown, omitted } = withoutInlineImages(current.markdown);
        return text(markdown, {
          filename: current.fileName,
          markdown,
          images_omitted: omitted,
        });
      },
    },
  ];

  for (const tool of tools) {
    try {
      context.registerTool(tool);
    } catch (e) {
      // e.g. a tool of the same name from another script. The page works
      // without it, so don't let one failure stop the rest.
      console.warn(`[word2md] Couldn't register WebMCP tool ${tool.name}`, e);
    }
  }
}
