import { StyleSheet, Text, View } from 'react-native'
import { LEDGER_FIXTURE } from '../../../src/api/fixtures'
import { useContributions } from '../../../src/api/queries'
import { useLive } from '../../../src/api/live'
import { dayFirst, naira, periodLabel } from '../../../src/api/format'
import { C } from '../../../src/theme/tokens'
import { useT } from '../../../src/i18n'
import { Card, Kicker, Screen, Sub, Title } from '../ui'
import type { LedgerRow } from '../../../src/api/types'

/**
 * Every naira, and what happened to it.
 *
 * This is the screen a member opens when a payslip looks wrong, so it shows the
 * ledger rather than a total: a month that failed, a month that was reversed and
 * a month that never arrived all look different here, and the difference is the
 * answer they came for.
 *
 * The totals are the server's. A client that adds up the rows it happens to have
 * will disagree with the record the moment there is a second page, and the
 * number it produces is somebody's contribution history.
 */
export function ContributionsScreen() {
  const t = useT()
  const { data: ledger, failed } = useLive(useContributions(LEDGER_FIXTURE), LEDGER_FIXTURE)

  return (
    <Screen>
      <Title>{t.more_i[0]}</Title>
      <Sub>
        {naira(ledger.totals.paidMinor)} over {ledger.totals.monthsCovered} months of cover.
      </Sub>

      {failed && (
        <Card tone="ochre">
          <Text style={s.warn}>
            This ledger could not be loaded, so it is not live. Nothing here has changed.
          </Text>
        </Card>
      )}

      <Kicker>MONTH BY MONTH</Kicker>
      <Card style={{ paddingVertical: 4 }}>
        {ledger.rows.map((row, i) => (
          <Row key={`${row.period}-${i}`} row={row} last={i === ledger.rows.length - 1} />
        ))}
        {ledger.rows.length === 0 && (
          <Text style={s.empty}>Nothing yet. The first deduction shows here once it arrives.</Text>
        )}
      </Card>
    </Screen>
  )
}

/** One month. The state is the loudest thing on it after the amount. */
function Row({ row, last }: { row: LedgerRow; last: boolean }) {
  const look = STATES[row.status]
  return (
    <View style={[s.row, last && { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.period}>{periodLabel(row.period)}</Text>
        <Text style={s.meta}>
          {SOURCES[row.source]}
          {row.receivedAt ? ` · ${dayFirst(row.receivedAt)}` : ''}
          {row.railRef ? ` · ${row.railRef}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {/* A reversal is shown as a negative rather than as a positive with a
            label. A member scanning this column is reading signs, not words. */}
        <Text style={[s.amount, { color: look.color }]}>
          {row.status === 'reversed' ? '−' : ''}
          {naira(row.amountMinor)}
        </Text>
        <Text style={[s.status, { color: look.color }]}>{look.label}</Text>
      </View>
    </View>
  )
}

const STATES: Record<LedgerRow['status'], { label: string; color: string }> = {
  confirmed: { label: 'RECEIVED', color: C.g },
  expected: { label: 'EXPECTED', color: C.ochre },
  failed: { label: 'DID NOT ARRIVE', color: C.clay },
  reversed: { label: 'REVERSED', color: C.clay },
}

const SOURCES: Record<LedgerRow['source'], string> = {
  payroll: 'From your salary',
  direct_debit: 'Direct debit',
  card: 'Card',
  transfer: 'Transfer',
  reversal: 'Reversal',
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EFEEE8',
  },
  period: { fontSize: 15, fontWeight: '600', color: C.ink },
  meta: { fontSize: 12.5, color: C.faint, marginTop: 2 },
  amount: { fontSize: 15.5, fontWeight: '700' },
  status: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.8, marginTop: 2 },
  empty: { fontSize: 13.5, color: C.mut, paddingVertical: 10 },
  warn: { color: C.ochreInk, fontSize: 13.5, lineHeight: 20 },
})
