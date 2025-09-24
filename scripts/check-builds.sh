#!/usr/bin/env bash

# Script to check if build and dist folders are up to date
# This script builds the project and checks if any files changed
# Exit code 0 = builds are up to date
# Exit code 1 = builds are out of date

set -e

echo "Checking if builds are up to date..."

# Store the current git status
echo "Current git status:"
git status --porcelain

# Run the builds
echo "Running TypeScript build..."
npm run build

echo "Running webpack build..."
npm run build:web

# Check if any files changed in build or dist directories
# Handle case where directories might not exist
BUILD_CHANGES=""
if [ -d "build" ] || [ -d "dist" ]; then
    BUILD_CHANGES=$(git status --porcelain build/ dist/ 2>/dev/null || true)
fi
if [ -n "$BUILD_CHANGES" ]; then
    echo "❌ Builds are out of date! The following files have changes:"
    echo "$BUILD_CHANGES"
    echo ""
    echo "Please run the following commands and commit the changes:"
    echo "  npm run build"
    echo "  npm run build:web"
    echo "  git add build/ dist/"
    echo "  git commit -m 'Update build artifacts'"
    exit 1
else
    echo "✅ Builds are up to date!"
    exit 0
fi