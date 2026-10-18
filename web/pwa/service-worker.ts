// Astro integration that writes dist/sw.js after the build, from the
// web/pwa/sw.js template (or web/pwa/sw-kill.js when the kill switch in
// config.ts is on). Hand-rolled rather than @vite-pwa/astro, which doesn't
// support this Astro major, or workbox-build, whose generated worker serves
// precached HTML cache-first and would hide "/" from the Worker's locale
// redirect.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { serviceWorkerKillSwitch } from './config.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

// Chunks the converter needs: every content-hashed script Astro emits under
// _astro/, except the main-thread converter (main.*.js). That one only loads
// where the module Web Worker can't start, which a browser with service
// workers essentially never hits, and the runtime cache keeps it if it does.
// Fonts are cached at runtime as pages use them; HTML is never precached.
const PRECACHE_EXCLUDE = /^main\.[\w-]+\.js$/;

export interface ServiceWorkerBuild {
  source: string;
  version: string;
  precache: string[];
  bytes: number;
}

export function buildServiceWorker(
  distDir: string,
  { killSwitch = false }: { killSwitch?: boolean } = {},
): ServiceWorkerBuild {
  if (killSwitch) {
    return {
      source: readFileSync(path.join(here, 'sw-kill.js'), 'utf8'),
      version: 'kill',
      precache: [],
      bytes: 0,
    };
  }

  const assetDir = path.join(distDir, '_astro');
  const files = readdirSync(assetDir)
    .filter((name) => name.endsWith('.js') && !PRECACHE_EXCLUDE.test(name))
    .sort();
  const precache = files.map((name) => `/_astro/${name}`);
  const bytes = files.reduce(
    (sum, name) => sum + statSync(path.join(assetDir, name)).size,
    0,
  );

  const template = readFileSync(path.join(here, 'sw.js'), 'utf8');
  // Filenames are content hashes, so the list changes whenever a chunk does;
  // hashing the template too means a change to the worker's own logic also
  // ships as a new version with fresh caches.
  const version = createHash('sha256')
    .update(template)
    .update(precache.join('\n'))
    .digest('hex')
    .slice(0, 12);

  const source = replaceOnce(
    replaceOnce(template, `'__SW_VERSION__'`, `'${version}'`),
    '/* __SW_PRECACHE__ */ []',
    JSON.stringify(precache),
  );
  return { source, version, precache, bytes };
}

function replaceOnce(text: string, token: string, value: string): string {
  const parts = text.split(token);
  if (parts.length !== 2) {
    throw new Error(`Expected ${token} exactly once in the service worker`);
  }
  return parts.join(value);
}

export default function serviceWorker(): AstroIntegration {
  return {
    name: 'word2md-service-worker',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const distDir = fileURLToPath(dir);
        const build = buildServiceWorker(distDir, {
          killSwitch: serviceWorkerKillSwitch,
        });
        writeFileSync(path.join(distDir, 'sw.js'), build.source);
        logger.info(
          serviceWorkerKillSwitch
            ? 'Wrote sw.js: kill switch (unregisters installed workers)'
            : `Wrote sw.js ${build.version}: precaching ${build.precache.length} files, ${Math.round(build.bytes / 1024)} KB`,
        );
      },
    },
  };
}
