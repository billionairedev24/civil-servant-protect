import { Icon } from '../../../components/Icon'
import { Kicker, Mono } from '../../../components/primitives'
import { C, MONO } from '../../../theme/tokens'
import { BENE_RULES, railRef } from '../data'
import { BENEFICIARY_SET, LEDGER_FIXTURE, MEMBER_SUMMARY } from '../../../api/fixtures'
import {
  useBeneficiaries, useConfirmBeneficiaries, useContributions, useSummary,
} from '../../../api/queries'
import { NotLive, dayFirst, naira, periodLabel, useLive } from '../../../api/live'
import { PageSub, PageTitle, Panel, StatusPill, Table, TableHead } from '../../../components/surface'
import { useWeb } from '../state'

/**
 * Contributions. The whole ledger in one table — the phone can only show a
 * sparkline and the last four rows.
 *
 * The framing matters as much as the data: a missing month is almost never the
 * member's fault on a payroll rail, and the screen says so rather than leaving
 * them to assume they are in arrears.
 */
export function WebContributions() {
  const { t, sponsor, late, filter, set } = useWeb()
  const payroll = sponsor.payroll
  const sponsorLate = late && payroll
  const { data: ledger, failed } = useLive(useContributions(LEDGER_FIXTURE), LEDGER_FIXTURE)
  const { data: summary } = useLive(useSummary(MEMBER_SUMMARY), MEMBER_SUMMARY)
  const template = '1fr 1.5fr 1.2fr .9fr 1fr'

  /* Statuses the member reads, from the row's own state and source. A month the
     card fallback recovered is "Retried", not "Received": it did arrive, but
     not the way it was supposed to, and that is the difference this screen
     exists to show. */
  const statusOf = (r: (typeof ledger.rows)[number]): 'Received' | 'Pending' | 'Retried' =>
    r.status !== 'confirmed' ? 'Pending' : r.source === 'card' ? 'Retried' : 'Received'

  const received = ledger.rows.filter((r) => statusOf(r) === 'Received').length
  const retried = ledger.rows.filter((r) => statusOf(r) === 'Retried').length
  const pending = ledger.rows.filter((r) => statusOf(r) === 'Pending').length
  const outstandingMinor = ledger.rows.find((r) => r.status === 'confirmed')?.amountMinor ?? 0

  const rows =
    filter === 0
      ? ledger.rows
      : ledger.rows.filter((r) => statusOf(r) === (['', 'Received', payroll ? 'Pending' : 'Retried'][filter]))

  const stats = [
    { label: 'PAID TO DATE', value: naira(ledger.totals.paidMinor), sub: t.across_months, alert: false },
    {
      label: 'MONTHS COVERED',
      value: `${ledger.totals.monthsCovered} / ${ledger.rows.length}`,
      sub: `No gap in cover since ${periodLabel(ledger.rows[ledger.rows.length - 1]?.period)}`,
      alert: false,
    },
    sponsorLate
      ? {
          label: 'OUTSTANDING',
          value: naira(outstandingMinor),
          sub: `${periodLabel(summary.collection.lastPeriod)}, not yet sent by your sponsor`,
          alert: true,
        }
      : {
          label: 'NEXT COLLECTION',
          value: dayFirst(summary.collection.nextDate),
          sub: payroll ? 'From the next payslip' : 'GTBank ••4471',
          alert: false,
        },
  ]

  const filters: [string, string][] = [
    ['All', String(ledger.rows.length)],
    ['Received', String(received)],
    [payroll ? 'Pending' : 'Retried', String(payroll ? pending : retried)],
    ['Adjustments', String(ledger.rows.filter((r) => r.status === 'reversed').length)],
  ]

  return (
    <div className="rise page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20 }}>
        <div>
          <PageTitle>{t.paid_title}</PageTitle>
          <PageSub>{payroll ? t.paid_sub : t.paid_sub_self}</PageSub>
        </div>
        <button type="button" className="btn btn-secondary" style={{ height: 42, padding: '0 18px', fontSize: 14, gap: 8 }}>
          <Icon name="ph ph-download-simple" size={16} color={C.g} />
          {t.download}
        </button>
      </div>

      {failed && <NotLive what="Your contributions" />}

      <div className="cards" style={{ marginTop: 16 }}>
        {stats.map((s) => (
          <Panel key={s.label} pad={17}>
            <Kicker size={9.5}>{s.label}</Kicker>
            <Mono size={23} weight={500} color={s.alert ? C.ochre : C.ink} style={{ display: 'block', marginTop: 6 }}>
              {s.value}
            </Mono>
            <div style={{ fontSize: 12.5, lineHeight: 1.45, color: C.faint, marginTop: 3 }}>{s.sub}</div>
          </Panel>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 16, flexWrap: 'wrap' }}>
        {filters.map(([label, n], i) => {
          const on = filter === i
          return (
            <button
              key={label}
              type="button"
              className="chip"
              onClick={() => set({ filter: i })}
              style={{
                padding: '6px 13px',
                border: `1.5px solid ${on ? C.g : C.line2}`,
                background: on ? C.gTint : C.white,
                color: on ? C.gd : C.mut,
                fontSize: 12.5, fontWeight: on ? 600 : 500,
              }}
            >
              {label}
              <Mono size={10.5} color={C.faint}>{n}</Mono>
            </button>
          )
        })}
      </div>

      <div style={{ marginTop: 12 }}>
        <Table>
          <TableHead
            template={template}
            columns={[
              { label: 'MONTH' },
              { label: 'SOURCE' },
              { label: 'REFERENCE' },
              { label: 'AMOUNT', align: 'right' },
              { label: 'STATUS', align: 'right' },
            ]}
          />
          {rows.map((r) => (
            <div
              key={r.period}
              style={{ display: 'grid', gridTemplateColumns: template, borderTop: '1px solid #EFEEE8', alignItems: 'center' }}
            >
              <div style={{ padding: '12px 16px', fontSize: 14, fontWeight: 600 }}>{periodLabel(r.period)}</div>
              <div style={{ padding: '12px 16px', fontSize: 13.5, color: C.mut }}>
                {/* What actually collected it, not what usually does. A card
                    fallback on a payroll rail is the interesting row. */}
                {r.source === 'card'
                  ? 'Card fallback'
                  : payroll
                    ? sponsor.short
                    : 'Direct debit · GTBank ••4471'}
              </div>
              <div style={{ padding: '12px 16px', fontFamily: MONO, fontSize: 12, color: C.faint }}>
                {r.railRef ?? railRef(sponsor)}
              </div>
              <div style={{ padding: '12px 16px', fontFamily: MONO, fontSize: 13.5, textAlign: 'right' }}>
                {naira(r.status === 'confirmed' ? r.amountMinor : outstandingMinor)}
              </div>
              <div style={{ padding: '12px 16px', textAlign: 'right' }}>
                <StatusPill status={statusOf(r)} />
              </div>
            </div>
          ))}
        </Table>
      </div>

      <div style={{ marginTop: 14, padding: '15px 17px', borderRadius: 11, background: C.white, border: `1px solid ${C.line}` }}>
        <div style={{ fontSize: 14.5, fontWeight: 600 }}>
          {payroll ? 'A month missing here is almost never your fault' : 'A failed debit is retried before anything changes'}
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: C.mut, marginTop: 4 }}>
          {payroll
            ? `If a row says Pending, the sponsor has not sent that schedule line yet. Your cover runs for 60 days regardless, and we chase ${sponsor.org} — not you.`
            : 'We retry on the 3rd and the 10th. Only after both fail does the 60-day grace period start, and you are told by SMS each time.'}
        </div>
        <button type="button" className="btn btn-secondary" style={{ marginTop: 11, height: 38, padding: '0 16px', fontSize: 13.5 }}>
          Ask my sponsor about this month
        </button>
      </div>
    </div>
  )
}

