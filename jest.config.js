export default {
  testEnvironment: 'node',
  preset: 'ts-jest/presets/default-esm',
  transform: {
    '^.+\\.m?[tj]s?$': ['ts-jest', { useESM: true }],
  },
  moduleNameMapper: {
    // Strip only `.js` from relative ESM specifiers. Do NOT also strip `.mjs`:
    // that rewrites prettier's internal `./doc.mjs` import to `./doc`, which
    // resolves to the CJS `doc.js` whose `builders` export Jest's ESM linker
    // cannot see, breaking every suite that imports prettier.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.(m)?ts$',
  testPathIgnorePatterns: ['<rootDir>/src/__tests__/e2e/'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    'src/**/*.mts',
    '!src/**/*.d.ts',
    '!src/**/*.d.mts',
  ],
  // Guard the core converter against coverage regressions. Floors sit just below
  // current numbers (~90% stmts/lines, ~82% branches). No global threshold: the
  // CLI (cli.ts) and browser entry (index.ts) are exercised out-of-process by
  // the CLI-subprocess and Playwright suites, so they read as 0% here and would
  // make a global floor meaningless.
  coverageThreshold: {
    'src/main.ts': {
      statements: 85,
      branches: 78,
      functions: 88,
      lines: 85,
    },
  },
};
