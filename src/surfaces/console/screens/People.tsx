import { useState } from 'react'
import { Icon } from '../../../components/Icon'
import { Kicker, Mono } from '../../../components/primitives'
import { PageSub, PageTitle, Panel } from '../../../components/surface'
import { TIER_NAMES, TIER_PRICES } from '../../../data/member'
import { C } from '../../../theme/tokens'
import { LEAVERS, tone } from '../data'
import { useConsole } from '../state'
import { ROSTER_FIXTURE, SPONSOR_CLAIMS, SPONSOR_DASHBOARD } from '../../../api/fixtures'
import { useRoster, useSponsorClaims, useSponsorDashboard } from '../../../api/queries'
import { NotLive, dayFirst, titleCase, useLive } from '../../../api/live'
import { initialsOf } from '../../../data/member'
import type { RosterMember, SponsorClaim } from '../../../api/types'

/**
 * What a member's month looks like, as a row.
 *
 * The collection state is the reason this screen exists — an HR officer opens
 * it to find who was not deducted — so it is the loudest thing on the row after
 * the name. "No beneficiary named" outranks a good payment, because a member
 * who is paying and has nobody nominated is the one whose family will wait a
 * year.
 */
function standingOf(m: RosterMember): {
  label: string
  tone: 'green' | 'ochre' | 'clay'
  icon: string
} {
  if (!m.hasBeneficiary) {
    return { label: 'No beneficiary named', tone: 'ochre', icon: 'ph ph-user-minus' }
  }
  switch (m.collectionState) {
    case 'confirmed':
      return { label: 'Paid', tone: 'green', icon: 'ph-fill ph-check-circle' }
    case 'failed':
      return { label: 'Collection failed', tone: 'clay', icon: 'ph ph-warning-circle' }
    case 'expected':
      return { label: 'Not in the last file', tone: 'ochre', icon: 'ph ph-clock-countdown' }
    case 'reversed':
      return { label: 'Reversed', tone: 'clay', icon: 'ph ph-arrow-u-up-left' }
    default:
      // Never collected from at all — enrolled but never deducted, which is a
      // different problem from a missed month and should not read as one.
      return { label: 'Never collected', tone: 'clay', icon: 'ph ph-question' }
  }
}

