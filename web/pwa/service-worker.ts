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
// _astro/, except two kinds the runtime cache (cache-first in sw.js) picks up
// on first use instead:
// - the main-thread converter (main.*.js), which only loads where the module
//   Web Worker can't start, which a browser with service workers essentially
//   never hits;
// - the preview renderer's chunks (unified/remark/rehype), so a visitor who
//   never converts doesn't download them. Offline, a first conversion still
//   shows its Markdown; the preview works offline once a conversion has
//   loaded the renderer online.
// Fonts are cached at runtime as pages use them; HTML is never precached.
const PRECACHE_EXCLUDE = /^main\.[\w-]+\.js$/;

// The module whose dynamic imports are the preview renderer.
const PREVIEW_MODULE = path
  .resolve(here, '../scripts/converter/preview.ts')
  .split(path.sep)
  .join('/');

// The parts of a Rollup output chunk the renderer search reads. `imports` and
// `dynamicImports` are file names of other chunks; `moduleIds` are the modules
// bundled into this one.
export interface BundleChunk {
  fileName: string;
  isEntry: boolean;
  facadeModuleId: string | null;
  moduleIds: readonly string[];
  imports: readonly string[];
  dynamicImports: readonly string[];
}

// File names of the chunks only `module`'s dynamic imports need. First, what
// everything precached needs: every chunk reachable from the entry chunks
// except through `module`'s own dynamic imports, and not into the main-thread
// fallback, which isn't precached. Then the renderer's chunks are whatever
// `module`'s dynamic imports reach beyond that. A chunk both need (an entry
// chunk holding shared helpers, or a library another feature also loads) stays
// precached, so leaving the renderer out never strands anything else offline.
export function chunksOnlyFor(
  chunks: readonly BundleChunk[],
  {
    module,
    dynamicImports,
  }: { module: string; dynamicImports: readonly string[] },
): Set<string> {
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const rootIds = new Set(dynamicImports);
  const roots = new Set(
    chunks
      .filter(
        (chunk) => chunk.facadeModuleId && rootIds.has(chunk.facadeModuleId),
      )
      .map((chunk) => chunk.fileName),
  );
  const walk = (
    start: Iterable<string>,
    stop: ReadonlySet<string>,
    next: (chunk: BundleChunk) => readonly string[],
  ): Set<string> => {
    const seen = new Set<string>();
    const queue = [...start];
    while (queue.length > 0) {
      const name = queue.pop()!;
      if (seen.has(name) || stop.has(name)) continue;
      seen.add(name);
      const chunk = byName.get(name);
      if (chunk) queue.push(...next(chunk));
    }
    return seen;
  };
  const notPrecached = new Set(
    chunks
      .filter((chunk) => PRECACHE_EXCLUDE.test(path.basename(chunk.fileName)))
      .map((chunk) => chunk.fileName),
  );
  const precached = walk(
    chunks.filter((chunk) => chunk.isEntry).map((chunk) => chunk.fileName),
    notPrecached,
    (chunk) => [
      ...chunk.imports,
      ...(chunk.moduleIds.includes(module)
        ? chunk.dynamicImports.filter((name) => !roots.has(name))
        : chunk.dynamicImports),
    ],
  );
  return walk(roots, new Set([...precached, ...notPrecached]), (chunk) => [
    ...chunk.imports,
    ...chunk.dynamicImports,
  ]);
}

// Reads the client build's module graph to find the preview renderer's chunks
// by what they are (the dynamic imports of preview.ts), not by file name, and
// hands their file names (e.g. "_astro/unified.C4GKE9XB.js") to `record`.
function previewChunksPlugin(record: (fileNames: Set<string>) => void) {
  return {
    name: 'word2md-preview-chunks',
    apply: 'build' as const,
    generateBundle(
      this: {
        getModuleInfo(
          id: string,
        ): { dynamicallyImportedIds: readonly string[] } | null;
      },
      _options: unknown,
      bundle: Record<string, { type: string } & Partial<BundleChunk>>,
    ): void {
      // Only the client build bundles the preview; the server build doesn't.
      const preview = this.getModuleInfo(PREVIEW_MODULE);
      if (!preview) return;
      const chunks = Object.values(bundle).filter(
        (output): output is { type: string } & BundleChunk =>
          output.type === 'chunk',
      );
      record(
        chunksOnlyFor(chunks, {
          module: PREVIEW_MODULE,
          dynamicImports: preview.dynamicallyImportedIds,
        }),
      );
    },
  };
}

export interface ServiceWorkerBuild {
  source: string;
  version: string;
  precache: string[];
  bytes: number;
}

export function buildServiceWorker(
  distDir: string,
  {
    killSwitch = false,
    exclude = new Set<string>(),
  }: {
    killSwitch?: boolean;
    // Chunk file names (e.g. "_astro/unified.C4GKE9XB.js") left to the
    // runtime cache: the preview renderer's.
    exclude?: ReadonlySet<string>;
  } = {},
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
    .filter(
      (name) =>
        name.endsWith('.js') &&
        !PRECACHE_EXCLUDE.test(name) &&
        !exclude.has(`_astro/${name}`),
    )
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
  let previewChunks: Set<string> | undefined;
  return {
    name: 'word2md-service-worker',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({
          vite: {
            plugins: [
              previewChunksPlugin((fileNames) => {
                previewChunks = fileNames;
              }),
            ],
          },
        });
      },
      'astro:build:done': ({ dir, logger }) => {
        // Precaching the renderer by mistake would silently undo the saving,
        // so a moved or renamed preview.ts fails the build instead.
        if (!serviceWorkerKillSwitch && !previewChunks?.size) {
          throw new Error(
            `Couldn't find the preview renderer's chunks (the dynamic imports of ${PREVIEW_MODULE}); update PREVIEW_MODULE in web/pwa/service-worker.ts if it moved.`,
          );
        }
        const distDir = fileURLToPath(dir);
        const build = buildServiceWorker(distDir, {
          killSwitch: serviceWorkerKillSwitch,
          exclude: previewChunks,
        });
        writeFileSync(path.join(distDir, 'sw.js'), build.source);
        logger.info(
          serviceWorkerKillSwitch
            ? 'Wrote sw.js: kill switch (unregisters installed workers)'
            : `Wrote sw.js ${build.version}: precaching ${build.precache.length} files, ${Math.round(build.bytes / 1024)} KB; ${previewChunks?.size ?? 0} preview renderer chunks left to the runtime cache`,
        );
      },
    },
  };
}
