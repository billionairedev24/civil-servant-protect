import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { MEMBER_SUMMARY } from '../../../src/api/fixtures'
import { useSummary } from '../../../src/api/queries'
import { useLive } from '../../../src/api/live'
import { naira } from '../../../src/api/format'
import { payeeNames } from '../../../src/data/member'
import { C } from '../../../src/theme/tokens'
import { useT } from '../../../src/i18n'
import { rememberCard, rememberedCard } from '../storage'
import { Button, Card, Kicker, Pick, Screen, Sub, Title } from '../ui'

/**
 * What a member opens the app to find out.
 *
 * Three things, in the order they are asked: did my deduction go through, what
 * does my family get, and where is my claim. Everything else is a tap away.
 */
export function HomeScreen({ go }: { go: (to: 'card' | 'claim' | 'track' | 'cover') => void }) {
  const t = useT()

  /*
   * The remembered card first, then the fixture, then the network.
   *
   * A member on the road opening this at a hospital gate has no signal and
   * needs the cover figure now. `useLive` already falls back to the fixture
   * while a request is in flight — but a fixture is somebody else's money, so
   * what this device last saw for *this* member is the better stand-in when
   * there is one.
   */
  const held = rememberedCard()
  const { data: summary, live, failed } = useLive(useSummary(held ?? MEMBER_SUMMARY), held ?? MEMBER_SUMMARY)

  useEffect(() => {
    // Only what came from the server. Writing the fixture into MMKV would put
    // invented cover on a real handset, which is the worst version of this bug.
    if (live && !failed) rememberCard(summary)
  }, [live, failed, summary])

  /* 'confirmed' is the only state that means the money arrived. The others are
     a file that has not come back, a bank that has not answered, a deduction
     that is late, or cover in its grace period — and none of them should read
     as "paid" on the screen a member opens to check exactly that. */
  const deducted = summary.collection.state === 'confirmed'

  return (
    <Screen>
      <Text style={s.greeting}>{t.greeting}</Text>
      <Title>{summary.member.name}</Title>

      <Card tone={deducted ? 'green' : 'ochre'} style={{ marginTop: 16 }}>
        <Text style={[s.rowHead, { color: deducted ? C.gd : C.ochreInk }]}>
          {deducted ? t.pay_p_head : t.home_pay_head}
        </Text>
        <Text style={[s.rowSub, { color: deducted ? C.gInk : C.ochreInk }]}>
          {deducted ? t.home_pay_ok : t.home_pay_sub}
        </Text>
      </Card>

      {/* The number and the names. This card is most of the product's
          credibility, and both halves of it come from the member's record
          rather than from anything written here. */}
      <View style={s.cover}>
        <Text style={s.coverKicker}>{t.if_you_die}</Text>
        <Text style={s.coverAmount}>{naira(summary.cover.sumAssuredMinor)}</Text>
        <Text style={s.coverPaidTo}>
          {t.paid_to} <Text style={{ fontWeight: '700' }}>{payeeNames(t.and)}</Text>
        </Text>
        <Button
          label={t.see_cover}
          kind="secondary"
          onPress={() => go('cover')}
          style={{ marginTop: 16, alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 18 }}
        />
      </View>

      <Kicker>{t.claim_status}</Kicker>
      <Pick head={t.make_claim} sub={t.claim_sub} onPress={() => go('claim')} />
      <Pick head={t.claim_status} sub={t.claim_status_sub} onPress={() => go('track')} tone="green" />
      <Pick head={t.card_title} sub={t.card_sub} onPress={() => go('card')} />

      <Sub style={{ marginTop: 22 }}>{t.ussd_note}</Sub>
    </Screen>
  )
}

const s = StyleSheet.create({
  greeting: { fontSize: 13.5, color: C.faint, marginTop: 8 },
  rowHead: { fontSize: 15.5, fontWeight: '600' },
  rowSub: { fontSize: 13, lineHeight: 19, marginTop: 3 },
  cover: { marginTop: 18, padding: 20, borderRadius: 16, backgroundColor: C.g },
  coverKicker: { fontSize: 10, letterSpacing: 1.2, color: '#D7E6DD', fontWeight: '700' },
  coverAmount: { fontSize: 40, fontWeight: '700', letterSpacing: -1.4, color: '#F2F7F4', marginTop: 5 },
  coverPaidTo: { fontSize: 14, lineHeight: 21, color: '#D7E6DD', marginTop: 5 },
})
