import { execFileSync } from 'child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// The local MCP server (`w2m mcp`, src/mcp.ts), driven the way an agent would:
// spawn the built CLI and talk to it over stdio with the SDK's client.

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const cliPath = path.join(root, 'build/cli.js');
const tscPath = path.join(root, 'node_modules/typescript/bin/tsc');
const fixture = (name: string): string =>
  path.join(root, 'src/__fixtures__', name);

// Same freshness check as cli.test.ts: build/ is gitignored, so build it if
// it's missing or older than the sources.
const isStale = (): boolean =>
  !existsSync(cliPath) ||
  ['src/cli.ts', 'src/main.ts', 'src/mcp.ts'].some(
    (src) => statSync(path.join(root, src)).mtimeMs > statSync(cliPath).mtimeMs,
  );

interface TextContent {
  type: 'text';
  text: string;
}

let client: Client;
let tmp: string;

beforeAll(async () => {
  if (isStale()) {
    execFileSync(process.execPath, [tscPath], { cwd: root, stdio: 'inherit' });
  }
  tmp = mkdtempSync(path.join(os.tmpdir(), 'w2m-mcp-'));
  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [cliPath, 'mcp'],
      cwd: root,
    }),
  );
}, 60000);

afterAll(async () => {
  await client?.close();
  rmSync(tmp, { recursive: true, force: true });
});

describe('w2m mcp', () => {
  it('advertises the conversion tool and how to use it', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(['convert_docx_to_markdown']);
    expect(tools[0].inputSchema.required).toEqual(['path']);
    expect(client.getInstructions()).toContain('absolute path');
  });

  it('returns the Markdown for a .docx', async () => {
    const result = await client.callTool({
      name: 'convert_docx_to_markdown',
      arguments: { path: fixture('h1.docx') },
    });
    expect(result.isError).toBeFalsy();
    const [content] = result.content as TextContent[];
    expect(content.text).toMatch(/^# /);
    expect(result.structuredContent).toMatchObject({
      markdown: content.text,
      warnings: [],
    });
  });

  it('drops images by default and extracts them when asked', async () => {
    const dropped = await client.callTool({
      name: 'convert_docx_to_markdown',
      arguments: { path: fixture('image.docx') },
    });
    expect((dropped.content as TextContent[])[0].text).not.toContain(
      'data:image',
    );

    const output = path.join(tmp, 'out', 'image.md');
    const extracted = await client.callTool({
      name: 'convert_docx_to_markdown',
      arguments: {
        path: fixture('image.docx'),
        output_path: output,
        image_dir: 'img',
      },
    });
    expect(extracted.structuredContent).toMatchObject({
      output_path: output,
      images_written: 1,
    });
    const markdown = readFileSync(output, 'utf8');
    const link = /!\[[^\]]*\]\((img\/[^)]+)\)/.exec(markdown);
    expect(link).not.toBeNull();
    expect(existsSync(path.join(tmp, 'out', link![1]))).toBe(true);
  });

  it('refuses to overwrite a file unless asked', async () => {
    const output = path.join(tmp, 'existing.md');
    writeFileSync(output, 'keep me');
    const args = { path: fixture('h1.docx'), output_path: output };

    const refused = await client.callTool({
      name: 'convert_docx_to_markdown',
      arguments: args,
    });
    expect(refused.isError).toBe(true);
    expect((refused.content as TextContent[])[0].text).toContain(
      'overwrite: true',
    );
    expect(readFileSync(output, 'utf8')).toBe('keep me');

    const replaced = await client.callTool({
      name: 'convert_docx_to_markdown',
      arguments: { ...args, overwrite: true },
    });
    expect(replaced.isError).toBeFalsy();
    expect(readFileSync(output, 'utf8')).toMatch(/^# /);
  });

  it('reports bad input as a tool error, not a crash', async () => {
    const result = await client.callTool({
      name: 'convert_docx_to_markdown',
      arguments: { path: fixture('does-not-exist.docx') },
    });
    expect(result.isError).toBe(true);
    expect((result.content as TextContent[])[0].text).toMatch(/not found/i);
  });
});
