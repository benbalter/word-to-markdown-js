// Packs the MCP server (`w2m mcp`) as an MCP Bundle, word-to-markdown.mcpb:
// a zip of the built CLI, its production dependencies, a manifest.json, and
// an icon, which Claude Desktop installs with a double-click and runs on
// the Node it ships with. .github/workflows/mcpb.yml attaches it to each
// GitHub Release.
//
// Run: npm run pack:mcpb            (packs this checkout)
//      node scripts/pack-mcpb.mjs <dir>   (packs another checkout, e.g. a
//                                          release tag; it needs `npm ci`)
//
// Steps:
//  1. `npm pack` the checkout (its prepack builds build/ clean), so the
//     bundle carries exactly the files npm users get.
//  2. Install production dependencies only, from package-lock.json, in a
//     staging folder outside the repo, so a dependency missing from
//     package.json can't quietly resolve from the repo's node_modules.
//  3. Refuse native modules or install scripts: the bundle is built on Linux
//     and runs on macOS and Windows.
//  4. Ask the staged server for its tools (`tools/list`) and write
//     manifest.json (scripts/mcpb-manifest.mjs) and the icon.
//  5. `mcpb validate`, `mcpb pack`, `mcpb info`.
//  6. Unpack the finished .mcpb into a fresh folder, start the server
//     exactly as its manifest tells Claude Desktop to, and convert a file.
//
// Uses only Node built-ins (no repo dependencies), so it can pack a release
// tag cut before this script existed.
import { spawn, execFileSync } from 'child_process';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { ENTRY_POINT, ICON, mcpbManifest } from './mcpb-manifest.mjs';

// The MCPB CLI, run with npx and pinned to an exact version: the release
// workflow runs it, so an unreviewed upstream publish mustn't reach the
// bundle. Bump it deliberately.
const MCPB_CLI = '@anthropic-ai/mcpb@2.1.2';
const ICON_SOURCE = 'public/icon-512.png';
// Files Claude Desktop never reads. (mcpb pack already drops *.map and
// package-lock.json.)
const MCPB_IGNORE = ['*.d.ts', '*.d.mts', '*.d.cts'];

// The conversion the unpacked bundle must perform before it ships.
function smokeCall(repo) {
  return {
    name: 'convert_docx_to_markdown',
    arguments: { path: path.join(repo, 'src/__fixtures__/h1.docx') },
    check(result) {
      if (result.isError || !/^# /.test(result.content?.[0]?.text ?? '')) {
        throw new Error(`Unexpected result: ${JSON.stringify(result)}`);
      }
    },
  };
}

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: 'inherit', ...options });
}

function fail(message) {
  console.error(`pack-mcpb: ${message}`);
  process.exit(1);
}

// A minimal MCP client over stdio: newline-delimited JSON-RPC, enough to
// initialize, list tools, and call one. Built-ins only (see above).
async function withServer(command, args, cwd, use) {
  const child = spawn(command, args, {
    cwd,
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const pending = new Map();
  let nextId = 1;
  let buffer = '';
  const exited = new Promise((_, reject) => {
    child.on('error', reject);
    child.on('exit', (code) =>
      reject(new Error(`The server exited (code ${code}) before replying.`)),
    );
  });
  exited.catch(() => {}); // reported through the request that's waiting
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      const waiter = pending.get(message.id);
      if (!waiter) continue;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
    }
  });
  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const request = (method, params) => {
    const id = nextId++;
    send({ jsonrpc: '2.0', id, method, params });
    let timer;
    return Promise.race([
      new Promise((resolve, reject) => pending.set(id, { resolve, reject })),
      exited,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`No reply to ${method} in 60s.`)),
          60_000,
        );
      }),
    ]).finally(() => clearTimeout(timer));
  };
  try {
    await request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'pack-mcpb', version: '0.0.0' },
    });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    return await use(request);
  } finally {
    child.kill();
  }
}

