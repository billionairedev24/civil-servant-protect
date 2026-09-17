/**
 * Where the API is.
 *
 * A phone cannot reach `localhost` — that is the handset itself — so this has
 * to be an address on the network the device is actually on. In development
 * that is your machine's LAN address; in a build it is the ingress.
 *
 * Read from a build-time define so a release APK cannot be pointed somewhere
 * else by anything on the device, and left empty by default so that a build
 * made without it runs on fixtures and says so on screen rather than failing
 * every request silently.
 */
declare const process: { env: Record<string, string | undefined> }

export const API_URL: string = (process.env.CSP_API_URL ?? '').trim()

/**
 * The emulator's name for the host machine.
 *
 * Kept as a note rather than a default: guessing this is how somebody spends an
 * afternoon on a build that quietly talks to the wrong backend.
 *
 *   CSP_API_URL=http://10.0.2.2:8080 npm run android      # Android emulator
 *   CSP_API_URL=http://192.168.1.42:8080 npm run android  # a real handset
 */
export const EMULATOR_HOST = 'http://10.0.2.2:8080'
