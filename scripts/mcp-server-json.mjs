// Writes server.json, the MCP Registry's record for `w2m mcp`
// (https://modelcontextprotocol.io/registry), from package.json. Generated at
// release time rather than committed, so the name, description, and version
// have one source and can't drift. release.yml runs this right after
// `npm publish`, then `mcp-publisher publish` reads ./server.json.
//
// The registry checks that package.json's `mcpName` matches `name` here,
// and that the published npm package carries the same `mcpName`.
//
// Run: node scripts/mcp-server-json.mjs   (writes ./server.json)
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

const SCHEMA =
  'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json';

export function serverJson(pkg) {
  return {
    $schema: SCHEMA,
    name: pkg.mcpName,
    title: 'Word to Markdown',
    description: pkg.description,
    websiteUrl: pkg.homepage,
    repository: {
      url: pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, ''),
      source: 'github',
    },
    version: pkg.version,
    packages: [
      {
        registryType: 'npm',
        identifier: pkg.name,
        version: pkg.version,
        transport: { type: 'stdio' },
        // `npx word-to-markdown` alone converts a file; the server is the
        // `mcp` subcommand.
        packageArguments: [{ type: 'positional', value: 'mcp' }],
      },
    ],
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pkg = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );
  writeFileSync('server.json', `${JSON.stringify(serverJson(pkg), null, 2)}\n`);
}
