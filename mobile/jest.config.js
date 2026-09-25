/**
 * Running the app, not just compiling it.
 *
 * Until this existed the only automated checks on the phone app were
 * `tsc --noEmit` and CI proving an APK builds. Both are real and neither runs a
 * line of the app: a screen that throws on first render, a hook called
 * conditionally, a fixture shape that drifted from the type — all typecheck,
 * all build, all crash on a handset.
 *
 * `jest` and `react-test-renderer` were already in devDependencies, from the
 * React Native template. What was missing was this file, a setup file, a `test`
 * script and any tests, so jest was installed and did nothing.
 */
module.exports = {
  preset: '@react-native/jest-preset',

  setupFiles: ['<rootDir>/jest.setup.js'],

  /*
   * `.native.ts` before `.ts`, mirroring tsconfig's moduleSuffixes and what
   * Metro does.
   *
   * The shared code has exactly one platform-split module — `src/api/env.ts`
   * and `env.native.ts`, which is the line that reads Vite's `import.meta.env`.
   * Resolve it the web way here and every test fails on a syntax error in a
   * file the phone never loads.
   */
  moduleFileExtensions: ['native.ts', 'native.tsx', 'ts', 'tsx', 'js', 'jsx', 'json', 'node'],

  /*
   * Mobile's babel config, for the shared code too.
   *
   * Half of what these tests render lives in `../src`, outside this directory.
   * Babel resolves its config upward from each file, and the repository root
   * has none — it is a Vite project, transformed by esbuild — so those files
   * would arrive at jest as untransformed TypeScript. Naming the config makes
   * one babel apply to both halves, which is the same arrangement Metro has.
   */
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': [
      'babel-jest',
      { configFile: require.resolve('./babel.config.js') },
    ],
  },

  /*
   * Node modules are not transformed, except the ones shipped as untranspiled
   * ESM — which is most of the React Native ecosystem.
   */
  transformIgnorePatterns: [
    'node_modules/(?!(?:@react-native|react-native|react-native-.*|@react-navigation)/)',
  ],

  // The shared code is a sibling of this package, so tests importing it have to
  // be allowed to leave the directory.
  roots: ['<rootDir>/__tests__', '<rootDir>/src'],

  /*
   * This package's node_modules, for the shared code too.
   *
   * Babel injects `@babel/runtime` helpers into whatever it transforms, and a
   * helper required from `../src/api/provider.tsx` resolves upward from the
   * repository root — which is the web project and has no React Native
   * toolchain in it. Metro has the same arrangement through `nodeModulesPaths`;
   * this is the jest half of it.
   */
  modulePaths: ['<rootDir>/node_modules'],

  /*
   * One React, and it is this package's.
   *
   * The repository holds two on purpose — the web is on 18 and React Native
   * 0.87 requires 19 — and the shared code under `../src` resolves `react`
   * upward, which finds the web's. Two copies in one render is not a version
   * warning; it is "Cannot read properties of null (reading 'useState')" from
   * inside a hook, because the component was built against one copy's
   * dispatcher and rendered by the other's.
   *
   * Metro solves this with `nodeModulesPaths` ordering and TypeScript with
   * `paths` in tsconfig. This is the same fix for the third tool.
   */
  moduleNameMapper: {
    '^react$': '<rootDir>/node_modules/react',
    '^react/(.*)$': '<rootDir>/node_modules/react/$1',
    '^react-native$': '<rootDir>/node_modules/react-native',
    /*
     * And one react-query, for the same reason.
     *
     * Both packages depend on it, so `../src/api/provider.tsx` resolved the
     * root's copy while anything in `mobile/` resolved this one. Two copies
     * means two React contexts: `useQueryClient` in one half cannot see the
     * provider mounted by the other, and the caches never meet.
     *
     * It surfaced as a hung test process rather than a failure — the tests
     * passed, and jest sat there afterwards holding six five-minute garbage
     * collection timers belonging to a client nothing could reach to clear.
     */
    '^@tanstack/react-query$': '<rootDir>/node_modules/@tanstack/react-query',
    '^@tanstack/query-core$': '<rootDir>/node_modules/@tanstack/query-core',
  },

  testEnvironment: 'node',
}
