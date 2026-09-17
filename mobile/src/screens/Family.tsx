import { StyleSheet, Text, View } from 'react-native'
import { DEPENDANTS } from '../../../src/api/fixtures'
import { useDependants, useRemoveDependant } from '../../../src/api/queries'
import { useLive } from '../../../src/api/live'
import { dayFirst, naira, titleCase } from '../../../src/api/format'
import { C } from '../../../src/theme/tokens'
import { useT } from '../../../src/i18n'
import { Button, Card, Kicker, Screen, Sub, Title } from '../ui'

/**
 * Who else is covered, and what it costs.
 *
 * Every price here is the server's. Nothing on this screen multiplies anything:
 * a band is decided by age at the point of joining, the premium is quoted per
 * person, and the new family total comes back from the API after each change.
 * A client that worked out the total itself would be confidently wrong about
 * money on the screen where somebody decides what to pay.
 */
export function FamilyScreen() {
  const t = useT()
  const { data, live, failed } = useLive(useDependants(DEPENDANTS), DEPENDANTS)
  const remove = useRemoveDependant()

  const covered = data.dependants.filter((d) => d.active)
  const former = data.dependants.filter((d) => !d.active)
  const monthly = covered.reduce((sum, d) => sum + d.premiumMinor, 0)

  return (
    <Screen>
      <Title>{t.fam_title}</Title>
      <Sub>{t.fam_sub}</Sub>

      {failed && (
        <Card tone="ochre">
          <Text style={s.warn}>
            This could not be loaded, so it is not live. Nobody has been added or removed.
          </Text>
        </Card>
      )}

      <Kicker>COVERED NOW</Kicker>
      {covered.map((person) => (
        <Card key={person.id}>
          <View style={s.row}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.name}>{person.name}</Text>
              <Text style={s.meta}>
                {titleCase(person.relation)} · born {dayFirst(person.dob)}
              </Text>
              <Text style={s.cover}>{naira(person.sumAssuredMinor)} of cover</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 8 }}>
              <Text style={s.premium}>{naira(person.premiumMinor)}/mo</Text>
              <Button
                label="Remove"
                kind="secondary"
                disabled={!live || remove.isPending}
                onPress={() => remove.mutate(person.id)}
                style={{ minHeight: 44, paddingHorizontal: 14 }}
              />
            </View>
          </View>
        </Card>
      ))}
      {covered.length === 0 && <Sub>Nobody yet. Family cover is optional and you pay for it.</Sub>}

      <Text style={s.total}>
        {covered.length > 0 ? `${naira(monthly)} a month for ${covered.length} ${covered.length === 1 ? 'person' : 'people'}.` : ''}
      </Text>

      {remove.isSuccess && (
        <Card tone="green">
          <Text style={s.ok}>
            {remove.data.name} comes off. Cover runs to {dayFirst(remove.data.coveredUntil)} — that
            month is paid for — and from {dayFirst(remove.data.effectiveFrom)} you pay{' '}
            {naira(remove.data.newPremiumMinor)}.
          </Text>
        </Card>
      )}

      {remove.isError && (
        <Card tone="clay">
          <Text style={s.warnClay}>
            {remove.error instanceof Error ? remove.error.message : 'That was refused.'}
          </Text>
        </Card>
      )}

      {former.length > 0 && (
        <>
          <Kicker>NO LONGER COVERED</Kicker>
          {/* The rows stay. A dependant who was covered for three years and then
              taken off is part of this member's history, and deleting the row
              would delete the reason a past claim was paid. */}
          {former.map((person) => (
            <Card key={person.id} style={{ opacity: 0.7 }}>
              <Text style={s.name}>{person.name}</Text>
              <Text style={s.meta}>{titleCase(person.relation)} · cover ended</Text>
            </Card>
          ))}
        </>
      )}

      <Sub>Adding somebody is on the web app — it needs a name, a relation and a date of birth,
        and the server quotes the price before anything changes.</Sub>
    </Screen>
  )
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  name: { fontSize: 16, fontWeight: '600', color: C.ink },
  meta: { fontSize: 13, color: C.mut, marginTop: 2 },
  cover: { fontSize: 13, color: C.g, fontWeight: '600', marginTop: 3 },
  premium: { fontSize: 15, fontWeight: '700', color: C.ink },
  total: { fontSize: 14.5, fontWeight: '600', color: C.ink, marginTop: 12 },
  ok: { color: C.gd, fontSize: 13.5, lineHeight: 20 },
  warn: { color: C.ochreInk, fontSize: 13.5, lineHeight: 20 },
  warnClay: { color: C.clayInk, fontSize: 13.5, lineHeight: 20 },
})
