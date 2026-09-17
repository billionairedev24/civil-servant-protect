/**
 * The same question, answered for React Native.
 *
 * Empty, on purpose. A phone has no `localhost` to fall back to — the API is on
 * a machine across the wifi, or on an ingress — so the address is configuration
 * the app is given rather than something this file can guess. `mobile/src/env.ts`
 * reads it and passes it to {@link ApiProvider}.
 *
 * Metro prefers `.native.ts` over `.ts`, which is what keeps Vite's
 * `import.meta.env` out of the phone bundle.
 */
export function configuredApiUrl(): string {
  return ''
}
