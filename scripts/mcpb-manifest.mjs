// Builds manifest.json for the MCP Bundle (.mcpb), the file Claude Desktop
// installs in one click (https://github.com/modelcontextprotocol/mcpb). It's
// generated from package.json at pack time rather than committed, like
// server.json, so the name, description, and version have one source.
//
// The tool list isn't written here either: scripts/pack-mcpb.mjs asks the
// bundled server for it (`tools/list`) and passes it in, so the manifest can
// never describe a tool the server doesn't have.
//
// Spec: https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md
import { serverJson } from './mcp-server-json.mjs';

// The schema version Claude Desktop documents. 0.4 only adds Python's `uv`
// server type, which a Node server doesn't need.
export const MANIFEST_VERSION = '0.3';

// Where the bundle's copy of the CLI lives, and how to start its server.
// ${__dirname} is the folder Claude Desktop unpacked the bundle into.
export const ENTRY_POINT = 'build/cli.js';
export const ICON = 'icon.png';

export function mcpbManifest(pkg, tools) {
  const record = serverJson(pkg);
  // "Name <email>" in package.json; the manifest wants them apart.
  const [, name, email] = /^\s*([^<]+?)\s*(?:<([^>]+)>)?\s*$/.exec(pkg.author);
  return {
    manifest_version: MANIFEST_VERSION,
    name: pkg.name,
    display_name: record.title,
    version: pkg.version,
    description: pkg.description,
    author: { name, ...(email && { email }) },
    homepage: pkg.homepage,
    documentation: `${pkg.homepage}/developers/`,
    support: pkg.bugs.url,
    repository: { type: 'git', url: record.repository.url },
    license: pkg.license,
    keywords: pkg.keywords,
    icon: ICON,
    server: {
      type: 'node',
      entry_point: ENTRY_POINT,
      mcp_config: {
        command: 'node',
        // Claude Desktop runs Node it ships with, so users need none.
        args: [`\${__dirname}/${ENTRY_POINT}`, 'mcp'],
      },
    },
    // The manifest's tool entries allow only a name and a description.
    tools: tools.map(({ name, description }) => ({ name, description })),
    compatibility: {
      // Pure JavaScript with no native modules (pack-mcpb.mjs checks), so
      // one bundle runs everywhere Claude Desktop does, and on Linux for
      // other MCPB clients.
      platforms: ['darwin', 'win32', 'linux'],
      runtimes: { node: pkg.engines.node.replace(/\s+/g, '') },
    },
  };
}
