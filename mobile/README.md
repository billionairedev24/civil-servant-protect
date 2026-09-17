# The phone app

React Native, Android and iOS, sharing its API client, its i18n table, its
design tokens and its claim wizard with the web app — not copies of them, the same
files. Metro is pointed at `../src` for exactly that reason: the moment the two
have separate copies of "what does a claim need", they will disagree, and the
first person to find out is a family.

## Running it

```bash
npm install

CSP_API_URL=http://10.0.2.2:8080 npm run android      # Android emulator
CSP_API_URL=http://192.168.1.42:8080 npm run android  # a handset on your wifi

npm run pods                                          # once, and after adding a native module
CSP_API_URL=http://localhost:8080 npm run ios         # iOS simulator
CSP_API_URL=http://192.168.1.42:8080 npm run ios      # an iPhone on your wifi
```

The iOS simulator shares the host's network, so `localhost` is the machine —
unlike the Android emulator, which needs `10.0.2.2`.

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

Hermes, R8, resource shrinking, one APK per ABI and no universal one. The CI
`mobile` job builds these on every pull request and prints the sizes as an
annotation; the machine this was written on has no Android SDK, so that job is
where an APK first exists.

**It is over the spec's 8 MB budget.** Measured on the first green build:

| | |
|---|---|
| armeabi-v7a | 12.2 MB |
| arm64-v8a | 16.5 MB |
| universal (no longer built) | 55.1 MB |

Code and resource shrinking together took 0.1 MB off that — 12.3 to 12.2 — which
is the whole argument: the remaining weight is Hermes and the React Native
runtime compiled per architecture, and no configuration switch removes it. The next real lever is an
app bundle rather than an APK, which means distributing through Play. See
`docs/plan.md` §2c.21 — it is a decision, not a build problem.

**Release builds are signed with the debug key.** That is the React Native
template's default and it is left visible rather than quietly changed: a real
release needs a keystore that is not in this repository, and the decision about
who holds it has not been made. See `android/app/build.gradle`.

## iOS

Same source, same screens. What differs is underneath:

| | |
|---|---|
| **The lock** | Face ID or Touch ID rather than a fingerprint reader. The screen names whichever the device has — telling somebody to use their fingerprint on a Face ID iPhone is telling them to do something their phone cannot do. |
| **Permissions** | Three `Info.plist` strings the native modules require: camera, photo library, Face ID. Without them iOS does not warn — it crashes the moment the camera is opened, which here is the moment somebody is photographing a death certificate. |
| **Local HTTP** | `NSAllowsLocalNetworking`, which covers a development API on the LAN without turning off App Transport Security. Android needs a debug-only manifest for the same thing. |

The CI `ios` job runs on a macOS runner and builds the simulator target. It does
not build a signed archive: that needs a team, a provisioning profile and an
Apple account, none of which are this repository's to decide. `Pods/` is not
committed — `npm run pods` after a fresh clone or a new native module.

## The screens

Sign in · home · the protection card · what the cover pays · the claim wizard ·
tracking a claim · contributions · who gets paid · family cover · more.

Enrolment is not here and will not be. It is a back-office task — a sponsor
enrols their staff and the member is invited — so a member's app has no screen
that creates a member.

## Not done yet

- **Adding and removing beneficiaries and dependants.** Changing a share is safe
  on a small screen; retyping a name, a relation and a date of birth on one is
  how a beneficiary ends up recorded as "Emek". Both are on the web app.
- **The accident report.** The claim wizard covers death, accident and
  disability; the separate four-tap accident flow the web has is not ported.
- **No navigation library.** Ten screens and one back button, held in component
  state. `@react-navigation` was installed and has been taken out again: every
  autolinked native module is compiled for four ABIs, and an 8 MB budget is not
  the place to carry one that nothing imports. It is the right answer at the
  point there is a deep link or a stack worth having, and installing it then is
  one command.
- **The QR on the protection card** is not drawn. The API issues a signed
  offline payload for it; rendering it needs a QR library and a decision about
  what a gate scans it with.
- **Nobody has run it on a handset, on either platform.** It compiles, Metro
  bundles it, CI builds the APK and compiles the iOS target. Whether it is
  usable on a Tecno in sunlight is a question this repository cannot answer.
- **iOS has never been built here at all.** Xcode does not run on Linux, so
  unlike the Android side — where the bundle and the autolinking were checked
  locally — the iOS project is the React Native template with this app's
  identity, permissions and entry point. The CI job is the first thing that
  compiles it.
