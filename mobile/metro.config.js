const path = require('path')
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')

/**
 * Metro, pointed at the repository rather than at this folder.
 *
 * The build spec asks the phone app and the web app to share their API client
 * and their i18n table. That is only true if the phone compiles the same files
 * the browser does — a copy under `mobile/` would be a second answer to "what
 * does a claim look like", and the first time the two disagreed would be in
 * front of a family.
 *
 * So `../src` is a watched folder and its imports resolve against the root's
 * `node_modules` as well as this app's. `react` and `react-native` are pinned
 * to this app's copies: two Reacts in one bundle produce hooks that throw at
 * runtime with a message about rules of hooks and nothing about the cause.
 *
 * The shared code has one bundler-specific line, in `src/api/env.ts`, and Metro
 * resolves `env.native.ts` beside it instead. See that file.
 */
const repoRoot = path.resolve(__dirname, '..')

const config = {
  watchFolders: [path.resolve(repoRoot, 'src'), path.resolve(repoRoot, 'node_modules')],
  resolver: {
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(repoRoot, 'node_modules'),
    ],
    extraNodeModules: {
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-native': path.resolve(__dirname, 'node_modules/react-native'),
    },
  },
}

module.exports = mergeConfig(getDefaultConfig(__dirname), config)
