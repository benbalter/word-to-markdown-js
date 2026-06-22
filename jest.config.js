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
};
