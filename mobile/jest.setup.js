/**
 * The native modules, replaced with the smallest thing that behaves.
 *
 * Every one of these is a real device capability with no JavaScript
 * implementation: MMKV is C++, biometrics is a fingerprint reader, the image
 * picker is a camera. Under jest they resolve to a module whose native side is
 * absent, and importing one throws before any test body runs — which is why an
 * un-mocked React Native suite fails at import rather than at an assertion.
 *
 * These are deliberately thin. A mock that grows logic becomes a second
 * implementation to keep in step with the first, and then the tests pass
 * against a thing the handset does not do.
 */

/*
 * MMKV, as a Map.
 *
 * Real behaviour that matters to the tests: what you set is what you get back,
 * and reads are synchronous. The synchronous part is the point — the card
 * screen reads storage during render precisely so there is no spinner at a
 * hospital gate, and an async mock would let a regression through.
 */
jest.mock('react-native-mmkv', () => {
  const held = new Map()
  return {
    // `createMMKV`, not `new MMKV()` — the v4 API, which is what
    // `src/storage.ts` actually calls. Worth saying because the older shape is
    // what most examples online still show, and a mock built from the wrong one
    // fails at import with a message about a missing function rather than about
    // a version.
    createMMKV: () => ({
      set: (key, value) => held.set(key, value),
      getString: (key) => held.get(key),
      remove: (key) => held.delete(key),
      clearAll: () => held.clear(),
    }),
  }
})

/*
 * No reader on this "device".
 *
 * `isSensorAvailable` answering false is the case most of these members
 * actually have — a ₦40,000 handset with no fingerprint sensor — and it is the
 * path that has to let somebody through rather than lock them out.
 */
jest.mock('react-native-biometrics', () => ({
  __esModule: true,
  default: class {
    isSensorAvailable() {
      return Promise.resolve({ available: false, biometryType: undefined })
    }
    simplePrompt() {
      return Promise.resolve({ success: true })
    }
  },
  BiometryTypes: { TouchID: 'TouchID', FaceID: 'FaceID', Biometrics: 'Biometrics' },
}))

/* A camera that was cancelled, which is the branch a claim upload has to survive. */
jest.mock('react-native-image-picker', () => ({
  launchCamera: () => Promise.resolve({ didCancel: true }),
  launchImageLibrary: () => Promise.resolve({ didCancel: true }),
}))

// Ships its own mock, which is the right one to use rather than an invented one.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
)
