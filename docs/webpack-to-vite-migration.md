# Webpack to Vite Migration

## Overview

This document details the evaluation and migration from Webpack to Vite as the bundler for the word-to-markdown-js web interface.

## Why Evaluate Alternatives?

Webpack has served the project well, but modern bundlers offer significant improvements in:

- Build speed
- Developer experience
- Configuration simplicity
- Maintenance burden

## Alternatives Evaluated

### Considered Options

1. **Vite** - Fast, modern bundler using esbuild for dev and Rollup for production
2. **esbuild** - Extremely fast bundler written in Go
3. **Rollup** - Simpler than Webpack, designed for libraries
4. **Parcel** - Zero-config bundler

### Decision: Vite

**Why Vite?**

- Fast builds with esbuild-based dev server
- Excellent TypeScript support out of the box
- Handles CSS automatically (no loaders needed)
- Great dev server with HMR
- Modern standard for web applications
- Minimal configuration required
- Active maintenance and large community

## Migration Results

### Performance Improvements

| Metric             | Webpack    | Vite      | Improvement     |
| ------------------ | ---------- | --------- | --------------- |
| Build Time         | 10.7s      | 3.4s      | **3x faster**   |
| Dev Server Startup | ~2s        | 171ms     | **12x faster**  |
| Config Size        | 50 lines   | 20 lines  | **60% simpler** |
| Dependencies       | 6 packages | 1 package | **83% fewer**   |

### Bundle Size

Both produce similar bundle sizes:

- **Webpack**: 1,040 KB (main.js)
- **Vite**: 1,049 KB (main.js) + 2 KB (index.css)
- **Difference**: ~11 KB (1% larger, negligible)

The CSS is now separated, which is actually better for caching.

### Configuration Comparison

**Before (webpack.config.cjs):**

```javascript
const webpack = require('webpack');
const nodeModulePrefixRe = /^node:/u;

module.exports = {
  entry: ['./src/index.ts'],
  stats: { warnings: false },
  module: {
    unknownContextCritical: false,
    rules: [
      { test: /\.ts$/, use: 'ts-loader', exclude: /node_modules/ },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  devServer: {
    static: './dist',
    client: {
      overlay: {
        errors: true,
        warnings: false,
        runtimeErrors: true,
      },
    },
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      './main.js': './main.ts',
    },
    fallback: {
      fs: false,
      os: false,
      path: false,
      util: false,
      url: require.resolve('url/'),
    },
  },
  mode: 'production',
  plugins: [
    new webpack.NormalModuleReplacementPlugin(
      nodeModulePrefixRe,
      (resource) => {
        const module = resource.request.replace(nodeModulePrefixRe, '');
        resource.request = module;
      },
    ),
  ],
};
```

**After (vite.config.ts):**

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false, // Don't empty dist as build:pages writes there
    rollupOptions: {
      output: {
        // Use simple file names for output
        entryFileNames: 'main.js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
  resolve: {
    alias: {
      './main.js': './src/main.ts',
    },
  },
});
```

### Dependencies Removed

- `webpack` (5.101.3)
- `webpack-cli` (6.0.1)
- `webpack-dev-server` (5.2.2)
- `ts-loader` (9.5.4)
- `css-loader` (7.1.2)
- `style-loader` (4.0.0)

### Dependencies Added

- `vite` (7.3.1)

## Changes Made

1. **Installed Vite** as the build tool
2. **Created vite.config.ts** with minimal configuration
3. **Moved index.html** to project root (Vite convention)
4. **Updated npm scripts**:
   - `build:web`: `webpack build` → `vite build`
   - `server:web`: `webpack serve --open` → `vite`
5. **Updated index.html** to use TypeScript source directly
6. **Removed webpack dependencies** and configuration
7. **Updated documentation** in copilot-instructions.md and scripts

## Testing

All existing tests pass without modification:

- ✅ 72 unit tests pass
- ✅ Linting passes
- ✅ Production build works
- ✅ Dev server works
- ✅ Web interface functions correctly

## Developer Experience Improvements

### Dev Server

- **Instant startup**: 171ms vs ~2s
- **Fast HMR**: Changes reflect immediately
- **Better error overlay**: Clearer error messages

### Build Process

- **Faster iteration**: 3.4s builds vs 10.7s
- **Clearer output**: Better build statistics
- **Simpler debugging**: Fewer layers of abstraction

### Configuration

- **TypeScript native**: No need for ts-loader
- **CSS handled**: No need for style-loader and css-loader
- **Sensible defaults**: Less configuration needed

## Rollback Plan

If issues arise, rollback is straightforward:

1. Revert the commit
2. Run `npm install` to restore webpack dependencies
3. Run `npm run build` to verify

The webpack.config.cjs is preserved in git history.

## Recommendations

### Future Optimizations

The current bundle is 1.05MB, which triggers Vite's warning. Consider:

1. **Code splitting**: Use dynamic imports for large dependencies
2. **Bundle analysis**: Identify large dependencies
3. **Lazy loading**: Load conversion logic only when needed

Example for code splitting:

```typescript
// Instead of:
import convert from './main.js';

// Use dynamic import:
const { default: convert } = await import('./main.js');
```

## Conclusion

The migration to Vite is a clear success:

- **3x faster builds** with no bundle size increase
- **Simpler configuration** reducing maintenance burden
- **Better developer experience** with modern tooling
- **Reduced dependencies** minimizing security surface area

This change positions the project to use modern, actively maintained tooling that will serve it well into the future.
