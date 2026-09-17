import { friendly } from '../../../api/problems'
import { useRef, useState } from 'react'
import { Icon } from '../../../components/Icon'
import { Kicker, Mono } from '../../../components/primitives'
import { PageSub, PageTitle, Panel } from '../../../components/surface'
import { TIER_CODES, TIER_NAMES, TIER_PRICES } from '../../../data/member'
import { C } from '../../../theme/tokens'
import { tone } from '../data'
import { useConsole } from '../state'
import {
  LEAVERS_FIXTURE, ROSTER_FIXTURE, SPONSOR_CLAIMS, SPONSOR_DASHBOARD,
} from '../../../api/fixtures'
import {
  useEnrol, useEnrolAll, useLeave, useLeavers, useRoster, useSponsorClaims, useSponsorDashboard,
} from '../../../api/queries'
import { NotLive, dayFirst, titleCase, useLive } from '../../../api/live'
import { useApi } from '../../../api/provider'
import { useAuth } from '../../../api/auth'
import { msisdnOf, parseStaffList, type StaffListResult } from '../../../api/csv'
import { initialsOf } from '../../../data/member'
import type { BulkEnrolment, Enrolled, Leaver, RosterMember, SponsorClaim } from '../../../api/types'

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
  /*
   * A leaver outranks everything, including a missing beneficiary.
   *
   * They will not be in the next file and that is not a fault — showing "not
   * deducted" against somebody who retired in August is how an officer spends a
   * morning chasing a payroll office about a person who left.
   */
  if (m.leftOn) {
    return {
      label: m.graceUntil ? `Left · covered to ${dayFirst(m.graceUntil)}` : 'Left the payroll',
      tone: 'ochre',
      icon: 'ph ph-sign-out',
    }
  }
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

/** Empty, and what the form goes back to once somebody is enrolled. */
const BLANK = { fullName: '', nin: '', dateOfBirth: '', msisdn: '', serviceNo: '', grade: '' }

/**
 * Why somebody came off the payroll.
 *
 * Four, and no fifth. Death is not on this list and must not be added to it:
 * that is a claim, with an assessor, and recording it as a reason for leaving a
 * payroll would let an officer close the record of somebody whose family is owed
 * five million naira. The server refuses it too.
 */
const LEAVE_REASONS = [
  { code: 'retired', label: 'Retired' },
  { code: 'transferred', label: 'Transferred' },
  { code: 'resigned', label: 'Resigned' },
  { code: 'dismissed', label: 'Dismissed' },
] as const satisfies readonly { code: Leaver['reason']; label: string }[]

/** Green for the ones who keep cover easily, clay for the one who may not. */
function reasonTone(reason: Leaver['reason']) {
  return tone(reason === 'retired' ? 'green' : reason === 'dismissed' ? 'clay' : 'ochre')
}

/**
 * Add and remove. The important half is removal: taking someone off the
 * schedule stops the deduction, it does not cancel their cover.
 *
 * <p>Enrolment lives here and nowhere else. The sponsor holds these people's
 * records already — this screen is an officer transcribing a personnel file, not
 * a member applying — and there is deliberately no self-service version: the
 * member hears about it by SMS and signs in with the number typed here.
 */