/**
 * Beneficiaries manager, with the 100% validator made explicit. Stale or
 * unbalanced nominations are what turn a 20-day claim into a 12-month dispute.
 */
export function WebBeneficiaries() {
  const { t, go } = useWeb()
  const { data: nominated, failed } = useLive(useBeneficiaries(BENEFICIARY_SET), BENEFICIARY_SET)
  const confirm = useConfirmBeneficiaries()
  const total = nominated.people.reduce((sum, b) => sum + b.sharePct, 0)
  const balanced = total === 100
  const template = '1.4fr .9fr 1.1fr 1fr 88px'

  return (
    <div className="rise page">
      <PageTitle>{t.benes_title}</PageTitle>
      <PageSub style={{ lineHeight: 1.5, maxWidth: 600 }}>{t.benes_sub}</PageSub>

      {failed && <NotLive what="Who you have named" />}

      <div style={{ marginTop: 18 }}>
        <Table>
          <TableHead
            template={template}
            columns={[
              { label: 'NAME' },
              { label: 'RELATION' },
              { label: 'PHONE' },
              { label: 'SHARE', align: 'right' },
              { label: '', align: 'right' },
            ]}
          />
          {nominated.people.map((b) => (
            <div
              key={b.id}
              style={{ display: 'grid', gridTemplateColumns: template, borderTop: '1px solid #EFEEE8', alignItems: 'center' }}
            >
              <div style={{ padding: '13px 16px' }}>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600 }}>{b.name}</span>
                {/* Whether we hold an identity document, never the number. The
                    NIN is L3 and does not leave the server — see Nin.java. A
                    minor is on file with a birth certificate instead. */}
                <Mono size={11} color={C.faint} style={{ display: 'block', marginTop: 1 }}>
                  {b.ninOnFile ? 'NIN on file' : 'Birth cert. on file'}
                </Mono>
              </div>
              <div style={{ padding: '13px 16px', fontSize: 13.5, color: C.mut }}>{b.relation}</div>
              <div style={{ padding: '13px 16px', fontFamily: MONO, fontSize: 13, color: C.mut }}>
                {b.msisdn ?? '—'}
              </div>
              <div style={{ padding: '13px 16px', textAlign: 'right' }}>
                <Mono size={15} weight={500}>{b.sharePct}%</Mono>
              </div>
              <div style={{ padding: '13px 16px', textAlign: 'right' }}>
                <button
                  type="button"
                  className="btn-inline"
                  style={{ fontSize: 13 }}
                >
                  Edit
                </button>
              </div>
            </div>
          ))}

          {/* The validator is a table row, not a toast — it is part of the record. */}
          <div
            style={{
              display: 'grid', gridTemplateColumns: template,
              borderTop: `1.5px solid ${balanced ? '#DDE9E2' : C.ochreBorder}`,
              background: balanced ? C.gTint : C.ochreBg, alignItems: 'center',
            }}
          >
            <div
              style={{
                padding: '12px 16px', fontSize: 13.5, fontWeight: 600,
                color: balanced ? C.gd : C.ochreInk, gridColumn: 'span 3',
              }}
            >
              {t.shares_title}
            </div>
            <div style={{ padding: '12px 16px', textAlign: 'right' }}>
              <Mono size={15} weight={600} color={balanced ? C.gd : C.ochreInk}>{total}%</Mono>
            </div>
            <div style={{ padding: '12px 16px', textAlign: 'right' }}>
              <Icon
                name={balanced ? 'ph-fill ph-check-circle' : 'ph-fill ph-warning-circle'}
                size={17}
                color={balanced ? C.gd : C.ochre}
              />
            </div>
          </div>
        </Table>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary" style={{ height: 44, padding: '0 20px', fontSize: 15, gap: 8 }}>
          <Icon name="ph ph-user-plus" size={17} color={C.g} />
          {t.add_person}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          style={{ height: 44, padding: '0 22px', fontSize: 15 }}
          /* The server refuses a set that does not total 100 with a deferred
             constraint trigger. Saying so here means the member fixes it while
             the form is still in front of them. */
          disabled={!balanced || confirm.isPending}
          title={balanced ? undefined : 'Shares must total exactly 100% before this can be confirmed.'}
          onClick={() => confirm.mutate(undefined, { onSuccess: () => go('home') })}
        >
          {confirm.isPending ? '…' : t.confirm_correct}
        </button>
      </div>

      <div className="cards" style={{ marginTop: 16 }}>
        <Panel pad={16} style={{ borderRadius: 11 }}>
          <Kicker size={9.5}>VALIDATION</Kicker>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 9 }}>
            {BENE_RULES.map((r) => (
              <div key={r.text} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Icon
                  name={r.ok ? 'ph-fill ph-check-circle' : 'ph ph-info'}
                  size={15}
                  color={r.ok ? C.g : C.faint}
                  style={{ marginTop: 2 }}
                />
                <span style={{ fontSize: 13, lineHeight: 1.45, color: C.mut }}>{r.text}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel pad={16} style={{ borderRadius: 11 }}>
          <Kicker size={9.5}>LAST CONFIRMED</Kicker>
          <div style={{ fontSize: 15, fontWeight: 600, marginTop: 7 }}>14 months ago · 22 June 2025</div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: C.mut, marginTop: 5 }}>
            {t.ask_again} A change here is written to an append-only log that the sponsor cannot edit, and the member
            sees the diff on their phone.
          </div>
        </Panel>
      </div>
    </div>
  )
}
