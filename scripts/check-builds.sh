#!/usr/bin/env bash

# Build smoke test: run the full build (tsc library + CLI, then the Astro site)
# and fail if it fails. build/ and dist/ are gitignored, so there is no committed
# output to compare against; this only guards against a broken build.
# Exit code 0 = build succeeded
# Exit code 1 = build failed

set -e

echo "Running full build..."
npm run build
echo "✅ Build succeeded!"
