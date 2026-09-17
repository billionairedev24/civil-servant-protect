import { StyleSheet, Text, View } from 'react-native'
import { MEMBER_SUMMARY } from '../../../src/api/fixtures'
import { useSummary } from '../../../src/api/queries'
import { useLive } from '../../../src/api/live'
import { naira } from '../../../src/api/format'
import { LANGS, useT, type Lang } from '../../../src/i18n'
import { C } from '../../../src/theme/tokens'
import { rememberedCard } from '../storage'
import { Button, Card, Kicker, Pick, Screen, Sub, Title } from '../ui'

/**
 * Everything that is not one of the three things a member opens the app for.
 *
 * Including the language, which belongs here rather than only on a first-run
 * screen: the person who needs Hausa is not always the person who set the phone
 * up, and a member handing their handset to a relative to read a claim is the
 * normal case rather than the edge one.
 */
export function MoreScreen({
  lang,
  setLang,
  go,
  onSignOut,
}: {
  lang: Lang
  setLang: (l: Lang) => void
  go: (to: 'contrib' | 'benes' | 'card' | 'family') => void
  onSignOut: () => void
}) {
  const t = useT()
  const held = rememberedCard()
  const { data: summary } = useLive(useSummary(held ?? MEMBER_SUMMARY), held ?? MEMBER_SUMMARY)

  return (
    <Screen>
      <Title>{summary.member.name}</Title>
      <Sub>
        {summary.member.cspId} · {naira(summary.cover.premiumMinor)} a month
      </Sub>

      {/* `more_i[4]` is "Switch to HR officer view" — a control for reviewing the
          design, not something a member's app offers. Indices 0–3 and 5 are the
          real ones. */}
      <Kicker>{t.tabs[3]}</Kicker>
      <Pick head={t.more_i[0]} onPress={() => go('contrib')} />
      <Pick head={t.more_i[1]} onPress={() => go('benes')} />
      <Pick head={t.more_i[2]} onPress={() => go('card')} />
      <Pick head={t.more_i[3]} onPress={() => go('family')} />

      <Kicker>LANGUAGE</Kicker>
      <View style={s.langs}>
        {LANGS.map(([code, name]) => {
          const on = lang === code
          return (
            <Text
              key={code}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setLang(code as Lang)}
              style={[s.lang, on && { borderColor: C.g, backgroundColor: C.gTint, color: C.gd }]}
            >
              {name}
            </Text>
          )
        })}
      </View>
      {/*
        Said in English on purpose. The four translations are machine-drafted and
        have not had a native-speaker pass — insurance words are where they fail
        hardest — and somebody who switches deserves to know that before they
        read a sentence about what their family is owed.
      */}
      <Sub>
        Hausa, Yorùbá, Igbo and Pidgin are drafts awaiting a translator. English is the checked one.
      </Sub>

      <Kicker>THIS PHONE</Kicker>
      <Card>
        <Text style={s.note}>
          Your protection card is saved here and opens with no network. Signing out removes it from
          this handset.
        </Text>
      </Card>
      <Button label={t.more_i[5]} kind="secondary" onPress={onSignOut} style={{ marginTop: 14 }} />
    </Screen>
  )
}

const s = StyleSheet.create({
  langs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  lang: {
    minHeight: 44, paddingHorizontal: 16, paddingVertical: 11,
    borderWidth: 1.5, borderColor: C.line3, borderRadius: 10,
    backgroundColor: C.white, color: C.ink, fontSize: 15, fontWeight: '600',
    overflow: 'hidden',
  },
  note: { fontSize: 13.5, lineHeight: 20, color: C.mut },
})
