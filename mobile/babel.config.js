module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    /*
     * Bakes CSP_API_URL into the bundle at build time.
     *
     * React Native replaces `process.env.NODE_ENV` and nothing else — there is
     * no `process` on a handset, so anything not inlined here reads as
     * undefined at runtime and the app silently runs on fixtures against a
     * backend that was configured perfectly.
     *
     * Named explicitly rather than inlining the whole environment: a build
     * machine's variables are not this app's business, and a release APK is a
     * file people pass around.
     */
    ['transform-inline-environment-variables', { include: ['CSP_API_URL'] }],
  ],
}
