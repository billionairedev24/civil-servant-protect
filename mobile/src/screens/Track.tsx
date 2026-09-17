import { StyleSheet, Text, View } from 'react-native'
import { CLAIM_FIXTURE, MY_CLAIMS } from '../../../src/api/fixtures'
import { useClaim, useMyClaims } from '../../../src/api/queries'
import { useLive } from '../../../src/api/live'
import { dayFirst, naira } from '../../../src/api/format'
import { docName } from '../../../src/components/docs'
import { C } from '../../../src/theme/tokens'
import { useT } from '../../../src/i18n'
import { Card, Kicker, Screen, Sub, Title } from '../ui'

/**
 * Where a claim has got to.
 *
 * Two reads, in order, exactly as the web does it: the app cannot ask for a
 * claim it does not know the reference of — somebody who opened one on another
 * phone, or last month, has nothing in this session to look it up with — so the
 * list comes first and the newest claim is the one being tracked.
 *
 * The timeline is the claim's own audit trail rather than a five-step picture
 * drawn beside it. That trail is the product's whole differentiator: every
 * stage time-stamped, and none of them editable afterwards.
 */
export function TrackScreen() {
  const t = useT()
  const { data: mine, provisional } = useLive(useMyClaims(MY_CLAIMS), MY_CLAIMS)
  // Not while the list is still the fixture standing in: a reference taken from
  // a fixture is a reference to a claim this member does not have, and the 404
  // reads as "your claim could not be loaded" when nothing was ever wrong.
  const ref = provisional ? '' : (mine.claims[0]?.ref ?? '')
  const { data: claim, failed } = useLive(useClaim(ref, CLAIM_FIXTURE), CLAIM_FIXTURE)

  return (
    <Screen>
      <Text style={s.ref}>{claim.ref}</Text>
      <Title>{naira(claim.amountMinor)}</Title>
      <Sub>{t.claim_status_sub}</Sub>

      {failed && (
        <Card tone="ochre">
          <Text style={{ color: C.ochreInk, fontSize: 13.5, lineHeight: 20 }}>
            This claim could not be loaded, so what is shown is not live. Nothing here has changed.
          </Text>
        </Card>
      )}

      <Kicker>WHAT HAS HAPPENED</Kicker>
      <View style={{ marginTop: 10 }}>
        {claim.stages.map((stage, i) => (
          <View key={`${stage.key}-${i}`} style={s.stage}>
            <View style={[s.dot, stage.state === 'done' && { backgroundColor: C.g }]} />
            <View style={{ flex: 1 }}>
              {/* The translated stage titles stay — a bereaved family should
                  read "We are checking them", not `assessing` — but which one
                  is current, and when each happened, comes from the record. */}
              <Text style={s.stageTitle}>{t.stages[i] ?? stage.key.replace(/_/g, ' ')}</Text>
              <Text style={s.stageWhen}>
                {stage.at ? dayFirst(stage.at) : (t.stage_when[i] ?? '')}
                {stage.note ? ` · ${stage.note}` : ''}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <Kicker>THE PAPERS</Kicker>
      <Card style={{ paddingVertical: 4 }}>
        {claim.documents.map((doc) => (
          <View key={doc.key} style={s.docRow}>
            <Text style={s.docName}>{docName(doc.key)}</Text>
            <Text style={[s.docState, { color: doc.state === 'received' ? C.g : C.ochre }]}>
              {doc.state === 'received' ? 'RECEIVED' : 'WAITING'}
            </Text>
          </View>
        ))}
      </Card>

      <Sub>{t.audit_note}</Sub>
    </Screen>
  )
}

const s = StyleSheet.create({
  ref: { fontSize: 12, letterSpacing: 1.4, color: C.faint, fontWeight: '700', marginTop: 8 },
  stage: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingBottom: 16 },
  dot: {
    width: 11, height: 11, borderRadius: 6, marginTop: 4,
    backgroundColor: C.ghost2,
  },
  stageTitle: { fontSize: 15.5, fontWeight: '600', color: C.ink },
  stageWhen: { fontSize: 12.5, lineHeight: 18, color: C.faint, marginTop: 2 },
  docRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    gap: 12, paddingVertical: 9,
  },
  docName: { fontSize: 14, color: C.ink, flexShrink: 1 },
  docState: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8 },
})
