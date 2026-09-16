import { Icon } from '../../../components/Icon'
import { Kicker, Mono } from '../../../components/primitives'
import { TIER_NAMES, TIER_PRICES } from '../../../data/member'
import { C, MONO } from '../../../theme/tokens'
import {
  SCHEDULE_MATRIX, WEB_FAMILY, WEB_MEMBER, WEB_ONLY_COVER, ledgerFor,
} from '../data'
import { FeatureRow, PageSub, PageTitle, Panel, StatusPill, Table, TableHead } from '../../../components/surface'
import { useWeb } from '../state'

export function WebDashboard() {
  const { t, sponsor, late, go } = useWeb()
  const payroll = sponsor.payroll
  const ledger = ledgerFor(payroll, late).slice(0, 3)

  /* The banner shows whichever is more urgent: a sponsor that has not remitted,
     or the beneficiary confirmation that is overdue. */
  const sponsorLate = late && payroll
  const attn = sponsorLate
    ? {
        title: 'Your sponsor has not sent August yet',
        body: `${sponsor.org} is 9 days late with the August schedule. Your cover stays in force through the 60-day grace period.`,
        cta: 'What this means',
        to: 'contrib' as const,
      }
    : {
        title: t.confirm_benes,
        body: `${t.confirm_benes_sub} · shares must still add up to 100%`,
        cta: 'Review now',
        to: 'benes' as const,
      }

  const quick = [
    { label: t.confirm_benes, sub: '3 people · 100%', icon: 'ph ph-users-three', to: 'benes' as const },
    { label: t.card_title, sub: 'Print at A4', icon: 'ph ph-identification-card', to: 'card' as const },
    { label: t.paid_title, sub: '14 months', icon: 'ph ph-receipt', to: 'contrib' as const },
    { label: t.fam_title, sub: '3 dependants', icon: 'ph ph-house-line', to: 'family' as const },
  ]

  const stages = t.stages.slice(0, 3)
  const stageState = ['done', 'done', 'now'] as const

  return (
    <div className="rise" style={{ maxWidth: 830 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20 }}>
        <div>
          <PageTitle>
            {t.greeting}, {WEB_MEMBER.name.split(' ')[0]}
          </PageTitle>
          <PageSub>Standard plan · in force since 1 October 2025 · {sponsor.short}</PageSub>
        </div>
        <button
          type="button"
          className="btn"
          style={{
            height: 42, padding: '0 20px', border: `1.5px solid ${C.clay}`,
            background: C.white, color: C.clay, fontSize: 14, gap: 8,
          }}
          onClick={() => go('claim')}
        >
          <Icon name="ph ph-first-aid-kit" size={16} />
          {t.make_claim}
        </button>
      </div>

      <div
        style={{
          marginTop: 18, display: 'flex', alignItems: 'center', gap: 14, padding: '15px 17px',
          borderRadius: 11, background: C.ochreBg, border: `1px solid ${C.ochreBorder}`,
        }}
      >
        <Icon name="ph-fill ph-warning-circle" size={22} color={C.ochre} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#6E4800' }}>{attn.title}</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.45, color: C.ochre, marginTop: 2 }}>{attn.body}</div>
        </div>
        <button
          type="button"
          className="btn"
          style={{ height: 38, padding: '0 17px', border: 0, background: C.ochre, color: C.ochreBg, fontSize: 13.5 }}
          onClick={() => go(attn.to)}
        >
          {attn.cta}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 14, marginTop: 16 }}>
        <div style={{ padding: 22, borderRadius: 13, background: C.g, color: C.gTint }}>
          <Kicker size={9.5} color="rgba(241,246,243,.7)">{t.if_you_die}</Kicker>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-.03em', marginTop: 8 }}>₦5,000,000</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: 'rgba(241,246,243,.82)', marginTop: 6 }}>
            {t.paid_to} Chinedu, Ngozi and Amaka Okafor. {t.accident_amount} ₦10,000,000.
          </div>
          <button
            type="button"
            className="btn btn-on-green"
            style={{ marginTop: 16, height: 38, padding: '0 16px', fontSize: 13.5 }}
            onClick={() => go('benefits')}
          >
            {t.see_cover}
          </button>
        </div>

        <Panel pad={20} style={{ display: 'flex', flexDirection: 'column' }}>
          <Kicker size={9.5}>{payroll ? 'HOW YOU PAY' : 'YOUR DIRECT DEBIT'}</Kicker>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 9 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: sponsorLate ? C.ochre : C.g }} />
            <span style={{ fontSize: 17, fontWeight: 600 }}>
              {sponsorLate ? 'August not received' : payroll ? 'Deducted from payslip' : 'Debit collected'}
            </span>
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: C.mut, marginTop: 7 }}>
            {payroll
              ? `₦2,500 leaves your salary before it reaches you. ${sponsor.org} sends the schedule to us each month.`
              : '₦2,500 on the 28th from GTBank ••4471. Retried twice before your cover is touched.'}
          </div>
          <div style={{ flex: 1 }} />
          <Mono
            size={10.5}
            color={C.faint}
            style={{ display: 'block', lineHeight: 1.5, marginTop: 14, paddingTop: 12, borderTop: '1px solid #EFEEE8' }}
          >
            {sponsor.rail}
          </Mono>
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
        <Panel>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <div style={{ fontSize: 15.5, fontWeight: 600 }}>{t.paid_title}</div>
            <button
              type="button"
              onClick={() => go('contrib')}
              className="btn-inline"
                  style={{ fontSize: 13 }}
            >
              All
            </button>
          </div>
          <Mono size={26} weight={500} style={{ display: 'block', marginTop: 8 }}>₦35,000</Mono>
          <div style={{ fontSize: 13, color: C.faint }}>{t.across_months}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 12 }}>
            {ledger.map((r) => (
              <div
                key={r.month}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: '1px solid #EFEEE8' }}
              >
                <span style={{ fontSize: 13.5 }}>{r.month}</span>
                <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <Mono size={13} color={C.mut}>{r.amount}</Mono>
                  <StatusPill status={r.status} />
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 15.5, fontWeight: 600 }}>{t.claim_status}</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: C.mut, marginTop: 5 }}>{t.claim_status_sub}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 14 }}>
            {stages.map((title, i) => {
              const st = stageState[i]
              return (
                <div key={title} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <Icon
                    name={st === 'done' ? 'ph-fill ph-check-circle' : 'ph-fill ph-circle-notch'}
                    size={16}
                    color={C.g}
                  />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: st === 'now' ? 700 : 500 }}>
                    {title}
                  </span>
                  <Mono size={9.5} color={C.ghost}>{t.stage_when[i]}</Mono>
                </div>
              )
            })}
          </div>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: 14, alignSelf: 'flex-start', height: 38, padding: '0 17px', fontSize: 13.5 }}
            onClick={() => go('track')}
          >
            Open claim
          </button>
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginTop: 14 }}>
        {quick.map((q) => (
          <button
            key={q.label}
            type="button"
            className="pick"
            onClick={() => go(q.to)}
            style={{
              flexDirection: 'column', alignItems: 'flex-start', gap: 7, padding: 15,
              border: `1px solid ${C.line}`, borderRadius: 11, background: C.white,
            }}
          >
            <Icon name={q.icon} size={19} color={C.g} />
            <span style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.3 }}>{q.label}</span>
            <span style={{ fontSize: 11.5, lineHeight: 1.4, color: C.faint }}>{q.sub}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Cover detail — all four tiers side by side, which the phone shows one at a time. */
export function WebBenefits() {
  const { t, tier, sponsor } = useWeb()
  const payroll = sponsor.payroll
  const template = '1.6fr repeat(4,1fr)'

  return (
    <div className="rise" style={{ maxWidth: 830 }}>
      <PageTitle>{t.cover_title}</PageTitle>
      <PageSub>{t.cover_sub} · every tier side by side, which the phone shows one at a time</PageSub>

      <div style={{ marginTop: 18 }}>
        <Table>
          <div style={{ display: 'grid', gridTemplateColumns: template, background: C.gTint, borderBottom: '1px solid #DDE9E2' }}>
            <div style={{ padding: '11px 16px', fontFamily: MONO, fontSize: 9.5, letterSpacing: '.1em', color: C.g }}>
              BENEFIT
            </div>
            {TIER_NAMES.map((name, i) => (
              <div key={name} style={{ padding: '11px 12px', textAlign: 'right' }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: tier === i ? 700 : 500, color: tier === i ? C.gd : C.mut }}>
                  {name}
                </span>
                <Mono size={10} color={C.faint} style={{ display: 'block', marginTop: 1 }}>{TIER_PRICES[i]}</Mono>
              </div>
            ))}
          </div>

          {t.sched.map((label, r) => (
            <div
              key={label}
              style={{ display: 'grid', gridTemplateColumns: template, borderTop: '1px solid #EFEEE8', background: r % 2 ? '#FCFCFA' : C.white }}
            >
              <div style={{ padding: '12px 16px', fontSize: 14, fontWeight: 500 }}>{label}</div>
              {TIER_NAMES.map((name, c) => (
                <div
                  key={name}
                  style={{
                    padding: 12, textAlign: 'right', fontFamily: MONO, fontSize: 12.5,
                    fontWeight: tier === c ? 600 : 400, color: tier === c ? C.ink : C.mut,
                  }}
                >
                  {SCHEDULE_MATRIX[r]?.[c] ?? '—'}
                </div>
              ))}
            </div>
          ))}
        </Table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
        <Panel pad={18}>
          <Kicker size={9.5}>{t.change_plan}</Kicker>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 11 }}>
            {TIER_NAMES.map((name, i) =>
              i === tier ? null : (
                <div
                  key={name}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                    padding: '11px 13px', border: `1px solid ${C.line}`, borderRadius: 9,
                  }}
                >
                  <span>
                    <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600 }}>{name}</span>
                    <Mono size={11.5} color={C.mut} style={{ display: 'block', marginTop: 1 }}>{TIER_PRICES[i]}</Mono>
                  </span>
                  <button type="button" className="btn btn-secondary" style={{ height: 34, padding: '0 14px', fontSize: 12.5 }}>
                    {payroll ? 'Request through HR' : 'Change my debit'}
                  </button>
                </div>
              ),
            )}
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.faint, marginTop: 11 }}>
            {payroll
              ? t.plan_note
              : 'You pay this yourself, so a change takes effect on your next debit date — no HR approval needed.'}
          </div>
        </Panel>

        <Panel pad={18}>
          <Kicker size={9.5}>WEB-ONLY</Kicker>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 11 }}>
            {WEB_ONLY_COVER.map((w) => (
              <FeatureRow key={w.title} icon={w.icon} title={w.title} body={w.body} />
            ))}
          </div>
          <div
            style={{ marginTop: 13, paddingTop: 11, borderTop: '1px solid #EFEEE8', fontSize: 12, lineHeight: 1.5, color: C.faint }}
          >
            {t.disclaimer}
          </div>
        </Panel>
      </div>
    </div>
  )
}

