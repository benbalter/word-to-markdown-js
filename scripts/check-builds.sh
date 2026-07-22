#!/usr/bin/env bash

# Script to check if the committed build/ output (tsc library + CLI) is current.
# The site output (dist/) is built and deployed by GitHub Actions and is not
# committed, so it is intentionally not guarded here.
# Exit code 0 = build is up to date
# Exit code 1 = build is out of date

set -e

echo "Checking if the build is up to date..."

# Store the current git status
echo "Current git status:"
git status --porcelain

# Run the build (TypeScript library/CLI + Astro site)
echo "Running full build..."
npm run build

# Check if any tracked files changed in the build directory
BUILD_CHANGES=""
if [ -d "build" ]; then
    BUILD_CHANGES=$(git status --porcelain build/ 2>/dev/null || true)
fi
if [ -n "$BUILD_CHANGES" ]; then
    echo "❌ Build is out of date! The following files have changes:"
    echo "$BUILD_CHANGES"
    echo ""
    echo "Please run the following commands and commit the changes:"
    echo "  npm run build"
    echo "  git add build/"
    echo "  git commit -m 'Update build artifacts'"
    exit 1
else
    echo "✅ Build is up to date!"
    exit 0
fi
