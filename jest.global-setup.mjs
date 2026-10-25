// Build build/ once, before any test worker starts, when it's missing or older
// than the sources. cli.test.ts and mcp.test.ts spawn the built CLI, and
// build/ is gitignored (CI's test-node job runs Jest on a fresh checkout).
// Each suite used to run tsc itself, so in parallel workers one suite could
// spawn build/cli.js while the other's tsc was rewriting it: the CLI then ran
// a truncated file, exiting 0 with empty stdout.
import { execFileSync } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(root, 'build/cli.js');

// The newest mtime among the TypeScript sources tsc compiles (src/, minus
// tests), and tsconfig.json itself.
function newestSource() {
  let newest = statSync(path.join(root, 'tsconfig.json')).mtimeMs;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== '__fixtures__') {
          walk(file);
        }
      } else if (/\.m?ts$/.test(entry.name)) {
        newest = Math.max(newest, statSync(file).mtimeMs);
      }
    }
  };
  walk(path.join(root, 'src'));
  return newest;
}

export default function globalSetup() {
  if (existsSync(cliPath) && statSync(cliPath).mtimeMs >= newestSource()) {
    return;
  }
  execFileSync(
    process.execPath,
    [path.join(root, 'node_modules/typescript/bin/tsc')],
    { cwd: root, stdio: 'inherit' },
  );
}
