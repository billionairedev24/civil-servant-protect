import { Alert } from 'react-native'
import { launchCamera, launchImageLibrary, type Asset } from 'react-native-image-picker'
import type { UploadFile } from '../../src/api/client'

/** The server's cap, checked here so a bad photograph fails before the upload. */
const MAX_BYTES = 10 * 1024 * 1024

/**
 * One paper, photographed.
 *
 * Camera first, because that is what a family has: a certificate on a table and
 * a phone. The gallery is the second option rather than the first — somebody
 * who already photographed it, or was sent it on WhatsApp.
 *
 * Quality is capped rather than maximised. A 12-megapixel photograph of an A4
 * sheet is four megabytes of paper texture; an assessor needs to read the
 * writing, and the member is paying for every byte of it.
 */
export async function pickDocument(): Promise<UploadFile | null> {
  const asset = await choose()
  if (!asset?.uri) return null

  if ((asset.fileSize ?? 0) > MAX_BYTES) {
    Alert.alert('That photograph is too large', 'Documents are capped at 10 MB. Try again.')
    return null
  }

  /*
   * Read into a blob, because the body is PUT raw.
   *
   * React Native's fetch takes a `file://` URI for multipart form data, but
   * this is a presigned PUT of the bytes themselves — the storage service is
   * not parsing a form. `fetch(uri).blob()` is how those bytes are got at.
   */
  const response = await fetch(asset.uri)
  const body = await response.blob()

  return {
    name: asset.fileName ?? 'document.jpg',
    // The server accepts PDF, JPEG and PNG and enforces it; the camera gives
    // JPEG, and a missing type here would be sent as an empty string and
    // refused with a message about the file rather than about the phone.
    type: asset.type ?? 'image/jpeg',
    size: asset.fileSize ?? body.size,
    body,
  }
}

async function choose(): Promise<Asset | null> {
  const fromCamera = await new Promise<boolean>((resolve) => {
    Alert.alert(
      'Send this paper',
      'Photograph it now, or choose a picture you already have.',
      [
        { text: 'Photograph it', onPress: () => resolve(true) },
        { text: 'Choose a picture', onPress: () => resolve(false) },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      ],
      { cancelable: true },
    )
  })

  const options = {
    mediaType: 'photo' as const,
    // Enough to read a certificate, small enough to send on a bad connection.
    maxWidth: 2000,
    maxHeight: 2000,
    quality: 0.8 as const,
    includeBase64: false,
  }

  const result = fromCamera
    ? await launchCamera({ ...options, saveToPhotos: false })
    : await launchImageLibrary(options)

  if (result.didCancel || result.errorCode) return null
  return result.assets?.[0] ?? null
}
