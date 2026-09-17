import ReactNativeBiometrics, { BiometryTypes } from 'react-native-biometrics'

/**
 * The fingerprint on the front door, and what it is actually for.
 *
 * It does not authenticate anybody to the server — the session already did
 * that, and the refresh token in MMKV is what keeps it. This is a lock on the
 * app on a handset that gets passed around, which is the normal case for the
 * people this is for: one phone, several people who borrow it, and a screen
 * that names a member's beneficiaries and what their family is owed.
 *
 * So a failed prompt hides the app's contents; it never signs anyone out. And a
 * device with no sensor is not a device we refuse — most of the handsets this
 * is aimed at are ₦40,000 phones, and half of them have no reader at all.
 */
const biometrics = new ReactNativeBiometrics({ allowDeviceCredentials: true })

export type Lock = 'fingerprint' | 'face' | 'passcode' | 'none'

export async function availableLock(): Promise<Lock> {
  try {
    const { available, biometryType } = await biometrics.isSensorAvailable()
    if (!available) return 'none'
    if (biometryType === BiometryTypes.FaceID) return 'face'
    if (biometryType === BiometryTypes.TouchID || biometryType === BiometryTypes.Biometrics) {
      return 'fingerprint'
    }
    return 'passcode'
  } catch {
    return 'none'
  }
}

/**
 * Ask.
 *
 * True when there was nothing to ask with, because a phone without a sensor
 * must still be able to open the app. The lock is a convenience on top of the
 * session, not the thing standing between somebody and their own record.
 */
export async function unlock(reason: string): Promise<boolean> {
  if ((await availableLock()) === 'none') return true
  try {
    const { success } = await biometrics.simplePrompt({ promptMessage: reason })
    return success
  } catch {
    return false
  }
}