export function ConsoleMembers() {
  const { payroll, addMode, tier, set, go } = useConsole()
  const { can } = useAuth()
  const { live } = useApi()
  const { data: dash, provisional } = useLive(useSponsorDashboard(SPONSOR_DASHBOARD), SPONSOR_DASHBOARD)

  const [form, setForm] = useState(BLANK)
  const [staff, setStaff] = useState<StaffListResult | null>(null)
  const [filename, setFilename] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const [search, setSearch] = useState('')
  const [reason, setReason] = useState<Leaver['reason']>('retired')
  const [lastDay, setLastDay] = useState('')
  const [leaveProblem, setLeaveProblem] = useState<string | null>(null)

  const enrol = useEnrol(dash.sponsor.id)
  const enrolAll = useEnrolAll(dash.sponsor.id)
  const leave = useLeave(dash.sponsor.id)

  /*
   * The search goes to the server, because the person being removed is as
   * likely to be on page eighty of the roster as on page one. One match and one
   * only: "take this person off the payroll" is not a thing to do to whoever
   * happened to sort first.
   */
  const { data: roster } = useLive(
    useRoster(dash.sponsor.id, search.length > 1 ? search : '', ROSTER_FIXTURE),
    ROSTER_FIXTURE,
  )
  const matches = search.length > 1 ? roster.members.filter((m) => !m.leftOn) : []
  const found = matches.length === 1 ? matches[0] : null

  const { data: left } = useLive(useLeavers(dash.sponsor.id, LEAVERS_FIXTURE), LEAVERS_FIXTURE)
  const leavers = left.leavers

  /*
   * The same string the server's @PreAuthorize names. An officer who cannot
   * enrol should see the screen and not the button that will be refused.
   *
   * And not while the dashboard is still standing in its fixture: the sponsor
   * in the URL comes from it, and for that moment it is the fixture's id. A
   * POST fired then would try to enrol somebody onto a sponsor that does not
   * exist — the one request on this screen where being briefly wrong creates a
   * person.
   */
  const mayEnrol = can('MEMBERS_MANAGE') && !provisional

  const field = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  /* Parsed here rather than posted as a file, so the officer sees what we read
     before anybody is created and texted — which columns were used, how many
     rows, and which lines we will not send. */
  const choose = async (chosen: File) => {
    setProblem(null)
    setStaff(null)
    enrolAll.reset()
    setFilename(chosen.name)
    try {
      setStaff(parseStaffList(await chosen.text(), TIER_CODES[tier]))
    } catch (e) {
      setProblem(friendly(e, 'That file could not be read.'))
    }
  }

  const addOne = () => {
    const msisdn = msisdnOf(form.msisdn)
    if (!mayEnrol || enrol.isPending || msisdn === null) return
    setProblem(null)
    enrol.mutate(
      {
        nin: form.nin.replace(/\D/g, ''),
        fullName: form.fullName.trim(),
        dateOfBirth: form.dateOfBirth,
        msisdn,
        serviceNo: form.serviceNo.trim() || undefined,
        grade: form.grade.trim() || undefined,
        tier: TIER_CODES[tier],
      },
      {
        // Cleared on success, and the NIN with it: this screen holds L3 data for
        // as long as somebody is typing it and no longer.
        onSuccess: () => setForm(BLANK),
        onError: (e) => setProblem(friendly(e, 'That did not work.')),
      },
    )
  }

  const addAll = () => {
    if (!staff || !mayEnrol || staff.rows.length === 0 || enrolAll.isPending) return
    setProblem(null)
    enrolAll.mutate(staff.rows, {
      onError: (e) => setProblem(friendly(e, 'That file could not be sent.')),
    })
  }

  const removeOne = () => {
    if (!found || !mayEnrol || !lastDay || leave.isPending) return
    setLeaveProblem(null)
    leave.mutate(
      { memberId: found.id, reason, lastDay },
      {
        onSuccess: () => {
          // Cleared, so the next removal starts from nothing. The date is not:
          // a batch of retirements usually shares one last payday.
          setSearch('')
        },
        onError: (e) =>
          setLeaveProblem(friendly(e, 'That could not be recorded.')),
      },
    )
  }

  const complete =
    form.fullName.trim().length > 2 &&
    form.nin.replace(/\D/g, '').length === 11 &&
    form.dateOfBirth !== '' &&
    msisdnOf(form.msisdn) !== null

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
              <Field
                label="FULL NAME AS ON PAYROLL"
                placeholder="Adaeze Nkiru Okafor"
                value={form.fullName}
                onChange={field('fullName')}
              />
              <Field
                label="NIN"
                placeholder="11 digits"
                value={form.nin}
                onChange={field('nin')}
                inputMode="numeric"
                /* Never filled from the browser's saved data and never offered
                   to it. A NIN is the one field on this screen the server will
                   not store in the clear, and autofill is a copy of it kept
                   somewhere nobody decided to keep it. */
                autoComplete="off"
                note="Checked against NIMC before anyone is created. We keep a hash and an encrypted copy — never the number."
              />
              <Field
                label="DATE OF BIRTH"
                type="date"
                value={form.dateOfBirth}
                onChange={field('dateOfBirth')}
                note="As NIMC holds it. A mismatched date is the commonest reason a verification fails."
              />
              <Field
                label="PHONE NUMBER"
                placeholder="0803 000 0000"
                value={form.msisdn}
                onChange={field('msisdn')}
                inputMode="tel"
                note="Where we text them, and the only thing they sign in with. Check it against the personnel file."
              />
              <Field
                label={payroll ? 'SERVICE / IPPIS NUMBER' : 'SERVICE NUMBER (OPTIONAL)'}
                placeholder="4471208"
                value={form.serviceNo}
                onChange={field('serviceNo')}
              />
              <Field
                label="GRADE LEVEL"
                placeholder="GL 12"
                value={form.grade}
                onChange={field('grade')}
              />
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
                <div style={{ fontSize: 14.5, fontWeight: 600, marginTop: 8 }}>Choose a staff list</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.mut, marginTop: 4 }}>
                  A CSV with NIN, name, date of birth and phone number. Service number, grade and plan
                  if you have them — anything missing takes the plan chosen on the other tab. Every NIN
                  is checked against NIMC before that person is created.
                </div>
                <input
                  ref={file}
                  type="file"
                  accept=".csv,text/csv"
                  aria-label="Staff list"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const chosen = e.target.files?.[0]
                    if (chosen) void choose(chosen)
                    // Cleared so choosing the same file twice fires again —
                    // an officer who fixed three lines and re-saved it.
                    e.target.value = ''
                  }}
                />
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ marginTop: 12, height: 42, padding: '0 18px', fontSize: 13.5 }}
                  onClick={() => file.current?.click()}
                >
                  {filename || 'Choose a file'}
                </button>
              </div>
              {staff && <StaffSummary staff={staff} />}
            </>
          )}

          {problem && <Problem message={problem} />}
          {enrol.data && <EnrolledNote enrolled={enrol.data} />}
          {enrolAll.data && <BulkNote result={enrolAll.data} />}

          <button
            type="button"
            className="btn btn-md btn-primary"
            style={{ width: '100%', marginTop: 16, height: 50, gap: 8 }}
            disabled={
              !mayEnrol ||
              (addMode === 0 ? !complete || enrol.isPending : !staff?.rows.length || enrolAll.isPending)
            }
            title={can('MEMBERS_MANAGE') ? undefined : 'Your role cannot enrol members.'}
            onClick={addMode === 0 ? addOne : addAll}
          >
            {addMode === 0
              ? enrol.isPending
                ? 'Verifying with NIMC…'
                : 'Verify and enrol'
              : enrolAll.isPending
                ? `Enrolling ${staff?.rows.length ?? 0}…`
                : staff
                  ? `Verify and enrol ${staff.rows.length.toLocaleString('en-NG')} people`
                  : 'Choose a file first'}
          </button>

          {!live && (
            <div style={{ fontSize: 12, lineHeight: 1.5, color: C.faint, marginTop: 10 }}>
              Demonstration data. With an API configured, this creates the member, starts their cover
              on the first of next month and texts them to open the app.
            </div>
          )}
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

          {/* Who to take off, found the way an officer knows them: by name, by
              CSP-ID, or by the service number on the payroll file. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 14 }}>
            <Field
              label="WHO IS LEAVING"
              placeholder="Name, service number or CSP-ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              note={
                found
                  ? `${found.name} · ${found.cspId}${found.grade ? ` · ${found.grade}` : ''}`
                  : search.length > 1
                    ? 'Nobody on this employer matches that.'
                    : undefined
              }
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Mono size={10} color={C.faint} style={{ letterSpacing: '.1em' }}>WHY</Mono>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {LEAVE_REASONS.map((r) => {
                  const on = reason === r.code
                  return (
                    <button
                      key={r.code}
                      type="button"
                      onClick={() => setReason(r.code)}
                      style={{
                        flex: 1, minWidth: 74, padding: '9px 8px', borderRadius: 9, cursor: 'pointer',
                        border: `1.5px solid ${on ? C.clay : C.line3}`,
                        background: on ? C.clayBg : C.white,
                        color: on ? C.clayInk : C.ink,
                        fontSize: 12, fontWeight: on ? 600 : 500,
                      }}
                    >
                      {r.label}
                    </button>
                  )
                })}
              </div>
              {/* A death is a claim. Said here, on the screen where somebody
                  would otherwise look for it, rather than only in the 400. */}
              <span style={{ fontSize: 11.5, lineHeight: 1.45, color: C.faint }}>
                Someone who has died is not removed here — their cover pays out. Start a claim
                instead.
              </span>
            </div>

            <Field
              label="LAST DAY ON THE PAYROLL"
              type="date"
              value={lastDay}
              onChange={(e) => setLastDay(e.target.value)}
              note="Cover continues for sixty days from this date, whatever happens next."
            />
          </div>

          <button
            type="button"
            className="btn btn-sm"
            style={{
              width: '100%', marginTop: 14, height: 48, border: `1.5px solid ${C.clay}`,
              background: C.white, color: C.clay,
            }}
            disabled={!mayEnrol || !found || !lastDay || leave.isPending}
            title={can('MEMBERS_MANAGE') ? undefined : 'Your role cannot remove members.'}
            onClick={removeOne}
          >
            {leave.isPending ? 'Taking them off…' : 'Take off the schedule'}
          </button>

          {leaveProblem && <Problem message={leaveProblem} />}
          {leave.data && <LeftNote leaver={leave.data} />}

          <Kicker size={9.5} style={{ marginTop: 18 }}>
            {leavers.length > 0 ? 'IN GRACE, SOONEST LAST' : 'NOBODY HAS LEFT'}
          </Kicker>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {leavers.map((lv) => (
              <div key={lv.memberId} style={{ padding: '13px 14px', border: `1px solid ${C.line}`, borderRadius: 11, background: '#FDFDFB' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{lv.name}</div>
                    <Mono size={11.5} color={C.faint} style={{ display: 'block', marginTop: 2 }}>
                      {lv.cspId}
                      {lv.serviceNo ? ` · SVC ${lv.serviceNo}` : ''}
                    </Mono>
                  </div>
                  <span
                    style={{
                      flex: 'none', fontSize: 12, fontWeight: 600,
                      color: reasonTone(lv.reason).ic, background: reasonTone(lv.reason).bg,
                      border: `1px solid ${reasonTone(lv.reason).bc}`, borderRadius: 99, padding: '3px 9px',
                    }}
                  >
                    {titleCase(lv.reason)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line7}` }}>
                  <Icon name="ph ph-shield-check" size={15} color={reasonTone(lv.reason).ic} style={{ marginTop: 1 }} />
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.mut }}>{lv.outcome}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

/** One labelled box, with the sentence that says why it matters underneath. */
function Field({
  label,
  note,
  ...input
}: { label: string; note?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <Mono size={10} color={C.faint} style={{ letterSpacing: '.1em' }}>{label}</Mono>
      <input
        type="text"
        {...input}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '12px 13px',
          border: `1px solid ${C.line3}`, borderRadius: 9, background: '#FDFDFB',
          fontSize: 14, color: C.ink, outline: 'none', fontFamily: 'inherit',
        }}
      />
      {note && <span style={{ fontSize: 11.5, lineHeight: 1.45, color: C.faint }}>{note}</span>}
    </label>
  )
}

function Problem({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 12, padding: '11px 12px',
        border: `1px solid ${C.clayBorder2}`, borderRadius: 10, background: C.clayBg,
      }}
    >
      <Icon name="ph-fill ph-warning-circle" size={16} color={C.clay} />
      <span style={{ fontSize: 12.5, lineHeight: 1.45, color: C.clayInk }}>{message}</span>
    </div>
  )
}

/** What we read out of the file, before anybody is created by it. */
function StaffSummary({ staff }: { staff: StaffListResult }) {
  return (
    <div
      style={{
        marginTop: 12, padding: '12px 13px', border: `1px solid ${C.line}`,
        borderRadius: 10, background: C.white,
      }}
    >
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>
        {staff.rows.length.toLocaleString('en-NG')} people ready
      </div>
      <Mono size={11} color={C.faint} style={{ display: 'block', marginTop: 4, lineHeight: 1.6 }}>
        {Object.entries(staff.usedColumns).map(([field, header]) => (
          <span key={field} style={{ display: 'block' }}>
            {field} ← {header}
          </span>
        ))}
      </Mono>
      {staff.problems.length > 0 && (
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.ochre, marginTop: 8 }}>
          {/* By line number, never by what was in it. The cell we could not read
              is as likely as not the NIN. */}
          {staff.problems.length} line(s) will not be sent — line {staff.problems[0].line}:{' '}
          {staff.problems[0].reason}
          {staff.problems.length > 1 ? `, and ${staff.problems.length - 1} more.` : '.'}
        </div>
      )}
    </div>
  )
}

/**
 * One person, enrolled.
 *
 * The CSP-ID is the thing to write on the personnel file, and the date is the
 * one an officer will be asked about: cover starts on the first of next month
 * because that is when the first deduction is made.
 */
function EnrolledNote({ enrolled }: { enrolled: Enrolled }) {
  return (
    <div
      role="status"
      style={{
        marginTop: 12, padding: '12px 13px', border: `1px solid ${C.gBorder}`,
        borderRadius: 10, background: C.gTint,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="ph-fill ph-check-circle" size={17} color={C.g} />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: C.gd }}>Enrolled</span>
        <Mono size={12.5} color={C.gd}>{enrolled.cspId}</Mono>
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.mut, marginTop: 6 }}>
        {titleCase(enrolled.tier)} cover from {dayFirst(enrolled.inForceSince)}, collected by{' '}
        {enrolled.collectionRail === 'payroll' ? 'payroll deduction' : 'direct debit'}. We have texted
        them to open the app
        {enrolled.beneficiariesNamed ? '.' : ' and name who should be paid.'}
      </div>
    </div>
  )
}

/**
 * Somebody taken off the schedule.
 *
 * Green, not red. The officer has just done a correct and ordinary thing, and
 * the member is still covered — a warning colour here would teach the desk that
 * removing a retiree is a kind of damage.
 */
function LeftNote({ leaver }: { leaver: Leaver }) {
  return (
    <div
      role="status"
      style={{
        marginTop: 12, padding: '12px 13px', border: `1px solid ${C.gBorder}`,
        borderRadius: 10, background: C.gTint,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Icon name="ph-fill ph-check-circle" size={17} color={C.g} />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: C.gd }}>
          {leaver.name} comes off the schedule
        </span>
        <Mono size={12.5} color={C.gd}>{leaver.cspId}</Mono>
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.mut, marginTop: 6 }}>
        Last day {dayFirst(leaver.leftOn)}. {leaver.outcome} They have been texted.
      </div>
    </div>
  )
}

/** A file's worth, and what it could not do. */
function BulkNote({ result }: { result: BulkEnrolment }) {
  return (
    <div
      role="status"
      style={{
        marginTop: 12, padding: '12px 13px', borderRadius: 10,
        border: `1px solid ${result.rejected.length > 0 ? C.ochreBorder : C.gBorder}`,
        background: result.rejected.length > 0 ? C.ochreBg : C.gTint,
      }}
    >
      <div style={{ fontSize: 13.5, fontWeight: 700 }}>
        {result.enrolled.toLocaleString('en-NG')} of {result.submitted.toLocaleString('en-NG')}{' '}
        enrolled
      </div>
      {result.rejected.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {/* Every one of them, with the line number. A count alone sends an
              officer back to the spreadsheet to find them by hand, which is how
              a file with three bad rows becomes a week. */}
          {result.rejected.map((r) => (
            <div key={`${r.row}-${r.name}`} style={{ fontSize: 12.5, lineHeight: 1.5, color: C.ochre }}>
              <Mono size={11.5} color={C.ochre}>Line {r.row}</Mono> · {r.name} — {r.reason}
            </div>
          ))}
        </div>
      )}
    </div>
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
