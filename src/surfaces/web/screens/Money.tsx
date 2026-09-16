import { Icon } from '../../../components/Icon'
import { Kicker, Mono } from '../../../components/primitives'
import { C, MONO } from '../../../theme/tokens'
import { BENE_RULES, WEB_BENEFICIARIES, ledgerFor, railRef } from '../data'
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
  const rows = ledgerFor(payroll, late)
  const template = '1fr 1.5fr 1.2fr .9fr 1fr'

  const stats = [
    { label: 'PAID TO DATE', value: '₦35,000', sub: t.across_months, alert: false },
    { label: 'MONTHS COVERED', value: '14 / 14', sub: 'No gap in cover since October 2025', alert: false },
    sponsorLate
      ? { label: 'OUTSTANDING', value: '₦2,500', sub: 'August, 9 days late with your sponsor', alert: true }
      : {
          label: 'NEXT COLLECTION',
          value: payroll ? '30 Sep' : '28 Sep',
          sub: payroll ? 'From the September payslip' : 'GTBank ••4471',
          alert: false,
        },
  ]

  const filters: [string, string][] = [
    ['All', '14'],
    ['Received', payroll ? '13' : '12'],
    [payroll ? 'Pending' : 'Retried', payroll ? '1' : '2'],
    ['Adjustments', '0'],
  ]

  return (
    <div className="rise" style={{ maxWidth: 830 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20 }}>
        <div>
          <PageTitle>{t.paid_title}</PageTitle>
          <PageSub>{t.paid_sub}</PageSub>
        </div>
        <button type="button" className="btn btn-secondary" style={{ height: 42, padding: '0 18px', fontSize: 14, gap: 8 }}>
          <Icon name="ph ph-download-simple" size={16} color={C.g} />
          {t.download}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginTop: 16 }}>
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
              key={r.month}
              style={{ display: 'grid', gridTemplateColumns: template, borderTop: '1px solid #EFEEE8', alignItems: 'center' }}
            >
              <div style={{ padding: '12px 16px', fontSize: 14, fontWeight: 600 }}>{r.month}</div>
              <div style={{ padding: '12px 16px', fontSize: 13.5, color: C.mut }}>
                {payroll ? sponsor.short : 'Direct debit · GTBank ••4471'}
              </div>
              <div style={{ padding: '12px 16px', fontFamily: MONO, fontSize: 12, color: C.faint }}>
                {railRef(sponsor)}
              </div>
              <div style={{ padding: '12px 16px', fontFamily: MONO, fontSize: 13.5, textAlign: 'right' }}>{r.amount}</div>
              <div style={{ padding: '12px 16px', textAlign: 'right' }}>
                <StatusPill status={r.status} />
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
  const template = '1.4fr .9fr 1.1fr 1fr 88px'

  return (
    <div className="rise" style={{ maxWidth: 830 }}>
      <PageTitle>{t.benes_title}</PageTitle>
      <PageSub style={{ lineHeight: 1.5, maxWidth: 600 }}>{t.benes_sub}</PageSub>

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
          {WEB_BENEFICIARIES.map((b) => (
            <div
              key={b.name}
              style={{ display: 'grid', gridTemplateColumns: template, borderTop: '1px solid #EFEEE8', alignItems: 'center' }}
            >
              <div style={{ padding: '13px 16px' }}>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600 }}>{b.name}</span>
                <Mono size={11} color={C.faint} style={{ display: 'block', marginTop: 1 }}>{b.id}</Mono>
              </div>
              <div style={{ padding: '13px 16px', fontSize: 13.5, color: C.mut }}>{b.rel}</div>
              <div style={{ padding: '13px 16px', fontFamily: MONO, fontSize: 13, color: C.mut }}>{b.phone}</div>
              <div style={{ padding: '13px 16px', textAlign: 'right' }}>
                <Mono size={15} weight={500}>{b.share}</Mono>
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
              borderTop: '1.5px solid #DDE9E2', background: C.gTint, alignItems: 'center',
            }}
          >
            <div style={{ padding: '12px 16px', fontSize: 13.5, fontWeight: 600, color: C.gd, gridColumn: 'span 3' }}>
              {t.shares_title}
            </div>
            <div style={{ padding: '12px 16px', textAlign: 'right' }}>
              <Mono size={15} weight={600} color={C.gd}>100%</Mono>
            </div>
            <div style={{ padding: '12px 16px', textAlign: 'right' }}>
              <Icon name="ph-fill ph-check-circle" size={17} color={C.gd} />
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
          onClick={() => go('home')}
        >
          {t.confirm_correct}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 16 }}>
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
