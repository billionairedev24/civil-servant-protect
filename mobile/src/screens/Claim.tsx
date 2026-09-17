import { useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import { useClaimWizard } from '../../../src/api/claim'
import { docName } from '../../../src/components/docs'
import { C } from '../../../src/theme/tokens'
import { EN_ONLY, fill, useT } from '../../../src/i18n'
import { Button, Card, Kicker, Pick, Screen, Sub, Title } from '../ui'
import { pickDocument } from '../documents'

/**
 * Reporting a death, from a phone.
 *
 * The same four steps and the same `useClaimWizard` as the web — what happened,
 * who for, the papers, done. Only the document step is really different: the
 * web takes a dragged-in scan and this takes a photograph, which is what a
 * family actually has at the point they need to do this.
 */
export function ClaimScreen({ onDone }: { onDone: () => void }) {
  const t = useT()
  const claim = useClaimWizard()
  const [step, setStep] = useState(0)
  const [type, setType] = useState(0)
  const [relation, setRelation] = useState(0)

  const docs = claim.ref ? claim.requiredDocs : []
  const sending = Object.values(claim.docState).includes('sending')

  const next = async () => {
    // The claim comes into existence here: the server decides which papers it
    // wants, and cannot decide before it knows what happened and who is asking.
    if (step === 1) {
      const opened = await claim.open(type, relation)
      if (!opened && claim.error) return
    }
    if (step < 3) return setStep(step + 1)
    claim.reset()
    setStep(0)
    onDone()
  }

  const attach = async (docKey: string) => {
    const file = await pickDocument()
    if (!file) return
    await claim.send(docKey, file)
  }

  return (
    <Screen>
      <Text style={s.step}>{step + 1} of 4</Text>
      <Title>{t.cl_q[step]}</Title>
      {/* Not on the last step: `cl_h[4]` carries the mockup's claim reference
          in all five languages, which would print above the member's real one.
          The web screen has the same guard and the same note. */}
      {step < 3 && <Sub>{t.cl_h[step]}</Sub>}

      {step === 0 && (
        <View style={{ marginTop: 8 }}>
          {t.cl_o[0].map((label, i) => (
            <Pick key={label} head={label} onPress={() => setType(i)} tone={type === i ? 'green' : 'plain'} />
          ))}
        </View>
      )}

      {step === 1 && (
        <View style={{ marginTop: 8 }}>
          {t.cl_o[1].map((label, i) => (
            <Pick
              key={label}
              head={label}
              onPress={() => setRelation(i)}
              tone={relation === i ? 'green' : 'plain'}
            />
          ))}
        </View>
      )}

      {step === 2 && (
        <View style={{ marginTop: 8 }}>
          {docs.length === 0 ? (
            <Card tone="ochre">
              <Text style={{ color: C.ochreInk, fontSize: 13.5, lineHeight: 20 }}>
                This build has no API address, so there is no claim to attach papers to. Set
                CSP_API_URL and rebuild.
              </Text>
            </Card>
          ) : (
            docs.map((key) => {
              const state = claim.docState[key] ?? 'waiting'
              const done = state === 'received'
              return (
                <Card key={key} tone={done ? 'green' : state === 'failed' ? 'clay' : 'plain'}>
                  <View style={s.docRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.docName}>{docName(key)}</Text>
                      <Text style={s.docState}>
                        {done
                          ? EN_ONLY.doc_received
                          : state === 'failed'
                            ? EN_ONLY.doc_failed
                            : state === 'sending'
                              ? EN_ONLY.doc_sending
                              : 'Photograph it'}
                      </Text>
                    </View>
                    <Button
                      label={done ? EN_ONLY.doc_replace : EN_ONLY.doc_add}
                      kind="secondary"
                      busy={state === 'sending'}
                      onPress={() => void attach(key)}
                      style={{ minHeight: 44, paddingHorizontal: 16 }}
                    />
                  </View>
                </Card>
              )
            })
          )}

          {docs.length > 0 && (
            <Text style={[s.outstanding, { color: claim.outstanding === 0 ? C.g : C.ochre }]}>
              {claim.outstanding === 0
                ? EN_ONLY.doc_all_in
                : claim.outstanding === 1
                  ? EN_ONLY.doc_outstanding_one
                  : fill(EN_ONLY.doc_outstanding_many, { n: String(claim.outstanding) })}
            </Text>
          )}
          <Sub>{EN_ONLY.doc_photograph_note}</Sub>
        </View>
      )}

      {step === 3 && (
        <View style={{ marginTop: 14 }}>
          <Card tone="green">
            <Kicker>{t.claim_ref}</Kicker>
            <Text style={s.ref}>{claim.ref ?? '—'}</Text>
            {claim.funeralAdvanceRef ? (
              <Text style={s.advance}>
                {t.funeral_first} {claim.funeralAdvanceRef}
              </Text>
            ) : null}
          </Card>
          <Sub>{t.assessor_note}</Sub>
        </View>
      )}

      {claim.error ? (
        <Card tone="clay" style={{ marginTop: 14 }}>
          <Text style={{ color: C.clayInk, fontSize: 13.5, lineHeight: 20 }}>{claim.error}</Text>
        </Card>
      ) : null}

      <View style={{ flex: 1 }} />

      <Button
        label={claim.opening ? EN_ONLY.claim_opening : t.cl_cta[step]}
        onPress={() => {
          if (step === 2 && docs.length > 0 && claim.outstanding > 0) {
            // A claim finished with papers outstanding sits at
            // documents_pending and nobody is told why.
            Alert.alert(EN_ONLY.claim_send_first)
            return
          }
          void next()
        }}
        busy={claim.opening || sending}
        style={{ marginTop: 20 }}
      />
      {step > 0 && step < 3 && (
        <Button label={t.back} kind="quiet" onPress={() => setStep(step - 1)} style={{ marginTop: 4 }} />
      )}
    </Screen>
  )
}

const s = StyleSheet.create({
  step: { fontSize: 12, letterSpacing: 1, color: C.faint, fontWeight: '700', marginTop: 8 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  docName: { fontSize: 15.5, fontWeight: '600', color: C.ink },
  docState: { fontSize: 13, color: C.mut, marginTop: 2 },
  outstanding: { fontSize: 14, fontWeight: '600', marginTop: 12 },
  ref: { fontSize: 22, fontWeight: '700', color: C.gd, marginTop: 6, letterSpacing: 0.5 },
  advance: { fontSize: 14, color: C.gInk, marginTop: 8 },
})
