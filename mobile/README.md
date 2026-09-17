# The phone app

React Native, Android-first, sharing its API client, its i18n table, its design
tokens and its claim wizard with the web app — not copies of them, the same
files. Metro is pointed at `../src` for exactly that reason: the moment the two
have separate copies of "what does a claim need", they will disagree, and the
first person to find out is a family.

## Running it

```bash
npm install
CSP_API_URL=http://10.0.2.2:8080 npm run android    # Android emulator
CSP_API_URL=http://192.168.1.42:8080 npm run android  # a handset on your wifi
```

`10.0.2.2` is the emulator's name for the host machine. A real handset needs
your machine's address on the network it is on — `localhost` is the phone
itself, and a build that points at it fails every request with no explanation.

With `CSP_API_URL` unset the app runs on the same fixtures the web demo uses and
says so on screen, in the same words.

## What is different from the web, and why

| | |
|---|---|
| **Session** | MMKV. The refresh token survives the app being closed and is bound to this device server-side; the access token is memory-only. A member on ₦100 of airtime should not be sent an SMS for opening the app. |
| **The card** | Read from MMKV synchronously on first render. The moment it is most needed is a hospital gate with no signal, and an async read there means a spinner. |
| **The lock** | `react-native-biometrics`, asked once on open. It is a lock on a handset that gets passed around, not a second authentication — the server was already satisfied by the token. A phone with no sensor is let through, because most ₦40,000 handsets have none. |
| **Documents** | The camera, not a file input. `pickDocument` reads the photograph into a blob because the upload is a presigned PUT of raw bytes rather than a form. |
| **Where the API is** | Passed in. `import.meta.env` is Vite's and Metro does not evaluate it, so `src/api/env.native.ts` answers empty and this app supplies the address. |

## Building an APK

```bash
npm run apk       # mobile/android/app/build/outputs/apk/release/
```

Hermes, R8, and one APK per ABI plus a universal one — the spec's budget is
8 MB, and the largest thing in a React Native APK is the native libraries
compiled four times over. The CI `mobile` job builds these on every pull request
and prints the sizes; the machine this was written on has no Android SDK, so
that job is where an APK first exists.

**Release builds are signed with the debug key.** That is the React Native
template's default and it is left visible rather than quietly changed: a real
release needs a keystore that is not in this repository, and the decision about
who holds it has not been made. See `android/app/build.gradle`.

## Not done yet

- **Only English.** The i18n table is wired and every string comes from it; the
  language picker the web has on its splash screen is not built here.
- **No navigation library.** Six screens and one back button, held in component
  state. `@react-navigation` is installed and is the right answer at the point
  there is a deep link or a stack worth having.
- **The QR on the protection card** is not drawn. The API issues a signed
  offline payload for it; rendering it needs a QR library and a decision about
  what a gate scans it with.
- **Nobody has run it on a handset.** It compiles, Metro bundles it, and CI
  builds the APK. Whether it is usable on a Tecno in sunlight is a question this
  repository cannot answer.
