import { useCallback, useEffect, useState } from 'react'
import { StatusBar, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ApiProvider, useApi } from '../../src/api/provider'
import { AuthProvider, useAuth } from '../../src/api/auth'
import { LangProvider, type Lang } from '../../src/i18n'
import { C } from '../../src/theme/tokens'
import { API_URL } from './env'
import { deviceTokenStore, forgetEverything } from './storage'
import { unlock } from './biometrics'
import { Button, FixtureBadge, Screen, Sub, Title } from './ui'
import { SignInScreen } from './screens/SignIn'
import { HomeScreen } from './screens/Home'
import { CardScreen } from './screens/Card'
import { ClaimScreen } from './screens/Claim'
import { TrackScreen } from './screens/Track'
import { CoverScreen } from './screens/Cover'

/**
 * The phone app.
 *
 * Everything below `ApiProvider` is the code the web runs: the same client, the
 * same query hooks, the same i18n table, the same claim wizard. What this file
 * supplies is the three things a handset answers differently — where the API is,
 * where a session is kept, and the lock on the front door.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      {/* Android 15 draws edge-to-edge and ignores a status-bar colour, which is
        why only the icon style is set here. */}
      <StatusBar barStyle="dark-content" />
      {/*
        The token store is MMKV and is passed in rather than picked up, because
        the shared provider must not import a native module — the browser
        bundles the same file.
      */}
      <ApiProvider baseUrl={API_URL} tokens={deviceTokenStore()}>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </ApiProvider>
    </SafeAreaProvider>
  )
}

type Screen = 'home' | 'card' | 'claim' | 'track' | 'cover'

function Shell() {
  const { live } = useApi()
  const { signedIn, signOut } = useAuth()
  // English for now. The language picker is the splash screen's job on the web
  // and belongs on this app's first run too; it is not built here yet.
  const [lang] = useState<Lang>('en')
  const [screen, setScreen] = useState<Screen>('home')
  const [locked, setLocked] = useState(true)

  /*
   * The lock is asked for once, when the app opens with a session already on
   * the device. Not on every screen: this is a lock on a handset that gets
   * passed around, not a second authentication — the server has already been
   * satisfied by the token.
   */
  const ask = useCallback(async () => {
    setLocked(!(await unlock('Open Civil Servant Protect')))
  }, [])

  useEffect(() => {
    if (signedIn) void ask()
    else setLocked(false)
  }, [signedIn, ask])

  const leave = () => {
    // The card goes with the session. The next person holding this phone is
    // not them.
    forgetEverything()
    signOut()
    setScreen('home')
  }

  return (
    <LangProvider lang={lang}>
      <View style={{ flex: 1, backgroundColor: C.surface }}>
        {!signedIn ? (
          <SignInScreen onIn={() => setScreen('home')} />
        ) : locked ? (
          <Screen>
            <Title style={{ marginTop: 80 }}>Locked</Title>
            <Sub>
              This phone asked for your fingerprint and did not get it. Your session is still here.
            </Sub>
            <Button label="Try again" onPress={() => void ask()} style={{ marginTop: 20 }} />
            <Button label="Sign out instead" kind="quiet" onPress={leave} style={{ marginTop: 6 }} />
          </Screen>
        ) : (
          <>
            {screen === 'home' && <HomeScreen go={setScreen} />}
            {screen === 'card' && <CardScreen />}
            {screen === 'cover' && <CoverScreen />}
            {screen === 'claim' && <ClaimScreen onDone={() => setScreen('track')} />}
            {screen === 'track' && <TrackScreen />}
            {screen !== 'home' && (
              <View style={{ padding: 16, paddingTop: 0 }}>
                <Button label="Back" kind="quiet" onPress={() => setScreen('home')} />
              </View>
            )}
          </>
        )}
        <FixtureBadge live={live} />
      </View>
    </LangProvider>
  )
}
