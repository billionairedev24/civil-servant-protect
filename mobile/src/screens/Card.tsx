import { useEffect } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { MEMBER_SUMMARY, PROTECTION_CARD } from '../../../src/api/fixtures'
import { useCard, useSummary } from '../../../src/api/queries'
import { useLive } from '../../../src/api/live'
import { dayFirst, naira, titleCase } from '../../../src/api/format'
import { C } from '../../../src/theme/tokens'
import { useT } from '../../../src/i18n'
import { rememberQr, rememberedCard, rememberedQr } from '../storage'
import { Card, Kicker, RecordRow, Screen, Sub, Title } from '../ui'

/**
 * The protection card, which has to work with no network.
 *
 * This is the screen the whole offline story is for. Somebody is at a hospital
 * gate, or in front of an HR officer, and has to show that cover is in force —
 * on a handset with one bar and no data left. So it renders from what MMKV
 * remembers, synchronously, and the network refreshes it afterwards if there is
 * any.
 *
 * The QR works the same way, and this is what that comment always described
 * and nothing implemented: the code is fetched and stored whenever there is
 * signal, and the screen draws whichever one it has. A card that says "could
 * not load" at a hospital gate is worse than no card at all, so the network is
 * never on the path between a member and their own code.
 *
 * The picture comes from the API as a data URI rather than being drawn here —
 * see CardQr. Drawing a 45-module code in React Native means a native SVG
 * module compiled for four ABIs, and this APK is already over its budget.
 */
export function CardScreen() {
  const t = useT()
  const held = rememberedCard()
  const { data: summary, live, failed } = useLive(useSummary(held ?? MEMBER_SUMMARY), held ?? MEMBER_SUMMARY)

  /*
   * The stored code first, and the fetched one when it arrives.
   *
   * Read synchronously on first render for the same reason the summary is: the
   * moment this screen matters most is the moment there is no signal, and a
   * spinner where the QR goes is the failure this whole screen exists to avoid.
   */
  const heldQr = rememberedQr()
  const { data: card, live: cardLive, failed: cardFailed } = useLive(
    useCard(PROTECTION_CARD),
    PROTECTION_CARD,
  )
  const gotFreshQr = cardLive && !cardFailed
  useEffect(() => {
    if (gotFreshQr && card.qrImage) rememberQr(card.qrImage)
  }, [gotFreshQr, card.qrImage])

  const qr = gotFreshQr ? card.qrImage : (heldQr ?? PROTECTION_CARD.qrImage)

  const stale = live && failed && held !== null

  return (
    <Screen>
      <Title>{t.card_title}</Title>
      <Sub>{t.card_sub}</Sub>

      <View style={s.card}>
        <Text style={s.brand}>CIVIL SERVANT PROTECT</Text>
        <Text style={s.name}>{summary.member.fullName}</Text>
        <Text style={s.cspId}>{summary.member.cspId}</Text>

        {/* The thing a gate actually scans. Sized generously: it is read off a
            scratched screen in daylight by a cheap reader. */}
        <View style={s.qrFrame}>
          <Image source={{ uri: qr }} style={s.qr} resizeMode="contain" fadeDuration={0} />
        </View>

        <View style={s.divider} />

        <View style={s.pair}>
          <View>
            <Text style={s.smallKey}>COVER</Text>
            <Text style={s.smallValue}>{naira(summary.cover.sumAssuredMinor)}</Text>
          </View>
          <View>
            <Text style={s.smallKey}>IN FORCE SINCE</Text>
            <Text style={s.smallValue}>{dayFirst(summary.cover.inForceSince)}</Text>
          </View>
        </View>
      </View>

      <Kicker>THE DETAIL</Kicker>
      <Card style={{ paddingVertical: 2 }}>
        <RecordRow k="Plan" v={titleCase(summary.cover.tier)} />
        <RecordRow k="Employer" v={summary.sponsor.shortName} />
        <RecordRow k="Collected by" v={summary.sponsor.rail} />
        <RecordRow k="Monthly" v={naira(summary.cover.premiumMinor)} last />
      </Card>

      {stale && (
        <Card tone="ochre" style={{ marginTop: 14 }}>
          <Text style={{ color: C.ochreInk, fontSize: 13.5, lineHeight: 20 }}>
            No connection, so this is what your phone last saw. Your cover has not changed because
            this screen could not reach us.
          </Text>
        </Card>
      )}
    </Screen>
  )
}

const s = StyleSheet.create({
  card: { marginTop: 18, padding: 22, borderRadius: 16, backgroundColor: C.g },
  brand: { fontSize: 9.5, letterSpacing: 1.6, fontWeight: '700', color: '#A9CBB8' },
  name: { fontSize: 24, fontWeight: '700', color: '#F2F7F4', marginTop: 14, letterSpacing: -0.4 },
  cspId: { fontSize: 15, color: '#D7E6DD', marginTop: 3, letterSpacing: 1.1 },
  /*
   * A white mat around the code.
   *
   * Not decoration: the card is dark green, and a QR needs a light quiet zone
   * on all four sides or scanners refuse it. The PNG carries its own four
   * modules of margin; this makes sure the card's colour never reaches the
   * edge of it.
   */
  qrFrame: {
    alignSelf: 'flex-start', marginTop: 16, padding: 8,
    borderRadius: 10, backgroundColor: '#FFFFFF',
  },
  qr: { width: 132, height: 132 },
  divider: { height: 1, backgroundColor: 'rgba(242,247,244,.22)', marginVertical: 18 },
  pair: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  smallKey: { fontSize: 9.5, letterSpacing: 1.2, color: '#A9CBB8', fontWeight: '700' },
  smallValue: { fontSize: 17, fontWeight: '700', color: '#F2F7F4', marginTop: 3 },
})
