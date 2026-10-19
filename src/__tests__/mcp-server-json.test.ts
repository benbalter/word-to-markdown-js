import { readFileSync } from 'fs';
// @ts-expect-error -- a plain .mjs script with no type declarations
import { serverJson } from '../../scripts/mcp-server-json.mjs';

// The MCP Registry record that release.yml generates and publishes. The
// registry rejects a publish whose name doesn't match the npm package's
// mcpName or breaks its schema limits, and a broken record would surface only
// after an npm release had already shipped, so check it on every test run.

const pkg = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as {
  name: string;
  version: string;
  description: string;
  mcpName: string;
};
const record = serverJson(pkg);

describe('MCP Registry server.json', () => {
  it('uses a name the GitHub login may publish', () => {
    expect(pkg.mcpName).toMatch(/^io\.github\.benbalter\/[a-zA-Z0-9._-]+$/);
    expect(record.name).toBe(pkg.mcpName);
  });

  it('points at this npm package and version', () => {
    expect(record.version).toBe(pkg.version);
    expect(record.packages).toEqual([
      expect.objectContaining({
        registryType: 'npm',
        identifier: pkg.name,
        version: pkg.version,
        transport: { type: 'stdio' },
      }),
    ]);
  });

  it('launches the mcp subcommand, not a conversion', () => {
    expect(record.packages[0].packageArguments).toEqual([
      { type: 'positional', value: 'mcp' },
    ]);
  });

  it('fits the schema limits', () => {
    expect(record.description.length).toBeLessThanOrEqual(100);
    expect(record.title.length).toBeLessThanOrEqual(100);
    expect(record.repository.url).toBe(
      'https://github.com/benbalter/word-to-markdown-js',
    );
  });
});