/** Printable protection card. Web's version of the offline card: A4 and PDF. */
export function WebCard() {
  const { t, tier, sponsor } = useWeb()

  const actions = [
    { label: 'Print at A4', icon: 'ph ph-printer', primary: true },
    { label: 'Download PDF', icon: 'ph ph-file-pdf', primary: false },
    { label: t.share_hr, icon: 'ph ph-paper-plane-tilt', primary: false },
  ]

  return (
    <div className="rise" style={{ maxWidth: 830 }}>
      <PageTitle>{t.card_title}</PageTitle>
      <PageSub>Held on your account and printable here. {t.card_sub}</PageSub>

      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 16, marginTop: 18, alignItems: 'start' }}>
        <div style={{ padding: 24, borderRadius: 14, background: C.ink, color: C.surface }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
            <div>
              <Mono size={9.5} color="rgba(247,246,242,.55)" style={{ display: 'block', letterSpacing: '.13em' }}>
                CIVIL SERVANT PROTECT
              </Mono>
              <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-.02em', marginTop: 9 }}>
                {WEB_MEMBER.fullName}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(247,246,242,.7)', marginTop: 2 }}>
                {sponsor.org} · {WEB_MEMBER.grade}
              </div>
            </div>
            <div
              style={{
                width: 74, height: 74, borderRadius: 9, background: C.surface,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
              }}
            >
              <Icon name="ph ph-qr-code" size={52} color={C.ink} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 26, marginTop: 22, paddingTop: 16, borderTop: '1px solid rgba(247,246,242,.16)' }}>
            {[
              [t.csp_id, WEB_MEMBER.cspId],
              [t.in_force, WEB_MEMBER.inForce],
              ['TIER', TIER_NAMES[tier]],
            ].map(([k, v]) => (
              <div key={k}>
                <Mono size={9} color="rgba(247,246,242,.5)" style={{ display: 'block', letterSpacing: '.12em' }}>{k}</Mono>
                <Mono size={15} weight={500} style={{ display: 'block', marginTop: 3 }}>{v}</Mono>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Panel pad={18}>
            <div style={{ fontSize: 15.5, fontWeight: 600 }}>Print or save</div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: C.mut, marginTop: 4 }}>{t.scan_note}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 13 }}>
              {actions.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  className={`btn ${a.primary ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ height: 38, padding: '0 15px', fontSize: 13, gap: 7 }}
                >
                  <Icon name={a.icon} size={15} />
                  {a.label}
                </button>
              ))}
            </div>
            <div
              style={{ marginTop: 12, paddingTop: 11, borderTop: '1px solid #EFEEE8', fontSize: 12, lineHeight: 1.5, color: C.faint }}
            >
              Printed at A4, one card per sheet, with the QR at 30 mm so a hospital scanner reads it from paper.
            </div>
          </Panel>

          <div style={{ padding: 16, border: `1px dashed ${C.line9}`, borderRadius: 11, background: C.white }}>
            <Kicker size={9.5}>PHONE-ONLY, NOT ON WEB</Kicker>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: C.mut, marginTop: 5 }}>
              The offline card lives in the phone app — it is cached on the device and opens with no network. A
              browser cannot be relied on for that, so web offers print and PDF instead.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function WebFamily() {
  const { t, sponsor } = useWeb()
  const payroll = sponsor.payroll
  const template = '1.5fr 1fr 1fr 1fr 96px'

  return (
    <div className="rise" style={{ maxWidth: 830 }}>
      <PageTitle>{t.fam_title}</PageTitle>
      <PageSub>{t.fam_sub}</PageSub>

      <div style={{ marginTop: 18 }}>
        <Table>
          <TableHead
            template={template}
            columns={[
              { label: 'PERSON' },
              { label: 'RELATION' },
              { label: 'COVER', align: 'right' },
              { label: 'MONTHLY', align: 'right' },
              { label: '', align: 'right' },
            ]}
          />
          {WEB_FAMILY.map((f) => (
            <div
              key={f.name}
              style={{ display: 'grid', gridTemplateColumns: template, borderTop: '1px solid #EFEEE8', alignItems: 'center' }}
            >
              <div style={{ padding: '13px 16px' }}>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600 }}>{f.name}</span>
                <span style={{ display: 'block', fontSize: 12, color: C.faint }}>{f.dob}</span>
              </div>
              <div style={{ padding: '13px 16px', fontSize: 13.5, color: C.mut }}>{f.rel}</div>
              <div style={{ padding: '13px 16px', fontSize: 13.5, textAlign: 'right', fontFamily: MONO }}>{f.sum}</div>
              <div style={{ padding: '13px 16px', fontSize: 13.5, textAlign: 'right', fontFamily: MONO }}>{f.price}</div>
              <div style={{ padding: '13px 16px', textAlign: 'right' }}>
                <button
                  type="button"
                  className="btn-inline"
                  style={{ fontSize: 13 }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </Table>
      </div>

      <div
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
          marginTop: 14, padding: '17px 19px', borderRadius: 12, background: C.white, border: `1px solid ${C.line}`,
        }}
      >
        <div>
          <div style={{ fontSize: 15.5, fontWeight: 600 }}>{t.new_total}</div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: C.mut, marginTop: 3 }}>
            {payroll ? t.new_total_sub : '₦2,500 own cover + ₦1,800 family top-up, on the same mandate from October.'}
          </div>
        </div>
        <Mono size={26} weight={500}>₦4,300</Mono>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button type="button" className="btn btn-sm btn-primary" style={{ height: 44, padding: '0 20px', fontSize: 15, gap: 8 }}>
          <Icon name="ph ph-user-plus" size={17} />
          {t.add_family}
        </button>
        <button type="button" className="btn btn-secondary" style={{ height: 44, padding: '0 20px', fontSize: 15 }}>
          Upload birth certificates
        </button>
      </div>

      {/* The employer pays for the member's own cover, never the family top-up —
          and must never learn who the top-up covers. */}
      <div
        style={{
          marginTop: 14, padding: '14px 16px', borderRadius: 10, background: C.ochreBg,
          border: `1px solid ${C.ochreBorder}`, fontSize: 13, lineHeight: 1.55, color: C.ochre,
        }}
      >
        {payroll
          ? `Family top-up is your own money, not the sponsor's. It rides on the same payroll line, so ${sponsor.org} sees one total — never who it covers.`
          : 'Family top-up is added to your existing mandate. One debit, one reference, so a failed collection never partially covers your household.'}
      </div>
    </div>
  )
}
