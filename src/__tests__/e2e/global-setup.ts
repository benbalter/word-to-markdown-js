import { existsSync } from 'node:fs';
import path from 'node:path';
import type { FullConfig } from '@playwright/test';

// Outside CI, Playwright reuses whatever server is already listening on the
// e2e port. If that's another checkout's `astro preview` (another worktree, or
// a stale build), every test would silently run against the wrong site. The
// built HTML references content-hashed /_astro/ files, so the server is this
// build only if each one it references exists in this checkout's dist/.
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) return;

  const root = config.configFile
    ? path.dirname(config.configFile)
    : process.cwd();
  const dist = path.join(root, 'dist');
  if (!existsSync(path.join(dist, 'index.html'))) {
    throw new Error(
      `No built site in ${dist}. Run \`npm run build\` before \`npm run test:e2e\`.`,
    );
  }

  const html = await (await fetch(new URL('/', baseURL))).text();
  const assets = [...html.matchAll(/\/_astro\/[^"'\s)]+/g)].map((m) => m[0]);
  const missing = assets.filter(
    (asset) => !existsSync(path.join(dist, decodeURI(asset))),
  );
  if (assets.length === 0 || missing.length > 0) {
    throw new Error(
      `The server at ${baseURL} isn't serving this checkout's dist/ ` +
        `(${missing[0] ?? 'no /_astro/ assets'} isn't in ${dist}). ` +
        'Stop the other preview server, or pick a free port with E2E_PORT=<port>.',
    );
  }
}
