import { useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { BENEFICIARY_SET } from '../../../src/api/fixtures'
import { useBeneficiaries, useConfirmBeneficiaries, useReplaceBeneficiaries } from '../../../src/api/queries'
import { useLive } from '../../../src/api/live'
import { dayFirst, titleCase } from '../../../src/api/format'
import { C } from '../../../src/theme/tokens'
import { EN_ONLY, fill, useT } from '../../../src/i18n'
import { Button, Card, Kicker, Screen, Sub, Title } from '../ui'

/**
 * Who gets paid, and in what proportion.
 *
 * The one screen where being wrong costs a family everything and nobody finds
 * out until it is too late to fix. So it does three things carefully: it shows
 * the shares as they stand, it refuses to save a set that does not add to 100,
 * and it records a confirmation with a date — which is the thing an insurer
 * asks for before paying out on a record nobody has looked at in six years.
 */
export function BeneficiariesScreen() {
  const t = useT()
  const { data: set, live, failed } = useLive(useBeneficiaries(BENEFICIARY_SET), BENEFICIARY_SET)
  const replace = useReplaceBeneficiaries()
  const confirm = useConfirmBeneficiaries()

  /** Edits held locally until saved; `null` means "showing what the server has". */
  const [draft, setDraft] = useState<{ id: string; name: string; relation: string; msisdn: string | null; sharePct: number }[] | null>(null)
  const people = draft ?? set.people

  const total = people.reduce((sum, person) => sum + person.sharePct, 0)
  const balanced = total === 100

  /*
   * Named, and holding nothing.
   *
   * Shares adding to 100 is not the same as everybody on the list being paid:
   * the seeded member has a son at 0%, which balances perfectly and leaves him
   * with nothing. A member who put him on the list meant something by it, and
   * the arithmetic check alone would have let them confirm it and never know.
   */
  const unshared = people.filter((person) => person.sharePct === 0)

  const setShare = (id: string, value: string) => {
    const share = Math.max(0, Math.min(100, Number(value.replace(/\D/g, '')) || 0))
    setDraft(people.map((p) => (p.id === id ? { ...p, sharePct: share } : p)))
  }

  const save = () => {
    if (!draft || !balanced || replace.isPending) return
    replace.mutate(
      draft.map((p) => ({
        name: p.name,
        relation: p.relation,
        msisdn: p.msisdn ?? undefined,
        sharePct: p.sharePct,
      })),
      { onSuccess: () => setDraft(null) },
    )
  }

  return (
    <Screen>
      <Title>{t.benes_title}</Title>
      <Sub>{t.benes_sub}</Sub>

      {failed && (
        <Card tone="ochre">
          <Text style={s.warn}>
            This list could not be loaded, so it is not live. Nothing has changed.
          </Text>
        </Card>
      )}

      {people.map((person) => (
        <Card key={person.id}>
          <View style={s.row}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.name}>{person.name}</Text>
              <Text style={s.meta}>
                {titleCase(person.relation)}
                {person.msisdn ? ` · ${person.msisdn}` : ` · ${EN_ONLY.benes_no_number}`}
              </Text>
            </View>
            <View style={s.shareBox}>
              <TextInput
                style={s.share}
                value={String(person.sharePct)}
                onChangeText={(v) => setShare(person.id, v)}
                keyboardType="number-pad"
                maxLength={3}
                accessibilityLabel={`${person.name}'s share, per cent`}
                editable={live}
              />
              <Text style={s.pct}>%</Text>
            </View>
          </View>
        </Card>
      ))}

      {/* The arithmetic, stated rather than silently corrected. A set that does
          not add to 100 is a set the server refuses, and saying so here is the
          difference between a fixable mistake and a rejected save. */}
      <Text style={[s.total, { color: balanced ? C.g : C.clay }]}>
        {balanced ? 'Shares add to 100%.' : `Shares add to ${total}% — they must add to 100%.`}
      </Text>

      {unshared.length > 0 && (
        <Card tone="ochre">
          <Text style={s.warn}>
            {unshared.length === 1
              ? fill(EN_ONLY.benes_unshared_one, { name: unshared[0].name })
              : fill(EN_ONLY.benes_unshared_many, {
                  names: unshared.map((p) => p.name).join(', '),
                })}
          </Text>
        </Card>
      )}

      {draft && (
        <>
          <Button
            label={replace.isPending ? 'Saving…' : 'Save this split'}
            onPress={save}
            disabled={!balanced}
            busy={replace.isPending}
            style={{ marginTop: 14 }}
          />
          <Button label="Undo my changes" kind="quiet" onPress={() => setDraft(null)} style={{ marginTop: 4 }} />
        </>
      )}

      {replace.isError && (
        <Card tone="clay">
          <Text style={s.warnClay}>
            {replace.error instanceof Error ? replace.error.message : 'That was refused.'}
          </Text>
        </Card>
      )}

      {!draft && (
        <>
          <Kicker>{EN_ONLY.beneconf_badge}</Kicker>
          <Card tone={set.lastConfirmedAt ? 'green' : 'ochre'}>
            <Text style={s.confirmHead}>
              {set.lastConfirmedAt
                ? `Last confirmed ${dayFirst(set.lastConfirmedAt)}`
                : EN_ONLY.beneconf_title}
            </Text>
            <Text style={s.confirmBody}>{EN_ONLY.beneconf_ignore_body}</Text>
            <Button
              label={confirm.isSuccess ? 'Confirmed' : EN_ONLY.beneconf_yes}
              kind="secondary"
              onPress={() => !confirm.isPending && confirm.mutate()}
              busy={confirm.isPending}
              disabled={confirm.isSuccess}
              style={{ marginTop: 14 }}
            />
          </Card>
          <Sub>{EN_ONLY.beneconf_footnote}</Sub>
        </>
      )}

      {/* Adding and removing people is not here yet — see the README. Changing a
          share is safe on a small screen; retyping a name and a relation on one
          is how a beneficiary ends up recorded as "Emek". */}
      <Sub>Adding or removing someone is on the web app for now — see the README.</Sub>
    </Screen>
  )
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 16, fontWeight: '600', color: C.ink },
  meta: { fontSize: 13, color: C.mut, marginTop: 2 },
  shareBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  share: {
    minWidth: 58, minHeight: 44, borderWidth: 1, borderColor: C.line3, borderRadius: 9,
    backgroundColor: C.surface, textAlign: 'center', fontSize: 18, fontWeight: '700', color: C.ink,
  },
  pct: { fontSize: 15, color: C.mut },
  total: { fontSize: 14, fontWeight: '600', marginTop: 12 },
  warn: { color: C.ochreInk, fontSize: 13.5, lineHeight: 20 },
  warnClay: { color: C.clayInk, fontSize: 13.5, lineHeight: 20 },
  confirmHead: { fontSize: 15.5, fontWeight: '600', color: C.ink },
  confirmBody: { fontSize: 13, lineHeight: 19, color: C.mut, marginTop: 4 },
})
