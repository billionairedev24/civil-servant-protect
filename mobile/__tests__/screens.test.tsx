/**
 * Every screen renders.
 *
 * A low bar deliberately, and the one nothing was clearing. `tsc` proves the
 * types line up and CI proves an APK builds; neither executes a component, so a
 * hook called inside a condition, a fixture whose shape drifted, or a native
 * import reached at module scope all pass both and then crash on the handset —
 * on a screen somebody opened at a hospital gate.
 *
 * Rendered through the same providers `App.tsx` uses, with no API address, so
 * each screen resolves the fixtures the demo runs on. That is what a member
 * sees before the first response arrives, which makes it the state most worth
 * proving renders at all.
 */
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import React from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { ApiProvider } from '../../src/api/provider'
import { AuthProvider } from '../../src/api/auth'
import { LangProvider } from '../../src/i18n'
import type { Lang } from '../../src/i18n'

import { BeneficiariesScreen } from '../src/screens/Beneficiaries'
import { CardScreen } from '../src/screens/Card'
import { ClaimScreen } from '../src/screens/Claim'
import { ContributionsScreen } from '../src/screens/Contributions'
import { CoverScreen } from '../src/screens/Cover'
import { FamilyScreen } from '../src/screens/Family'
import { HomeScreen } from '../src/screens/Home'
import { MoreScreen } from '../src/screens/More'
import { SignInScreen } from '../src/screens/SignIn'
import { TrackScreen } from '../src/screens/Track'

const noop = () => {}

/*
 * A handle on the query client the provider made for itself.
 *
 * `AuthProvider` runs a `useQuery`, and react-query schedules a garbage
 * collection timer for each query when it stops being observed — `gcTime` is
 * five minutes here. Fifteen renders leave fifteen live timers, and node will
 * not exit while they are pending: the suite passes and then hangs, which in
 * CI is a job that runs until it is killed.
 *
 * Reaching for it through the context rather than having the provider accept
 * one, because a seam that exists only for a test is a seam the app then has to
 * carry.
 */
let client: QueryClient | null = null

function Probe() {
  client = useQueryClient()
  return null
}

function render(node: React.ReactElement, lang: Lang = 'en'): ReactTestRenderer {
  let tree!: ReactTestRenderer
  // `act`, because every one of these mounts effects — the card reads storage,
  // Home caches what it loaded. Without it React warns and the warning is the
  // only sign that the effect never ran.
  act(() => {
    tree = create(
      <ApiProvider baseUrl="">
        <AuthProvider>
          <LangProvider lang={lang}>
            <Probe />
            {node}
          </LangProvider>
        </AuthProvider>
      </ApiProvider>,
    )
  })
  return tree
}

/** Unmount, then take the query cache's timers with it. */
function teardown(tree: ReactTestRenderer) {
  act(() => tree.unmount())
  client?.clear()
  client = null
}

/** Every screen, with the props `App.tsx` gives it. */
const SCREENS: [string, React.ReactElement][] = [
  ['sign in', <SignInScreen onIn={noop} />],
  ['home', <HomeScreen go={noop} />],
  ['protection card', <CardScreen />],
  ['cover', <CoverScreen />],
  ['claim', <ClaimScreen onDone={noop} />],
  ['track', <TrackScreen />],
  ['beneficiaries', <BeneficiariesScreen />],
  ['contributions', <ContributionsScreen />],
  ['family', <FamilyScreen />],
  ['more', <MoreScreen lang="en" setLang={noop} go={noop} onSignOut={noop} />],
]

describe('the phone app', () => {
  it.each(SCREENS)('%s renders', (_name, element) => {
    const tree = render(element)
    expect(tree.toJSON()).toBeTruthy()
    teardown(tree)
  })

  /*
   * The four languages the scheme is delivered in.
   *
   * Not a translation check — those strings need native speakers and this
   * cannot judge them. It catches the mechanical failure: a key added to
   * English and missing elsewhere renders `undefined` into a sentence, and a
   * screen that only ever gets opened in English hides it until somebody in
   * Kano opens it.
   */
  it.each<Lang>(['ha', 'yo', 'ig', 'pcm'])('home renders in %s', (lang) => {
    const tree = render(<HomeScreen go={noop} />, lang)
    expect(JSON.stringify(tree.toJSON())).not.toContain('undefined')
    teardown(tree)
  })

  /*
   * The card carries something to scan.
   *
   * It is the one screen with a hard requirement beyond rendering: a gate
   * scans it, and a card with no code is a member turned away. The image is a
   * data URI so this can assert it without a network or a device.
   */
  it('the protection card shows a QR', () => {
    const tree = render(<CardScreen />)
    expect(JSON.stringify(tree.toJSON())).toContain('data:image/png;base64,')
    teardown(tree)
  })
})
