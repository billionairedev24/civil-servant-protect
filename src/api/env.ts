/**
 * Where the API is, as the bundler knows it.
 *
 * One line, in its own file, because it is the only line in the shared code
 * that belongs to a particular bundler. `import.meta.env` is Vite's; Metro does
 * not evaluate it, and a React Native bundle that reached this file would fail
 * at build time rather than at runtime — so Metro resolves `env.native.ts`
 * beside it instead, and the phone passes its address in explicitly.
 *
 * Splitting it this way is what lets `provider.tsx`, the API client, the query
 * hooks and the i18n table be genuinely shared rather than copied.
 */
export function configuredApiUrl(): string {
  return (import.meta.env?.VITE_API_URL as string | undefined)?.trim() ?? ''
}
