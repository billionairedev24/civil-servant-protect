import { StyleSheet, Text, View } from 'react-native'
import { MEMBER_SUMMARY } from '../../../src/api/fixtures'
import { useSummary } from '../../../src/api/queries'
import { useLive } from '../../../src/api/live'
import { dayFirst, naira, titleCase } from '../../../src/api/format'
import { C } from '../../../src/theme/tokens'
import { useT } from '../../../src/i18n'
import { rememberedCard } from '../storage'
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
 * What it deliberately does not do is go and fetch a signed QR token. That
 * token expires, and a card that says "could not load" at a hospital gate is
 * worse than no card at all — so the verifiable payload is a thing the app
 * stores when it has signal, and this screen shows what it has.
 */
export function CardScreen() {
  const t = useT()
  const held = rememberedCard()
  const { data: summary, live, failed } = useLive(useSummary(held ?? MEMBER_SUMMARY), held ?? MEMBER_SUMMARY)

  const stale = live && failed && held !== null

  return (
    <Screen>
      <Title>{t.card_title}</Title>
      <Sub>{t.card_sub}</Sub>

      <View style={s.card}>
        <Text style={s.brand}>CIVIL SERVANT PROTECT</Text>
        <Text style={s.name}>{summary.member.fullName}</Text>
        <Text style={s.cspId}>{summary.member.cspId}</Text>

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
  divider: { height: 1, backgroundColor: 'rgba(242,247,244,.22)', marginVertical: 18 },
  pair: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  smallKey: { fontSize: 9.5, letterSpacing: 1.2, color: '#A9CBB8', fontWeight: '700' },
  smallValue: { fontSize: 17, fontWeight: '700', color: '#F2F7F4', marginTop: 3 },
})
