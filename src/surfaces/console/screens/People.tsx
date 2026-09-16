import { Icon } from '../../../components/Icon'
import { Kicker, Mono } from '../../../components/primitives'
import { PageSub, PageTitle, Panel } from '../../../components/surface'
import { TIER_NAMES, TIER_PRICES } from '../../../data/member'
import { C } from '../../../theme/tokens'
import { CONSOLE_CLAIMS, LEAVERS, ROSTER, tone } from '../data'
import { useConsole } from '../state'

export function ConsoleRoster() {
  const { payroll, profile, rfilter, set, go } = useConsole()

  const filters: [string, string][] = [
    ['All', profile.count],
    ['Active', '8,196'],
    ['Not deducted', '12'],
    ['No beneficiary', '203'],
    ['Leaving', '9'],
  ]

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <PageTitle>Members</PageTitle>
          <PageSub style={{ lineHeight: 1.5 }}>
            {profile.count} on this sponsor ·{' '}
            {payroll ? '203 with no beneficiary named · 12 not deducted in August' : '51 failed debits · 7 revoked mandates'}
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
          placeholder="Name, service number, NIN or CSP-ID"
          style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', fontSize: 14, color: C.ink, outline: 'none' }}
        />
        <Mono size={11} color={C.faint}>8,440 records</Mono>
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

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {ROSTER.map((m) => {
          const skin = tone(m.tone)
          return (
            <div
              key={m.ref}
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
                {m.initials}
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</div>
                <Mono size={11.5} color={C.faint} style={{ display: 'block', marginTop: 2 }}>{m.ref}</Mono>
              </div>
              <div style={{ flex: 'none', minWidth: 88 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{m.tier}</div>
                <Mono size={11.5} color={C.faint} style={{ display: 'block', marginTop: 2 }}>{m.price}</Mono>
              </div>
              <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6, minWidth: 150 }}>
                <Icon name={m.icon} size={14} color={skin.ic} />
                <span style={{ fontSize: 12.5, fontWeight: 500, color: skin.ic }}>{m.state}</span>
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
        <div style={{ fontSize: 12.5, color: C.faint }}>Showing 1–7 of 8,440</div>
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
  const stats = [
    { v: '4', k: 'Open on your members', alert: false },
    { v: '11', k: 'Paid this year', alert: false, green: true },
    { v: '₦18.4m', k: 'Paid to families this year', alert: false, green: true },
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

      <Kicker size={9.5} style={{ marginTop: 24 }}>OPEN CLAIMS ON YOUR MEMBERS</Kicker>
      <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {CONSOLE_CLAIMS.map((cl) => {
          const skin = tone(cl.tone)
          return (
            <div key={cl.ref} style={{ padding: 15, border: `1px solid ${skin.bc}`, borderRadius: 11, background: C.white }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <Mono size={11.5} color={C.faint} style={{ minWidth: 110 }}>{cl.ref}</Mono>
                <span style={{ flex: 1, minWidth: 150 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{cl.member}</span>
                  <span style={{ display: 'block', fontSize: 12, color: C.faint, marginTop: 1 }}>{cl.kind}</span>
                </span>
                <Mono size={13.5} weight={500} style={{ minWidth: 100 }}>{cl.amount}</Mono>
                <span
                  style={{
                    flex: 'none', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600,
                    color: skin.ic, background: skin.bg, border: `1px solid ${skin.bc}`, borderRadius: 99, padding: '4px 11px',
                  }}
                >
                  <Icon name={cl.icon} size={13} />
                  {cl.state}
                </span>
              </div>

              {'askTitle' in cl && (
                <div
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 11,
                    paddingTop: 11, borderTop: `1px solid ${C.line7}`, flexWrap: 'wrap',
                  }}
                >
                  <Icon name="ph-fill ph-hand-waving" size={16} color={C.ochre} style={{ marginTop: 1 }} />
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ochreInk }}>{cl.askTitle}</div>
                    <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.mut, marginTop: 2 }}>{cl.askSub}</div>
                  </div>
                  <button type="button" className="btn btn-outline" style={{ flex: 'none', height: 38, padding: '0 15px', fontSize: 13 }}>
                    {cl.askCta}
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