export function ConsoleRoster() {
  const { payroll, rfilter, set, go } = useConsole()
  const [search, setSearch] = useState('')
  const { data: dash } = useLive(useSponsorDashboard(SPONSOR_DASHBOARD), SPONSOR_DASHBOARD)
  const { data: roster, failed } = useLive(
    useRoster(dash.sponsor.id, search, ROSTER_FIXTURE),
    ROSTER_FIXTURE,
  )

  const counts = roster.counts
  const filters: [string, string][] = [
    ['All', counts.all.toLocaleString('en-NG')],
    ['Paid', counts.paid.toLocaleString('en-NG')],
    ['Not deducted', counts.notDeducted.toLocaleString('en-NG')],
    ['No beneficiary', counts.noBeneficiary.toLocaleString('en-NG')],
  ]

  /* Filtering the page, not the sponsor. The chips count the whole roster —
     see RosterCounts on the server — but the list is one page of it, so a chip
     narrows what is on screen rather than re-querying with a filter the API
     does not have. Searching does go to the server, because a name that is not
     on this page has to be found somehow. */
  const shown = roster.members.filter((m) => {
    if (rfilter === 1) return m.collectionState === 'confirmed' && m.hasBeneficiary
    if (rfilter === 2) return m.collectionState !== 'confirmed'
    if (rfilter === 3) return !m.hasBeneficiary
    return true
  })

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <PageTitle>Members</PageTitle>
          <PageSub style={{ lineHeight: 1.5 }}>
            {counts.all.toLocaleString('en-NG')} on this sponsor ·{' '}
            {counts.noBeneficiary.toLocaleString('en-NG')} with no beneficiary named ·{' '}
            {counts.notDeducted.toLocaleString('en-NG')}{' '}
            {payroll ? 'not in the last file' : 'with a failed collection'}
          </PageSub>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          style={{ height: 44, padding: '0 18px', gap: 7 }}
          onClick={() => go('members')}
        >
          <Icon name="ph ph-user-plus" size={16} />
          Add members
        </button>
      </div>

      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 9, marginTop: 18, padding: '0 14px',
          height: 48, border: `1px solid ${C.line3}`, borderRadius: 999, background: C.white,
        }}
      >
        <Icon name="ph ph-magnifying-glass" size={17} color={C.faint} />
        <input
          type="text"
          aria-label="Search members"
          placeholder="Name, service number or CSP-ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', fontSize: 14, color: C.ink, outline: 'none' }}
        />
        <Mono size={11} color={C.faint}>
          {counts.all.toLocaleString('en-NG')} records
        </Mono>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
        {filters.map(([label, n], i) => {
          const on = rfilter === i
          return (
            <button
              key={label}
              type="button"
              className="chip"
              onClick={() => set({ rfilter: i })}
              style={{
                padding: '8px 13px', borderRadius: 999,
                border: `1.5px solid ${on ? C.g : C.line3}`,
                background: on ? C.gTint : C.white,
                color: on ? C.gd : C.ink,
                fontSize: 12.5, fontWeight: on ? 600 : 500,
              }}
            >
              {label}
              <Mono size={11} color={on ? C.g : C.faint}>{n}</Mono>
            </button>
          )
        })}
      </div>

      {failed && <NotLive what="This roster" />}

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {shown.map((m) => {
          const standing = standingOf(m)
          const skin = tone(standing.tone)
          return (
            <div
              key={m.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 13, padding: '13px 15px',
                border: `1px solid ${C.line}`, borderRadius: 11, background: C.white, flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  flex: 'none', width: 32, height: 32, borderRadius: '50%', background: skin.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: skin.fg,
                }}
              >
                {initialsOf(m.name)}
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</div>
                <Mono size={11.5} color={C.faint} style={{ display: 'block', marginTop: 2 }}>
                  CSP {m.cspId}
                  {m.serviceNo ? ` · SVC ${m.serviceNo}` : ''}
                </Mono>
              </div>
              <div style={{ flex: 'none', minWidth: 88 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{titleCase(m.tier)}</div>
                <Mono size={11.5} color={C.faint} style={{ display: 'block', marginTop: 2 }}>
                  {m.grade ?? '—'}
                </Mono>
              </div>
              <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6, minWidth: 150 }}>
                <Icon name={standing.icon} size={14} color={skin.ic} />
                <span style={{ fontSize: 12.5, fontWeight: 500, color: skin.ic }}>{standing.label}</span>
              </div>
              <button
                type="button"
                aria-label={`Actions for ${m.name}`}
                style={{
                  flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32, border: `1px solid ${C.line}`, borderRadius: '50%',
                  background: C.white, color: C.faint, cursor: 'pointer',
                }}
              >
                <Icon name="ph ph-dots-three" size={16} />
              </button>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: C.faint }}>
          {/* What is on screen, against what exists. A page of fifty out of
              8,440 that says "8,440" is telling an officer they have seen the
              whole roster. */}
          {shown.length === 0
            ? 'No members match'
            : `Showing 1–${shown.length} of ${counts.all.toLocaleString('en-NG')}`}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['ph ph-caret-left', 'ph ph-caret-right'].map((icon, i) => (
            <button
              key={icon}
              type="button"
              aria-label={i === 0 ? 'Previous page' : 'Next page'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 38, height: 38, border: `1.5px solid ${C.line4}`, borderRadius: '50%',
                background: C.white, color: i === 0 ? C.ghost2 : C.ink, cursor: 'pointer',
              }}
            >
              <Icon name={icon} size={15} />
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

/**
 * Add and remove. The important half is removal: taking someone off the
 * schedule stops the deduction, it does not cancel their cover.
 */
export function ConsoleMembers() {
  const { payroll, addMode, tier, set, go } = useConsole()

  const fields = [
    { label: 'FULL NAME AS ON PAYROLL', ph: 'Adaeze Nkiru Okafor' },
    { label: payroll ? 'SERVICE / IPPIS NUMBER' : 'PHONE NUMBER', ph: payroll ? '4471208' : '0803 000 0000' },
    { label: 'NIN', ph: '11 digits' },
    { label: 'GRADE LEVEL', ph: 'GL 12' },
  ]

  return (
    <>
      <button type="button" className="btn-back" onClick={() => go('roster')} style={{ padding: '2px 0 10px' }}>
        <Icon name="ph ph-arrow-left" size={16} />
        Members
      </button>

      <PageTitle>Add and remove members</PageTitle>
      <PageSub style={{ lineHeight: 1.55, maxWidth: 640 }}>
        Changes here take effect on the next schedule, not today. Anyone added after the payroll cut-off starts on the
        following month unless you collect their first contribution by card.
      </PageSub>

      <div
        style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(292px,1fr))',
          gap: 14, marginTop: 20, alignItems: 'start',
        }}
      >
        <div style={{ padding: 18, border: `1px solid ${C.gBorder}`, borderRadius: 12, background: C.white }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="ph ph-user-plus" size={18} color={C.g} />
            <div style={{ fontSize: 16, fontWeight: 700 }}>Add new starters</div>
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
            {(['One person', 'Upload a list'] as const).map((name, i) => {
              const on = addMode === i
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => set({ addMode: i as 0 | 1 })}
                  style={{
                    flex: 1, padding: '9px 12px', borderRadius: 999, cursor: 'pointer',
                    border: `1.5px solid ${on ? C.g : C.line3}`,
                    background: on ? C.gTint : C.white,
                    color: on ? C.gd : C.ink,
                    fontSize: 12.5, fontWeight: on ? 600 : 500,
                  }}
                >
                  {name}
                </button>
              )
            })}
          </div>

          {addMode === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 16 }}>
              {/* A <label> rather than a <div>: the mono caption above each box
                  is the field's only name, and a placeholder is not one. */}
              {fields.map((f) => (
                <label key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Mono size={10} color={C.faint} style={{ letterSpacing: '.1em' }}>{f.label}</Mono>
                  <input
                    type="text"
                    placeholder={f.ph}
                    style={{
                      width: '100%', boxSizing: 'border-box', padding: '12px 13px',
                      border: `1px solid ${C.line3}`, borderRadius: 9, background: '#FDFDFB',
                      fontSize: 14, color: C.ink, outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                </label>
              ))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Mono size={10} color={C.faint} style={{ letterSpacing: '.1em' }}>STARTING PLAN</Mono>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {TIER_NAMES.map((name, i) => {
                    const on = tier === i
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => set({ tier: i })}
                        style={{
                          flex: 1, minWidth: 66, padding: '9px 8px', borderRadius: 9, cursor: 'pointer',
                          border: `1.5px solid ${on ? C.g : C.line3}`,
                          background: on ? C.gTint : C.white,
                          color: on ? C.gd : C.ink,
                          fontSize: 12, fontWeight: on ? 600 : 500,
                        }}
                      >
                        {name}
                        <Mono size={10.5} color={C.faint} style={{ display: 'block', marginTop: 2 }}>
                          {TIER_PRICES[i]}
                        </Mono>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div
                style={{
                  marginTop: 16, padding: '22px 18px', border: `1.5px solid ${C.gBorder3}`,
                  borderRadius: 11, background: C.gTint, textAlign: 'center',
                }}
              >
                <Icon name="ph ph-file-arrow-up" size={30} color={C.g} />
                <div style={{ fontSize: 14.5, fontWeight: 600, marginTop: 8 }}>Drop a staff list here</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.mut, marginTop: 4 }}>
                  CSV or XLSX with service number, NIN, name, grade level and plan. We validate every NIN before anyone
                  is added.
                </div>
                <button type="button" className="btn btn-outline" style={{ marginTop: 12, height: 42, padding: '0 18px', fontSize: 13.5 }}>
                  Choose a file
                </button>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.5, color: C.faint, marginTop: 10 }}>
                Last upload: 37 rows, 35 added, 2 held for a NIN mismatch.
              </div>
            </>
          )}

          <button type="button" className="btn btn-md btn-primary" style={{ width: '100%', marginTop: 16, height: 50, gap: 8 }}>
            {addMode === 0 ? 'Add to the September schedule' : 'Validate and add 37 people'}
          </button>
        </div>

        <div style={{ padding: 18, border: `1px solid ${C.clayBorder}`, borderRadius: 12, background: C.white }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="ph ph-user-minus" size={18} color={C.clay} />
            <div style={{ fontSize: 16, fontWeight: 700 }}>Remove from the schedule</div>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: C.mut, marginTop: 7 }}>
            Removing someone stops the payroll deduction. It does <strong>not</strong> cancel their cover — what happens
            next depends on why they left.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
            {LEAVERS.map((lv) => {
              const skin = tone(lv.tone)
              return (
                <div key={lv.ref} style={{ padding: '13px 14px', border: `1px solid ${C.line}`, borderRadius: 11, background: '#FDFDFB' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 150 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{lv.name}</div>
                      <Mono size={11.5} color={C.faint} style={{ display: 'block', marginTop: 2 }}>{lv.ref}</Mono>
                    </div>
                    <span
                      style={{
                        flex: 'none', fontSize: 12, fontWeight: 600, color: skin.ic, background: skin.bg,
                        border: `1px solid ${skin.bc}`, borderRadius: 99, padding: '3px 9px',
                      }}
                    >
                      {lv.reason}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line7}` }}>
                    <Icon name={lv.icon} size={15} color={skin.ic} style={{ marginTop: 1 }} />
                    <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.mut }}>{lv.outcome}</div>
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-sm btn-secondary" style={{ flex: 1, minWidth: 130, height: 46 }}>
              Notify all three
            </button>
            <button
              type="button"
              className="btn btn-sm"
              style={{
                flex: 1, minWidth: 150, height: 46, border: `1.5px solid ${C.clay}`,
                background: C.white, color: C.clay,
              }}
            >
              Remove from September
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * Claims, as much of them as a sponsor is allowed to see. The one thing only
 * the employer can give is confirmation of service on a date — and that single
 * answer is what turns a stuck claim into a payment.
 */
export function ConsoleClaims() {
  const { data: dash } = useLive(useSponsorDashboard(SPONSOR_DASHBOARD), SPONSOR_DASHBOARD)
  const { data: claims, failed } = useLive(
    useSponsorClaims(dash.sponsor.id, SPONSOR_CLAIMS),
    SPONSOR_CLAIMS,
  )

  const stats = [
    { v: String(claims.open), k: 'Open on your members', alert: false },
    { v: String(claims.paidThisYear), k: 'Paid this year', alert: false, green: true },
    // Aggregate only. What any one family received is not the employer's to know.
    { v: millions(claims.paidThisYearMinor), k: 'Paid to families this year', alert: false, green: true },
  ]

  return (
    <>
      <PageTitle>Claims</PageTitle>
      <PageSub style={{ lineHeight: 1.55, maxWidth: 660 }}>
        Claims are between the member's family and the insurer. You see enough to confirm cover was in force and to
        support the family — nothing more.
      </PageSub>

      <div
        style={{
          display: 'flex', gap: 11, alignItems: 'flex-start', marginTop: 18, padding: '14px 15px',
          border: `1px solid ${C.gBorder}`, borderRadius: 12, background: C.gTint,
        }}
      >
        <Icon name="ph-fill ph-eye-slash" size={19} color={C.g} />
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.gd }}>What is hidden from you</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.mut, marginTop: 3 }}>
            Cause of death, medical documents, hospital names, diagnoses and beneficiary bank details are never shown to
            a sponsor. Members are told this during enrolment — it is why they trust the scheme with a NIN.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginTop: 18 }}>
        {stats.map((s) => (
          <Panel key={s.k} pad={16} style={{ padding: '15px 16px' }}>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.03em', color: s.green ? C.gd : C.ink }}>
              {s.v}
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.35, color: C.mut, marginTop: 3 }}>{s.k}</div>
          </Panel>
        ))}
      </div>

      {failed && <NotLive what="These claims" />}

      <Kicker size={9.5} style={{ marginTop: 24 }}>OPEN CLAIMS ON YOUR MEMBERS</Kicker>
      <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {claims.claims.map((cl) => {
          const look = claimLook(cl)
          const skin = tone(look.tone)
          return (
            <div key={cl.ref} style={{ padding: 15, border: `1px solid ${skin.bc}`, borderRadius: 11, background: C.white }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <Mono size={11.5} color={C.faint} style={{ minWidth: 110 }}>{cl.ref}</Mono>
                <span style={{ flex: 1, minWidth: 150 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>
                    {/* "Late" only where the member has died. Writing it on an
                        accident claim tells an HR officer their colleague is
                        dead when they are in hospital. */}
                    {cl.type === 'death' ? `Late ${cl.memberName}` : cl.memberName}
                  </span>
                  <span style={{ display: 'block', fontSize: 12, color: C.faint, marginTop: 1 }}>
                    {look.kind} · opened {dayFirst(cl.openedAt)}
                  </span>
                </span>
                {/* No amount. See SponsorClaim — what a family is paid is
                    between them and the insurer. */}
                <span
                  style={{
                    flex: 'none', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600,
                    color: skin.ic, background: skin.bg, border: `1px solid ${skin.bc}`, borderRadius: 99, padding: '4px 11px',
                  }}
                >
                  <Icon name={look.icon} size={13} />
                  {look.state}
                </span>
              </div>

              {cl.awaitingSponsor && (
                <div
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 11,
                    paddingTop: 11, borderTop: `1px solid ${C.line7}`, flexWrap: 'wrap',
                  }}
                >
                  <Icon name="ph-fill ph-hand-waving" size={16} color={C.ochre} style={{ marginTop: 1 }} />
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ochreInk }}>
                      Confirm {cl.memberName.split(' ')[0]} was in service on the date of the incident
                    </div>
                    <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.mut, marginTop: 2 }}>
                      The insurer needs one line from the employer. Nothing medical is asked of you.
                    </div>
                  </div>
                  <button type="button" className="btn btn-outline" style={{ flex: 'none', height: 38, padding: '0 15px', fontSize: 13 }}>
                    Confirm service
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 14, fontSize: 12.5, lineHeight: 1.55, color: C.faint, maxWidth: 640 }}>
        Employer confirmation is the one thing only you can give: whether the person was in service on the date of the
        incident. That single answer is what turns a stuck claim into a payment.
      </div>
    </>
  )
}

/**
 * A claim's row, from the little a sponsor is given.
 *
 * The state words are the employer's view of it, not the insurer's: `assessing`
 * means "with the insurer" to somebody who cannot see the assessment, and
 * `documents_pending` on a claim waiting for *them* means "awaiting you".
 */
function claimLook(cl: SponsorClaim): {
  kind: string
  state: string
  tone: 'green' | 'ochre' | 'clay' | 'neutral'
  icon: string
} {
  const kind =
    cl.type === 'death'
      ? 'Death benefit · family claiming'
      : cl.type === 'accident'
        ? 'Accident · hospital cash'
        : 'Disability · income support'

  if (cl.awaitingSponsor) {
    return { kind, state: 'Awaiting you', tone: 'ochre', icon: 'ph-fill ph-hand-waving' }
  }
  if (cl.state === 'approved') {
    return { kind, state: 'Approved', tone: 'green', icon: 'ph-fill ph-check-circle' }
  }
  if (cl.state === 'declined') {
    return { kind, state: 'Declined', tone: 'clay', icon: 'ph ph-x-circle' }
  }
  return { kind, state: 'With the insurer', tone: 'neutral', icon: 'ph-fill ph-circle-notch' }
}

/** "₦18.4m" — the scale a sponsor reads a year's claims at. */
function millions(minor: number): string {
  const naira = minor / 100
  if (naira >= 1_000_000) return `₦${(naira / 1_000_000).toFixed(1)}m`
  if (naira >= 1_000) return `₦${Math.round(naira / 1_000)}k`
  return `₦${Math.round(naira)}`
}