// Native addons and install scripts would tie the bundle to the platform it
// was built on; npm ci --ignore-scripts would also silently skip the latter.
function assertPortable(nodeModules) {
  const problems = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.node')) problems.push(full);
      else if (entry.name === 'package.json') {
        let manifest;
        try {
          manifest = JSON.parse(readFileSync(full, 'utf8'));
        } catch {
          continue; // a fixture or template, not a package manifest
        }
        const scripts = manifest.scripts ?? {};
        if (
          manifest.os ||
          manifest.cpu ||
          manifest.gypfile ||
          scripts.install ||
          scripts.preinstall ||
          scripts.postinstall
        ) {
          problems.push(full);
        }
      }
    }
  };
  if (existsSync(nodeModules)) walk(nodeModules);
  if (problems.length > 0) {
    fail(
      'these dependencies are platform-specific or run install scripts, so ' +
        `one bundle can't serve every platform:\n  ${problems.join('\n  ')}`,
    );
  }
}

function toolsSignature(tools) {
  return JSON.stringify(
    tools.map(({ name, description }) => ({ name, description })),
  );
}

async function main() {
  const repo = path.resolve(process.argv[2] ?? '.');
  const pkg = JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8'));
  if (!existsSync(path.join(repo, 'src/mcp.ts'))) {
    fail(`${repo} has no MCP server (src/mcp.ts), so there's nothing to pack.`);
  }
  if (!existsSync(path.join(repo, ICON_SOURCE))) {
    fail(`${repo} has no ${ICON_SOURCE} for the bundle's icon.`);
  }
  if (!existsSync(path.join(repo, 'node_modules'))) {
    fail(
      `run \`npm ci\` in ${repo} first; npm pack builds with its devDependencies.`,
    );
  }

  const output = path.join(repo, `${pkg.name}.mcpb`);
  const work = mkdtempSync(path.join(os.tmpdir(), 'mcpb-'));
  try {
    // 1. The files npm users get (prepack rebuilds build/ from source).
    run('npm', ['pack', '--pack-destination', work], { cwd: repo });
    const tarball = readdirSync(work).find((f) => f.endsWith('.tgz'));
    run('tar', ['xzf', path.join(work, tarball), '-C', work]);
    const stage = path.join(work, 'package');

    // 2. Production dependencies only, at the locked versions.
    copyFileSync(
      path.join(repo, 'package-lock.json'),
      path.join(stage, 'package-lock.json'),
    );
    run(
      'npm',
      ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
      { cwd: stage },
    );

    // 3. One bundle for every platform.
    assertPortable(path.join(stage, 'node_modules'));

    // 4. The manifest, with the tools the staged server itself reports.
    const tools = await withServer(
      process.execPath,
      [path.join(stage, ENTRY_POINT), 'mcp'],
      stage,
      async (request) => (await request('tools/list', {})).tools,
    );
    const manifest = mcpbManifest(pkg, tools);
    writeFileSync(
      path.join(stage, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    copyFileSync(path.join(repo, ICON_SOURCE), path.join(stage, ICON));
    writeFileSync(
      path.join(stage, '.mcpbignore'),
      `${MCPB_IGNORE.join('\n')}\n`,
    );

    // 5. Validate against the MCPB schema, then pack.
    const mcpb = (...args) =>
      run('npx', ['-y', MCPB_CLI, ...args], { cwd: work });
    mcpb('validate', path.join(stage, 'manifest.json'));
    rmSync(output, { force: true });
    mcpb('pack', stage, output);
    mcpb('info', output);

    // 6. Run what was packed, the way Claude Desktop will.
    const unpacked = path.join(work, 'unpacked');
    mcpb('unpack', output, unpacked);
    const shipped = JSON.parse(
      readFileSync(path.join(unpacked, 'manifest.json'), 'utf8'),
    );
    const { command, args } = shipped.server.mcp_config;
    const call = smokeCall(repo);
    await withServer(
      command === 'node' ? process.execPath : command,
      args.map((arg) => arg.replaceAll('${__dirname}', unpacked)),
      os.tmpdir(),
      async (request) => {
        const listed = (await request('tools/list', {})).tools;
        if (toolsSignature(listed) !== toolsSignature(shipped.tools)) {
          throw new Error("The manifest's tools don't match the server's.");
        }
        call.check(
          await request('tools/call', {
            name: call.name,
            arguments: call.arguments,
          }),
        );
      },
    );

    const size = statSync(output).size;
    console.log(
      `\nPacked ${path.relative(process.cwd(), output) || output}: ` +
        `${(size / 1024 / 1024).toFixed(1)} MB, verified by unpacking it and ` +
        `calling ${call.name}.`,
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => fail(error.stack ?? String(error)));
}
