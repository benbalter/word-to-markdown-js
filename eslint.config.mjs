// ESLint 9 flat config (replaces .eslintrc.json + .eslintignore). Lints the
// TypeScript sources; compiled JS, generated output, and config files are left
// to Prettier / tsc. typescript-eslint v8 is flat-config native, so the
// `recommended` preset already disables the core rules it supersedes
// (no-undef, no-unused-vars, …) for .ts files.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import jest from 'eslint-plugin-jest';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  // Never lint compiled output, generated types, coverage, or root config
  // files. Flat config only auto-ignores node_modules/.git, so dot-dirs like
  // .astro (Astro's generated types) must be listed explicitly. Hand-written
  // JS in worker/ and scripts/ is linted (see below).
  {
    ignores: [
      'dist/**',
      'build/**',
      'coverage/**',
      '.astro/**',
      'src/__fixtures__/**',
      '*.js',
      '*.mjs',
      '**/*.cjs',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // TypeScript sources run in Node (CLI, library, build helpers, tests).
  {
    files: ['**/*.ts', '**/*.mts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/prefer-ts-expect-error': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
    },
  },

  // Node build/fixture scripts.
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // The Cloudflare Worker runs on the Workers runtime (Web APIs plus
  // HTMLRewriter), not Node.
  {
    files: ['worker/**/*.js'],
    languageOptions: {
      globals: { ...globals.serviceworker, HTMLRewriter: 'readonly' },
    },
  },

  // The browser converter entry point uses DOM/Web APIs.
  {
    files: ['src/index.ts'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },

  // Jest globals + rules apply only to unit tests; the Playwright e2e specs
  // import their own `test`/`expect`, so they stay under the Node config above.
  {
    files: ['**/*.test.ts'],
    ...jest.configs['flat/recommended'],
  },

  // Keep last: turn off rules that conflict with Prettier formatting.
  prettier,
);
