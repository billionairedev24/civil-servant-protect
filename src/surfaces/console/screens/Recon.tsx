import { Icon } from '../../../components/Icon'
import { Kicker, Mono } from '../../../components/primitives'
import { PageSub, PageTitle, Panel } from '../../../components/surface'
import { C } from '../../../theme/tokens'
import { RECON_PAYROLL, RECON_SELF, tone } from '../data'
import { useConsole } from '../state'

/**
 * Reconciliation queue. The core screen of the console: matching one lump-sum
 * credit against thousands of members, and deciding the rows that did not
 * match. The cycle stays blocked until every row here has an answer.
 */
export function ConsoleRecon() {
  const { payroll, filter, set, go } = useConsole()

  const matchBar = payroll
    ? [
        { flex: 8324, bg: C.g }, { flex: 31, bg: C.clay }, { flex: 12, bg: C.ochre },
        { flex: 5, bg: C.ochreBorder }, { flex: 9, bg: '#D98F6A' },
      ]
    : [
        { flex: 1189, bg: C.g }, { flex: 41, bg: C.ochre },
        { flex: 7, bg: C.clay }, { flex: 3, bg: C.ochreBorder },
      ]

  const legend = payroll
    ? [
        { label: 'Matched', n: '8,324', bg: C.g }, { label: 'Unmatched', n: '31', bg: C.clay },
        { label: 'No deduction', n: '12', bg: C.ochre }, { label: 'Wrong amount', n: '5', bg: C.ochreBorder },
        { label: 'Left service', n: '9', bg: '#D98F6A' },
      ]
    : [
        { label: 'Settled', n: '1,189', bg: C.g }, { label: 'No funds', n: '41', bg: C.ochre },
        { label: 'Mandate revoked', n: '7', bg: C.clay }, { label: 'Card expired', n: '3', bg: C.ochreBorder },
      ]

  const filters: [string, string][] = payroll
    ? [['All', '57'], ['Unmatched', '31'], ['No deduction', '12'], ['Wrong amount', '5'], ['Left service', '9']]
    : [['All', '51'], ['No funds', '41'], ['Mandate revoked', '7'], ['Card expired', '3']]

  const rows = (payroll ? RECON_PAYROLL : RECON_SELF).filter((r) => filter === 0 || r.f === filter)

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <PageTitle>{payroll ? 'Return file · August 2026' : 'Debit results · August 2026'}</PageTitle>
          <PageSub style={{ lineHeight: 1.5 }}>
            {payroll
              ? 'Received 28.08 · 8,381 rows · matched against 8,412 scheduled members.'
              : 'Answered 28.08 · 1,240 mandates presented · settled the same day.'}
          </PageSub>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          style={{ height: 44, padding: '0 18px', gap: 8 }}
          onClick={() => !payroll && go('debit')}
        >
          <Icon name={payroll ? 'ph ph-upload-simple' : 'ph ph-arrows-clockwise'} size={16} />
          {payroll ? 'Replace file' : 'The debit run'}
        </button>
      </div>

      {!payroll && (
        <div
          style={{
            display: 'flex', gap: 11, alignItems: 'flex-start', marginTop: 18, padding: '14px 15px',
            border: `1.5px solid ${C.ochreBorder}`, borderRadius: 12, background: C.ochreBg,
          }}
        >
          <Icon name="ph-fill ph-info" size={19} color={C.ochre} />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ochreInk }}>There is no return file on this rail</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.ochre, marginTop: 3 }}>
              Self-paying members are answered by their bank the same day, so reconciliation is only ever about failed
              debits — never a payroll office. The exceptions below are bank responses.
            </div>
          </div>
        </div>
      )}

      <Panel pad={18} style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <Kicker size={9.5}>MATCH RESULT</Kicker>
          <div style={{ fontSize: 12.5, color: C.mut }}>
            {payroll
              ? '8,324 of 8,412 members reconciled — 57 need a decision'
              : '1,189 of 1,240 members reconciled — 51 need a decision'}
          </div>
        </div>
        <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', marginTop: 12, background: C.line7 }}>
          {matchBar.map((m, i) => (
            <div key={i} style={{ flex: m.flex, background: m.bg }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 11 }}>
          {legend.map((l) => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: l.bg }} />
              <span style={{ fontSize: 12.5, color: C.mut }}>{l.label}</span>
              <Mono size={12.5} weight={500}>{l.n}</Mono>
            </div>
          ))}
        </div>
      </Panel>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 22 }}>
        {filters.map(([label, n], i) => {
          const on = filter === i
          return (
            <button
              key={label}
              type="button"
              className="chip"
              onClick={() => set({ filter: i })}
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

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r) => {
          const skin = tone(r.tone)
          return (
            <button
              key={r.name + r.ref}
              type="button"
              className="pick"
              onClick={() => go('exception')}
              style={{
                gap: 13, padding: '14px 15px', border: `1px solid ${skin.bc}`,
                borderRadius: 11, background: C.white, flexWrap: 'wrap',
              }}
            >
              <Icon name={r.icon} size={19} color={skin.ic} />
              <span style={{ flex: 1, minWidth: 170 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{r.name}</span>
                <Mono size={11.5} color={C.faint} style={{ display: 'block', marginTop: 2 }}>{r.ref}</Mono>
              </span>
              <span style={{ flex: 'none', minWidth: 140 }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: skin.ic }}>{r.kind}</span>
                <span style={{ display: 'block', fontSize: 12, color: C.mut, marginTop: 1 }}>{r.detail}</span>
              </span>
              <Mono size={13} style={{ flex: 'none', minWidth: 82, textAlign: 'right' }}>{r.amount}</Mono>
              <Icon name="ph ph-caret-right" size={15} color={C.ghost2} />
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 9, marginTop: 16, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary" style={{ height: 46, padding: '0 18px', fontSize: 14, gap: 7 }}>
          <Icon name="ph ph-download-simple" size={16} />
          Export exceptions
        </button>
        <button type="button" className="btn btn-primary" style={{ height: 46, padding: '0 20px', fontSize: 14.5, gap: 7 }}>
          <Icon name="ph ph-check-circle" size={16} />
          Close the cycle
        </button>
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.55, color: C.faint, marginTop: 10, maxWidth: 620 }}>
        {payroll
          ? 'Closing the cycle tells 8,324 members their August contribution cleared, and starts the 7-day card fallback for the 12 who were not deducted. It stays blocked while any row above is undecided.'
          : 'Closing the run tells 1,189 members their August contribution cleared, and puts the 51 failed debits on the retry ladder. It stays blocked while any row above is undecided.'}
      </div>
    </>
  )
}

/**
 * A single exception, with the file row and the member record side by side and
 * four decisions. This is where money becomes cover — or does not.
 */
export function ConsoleException() {
  const { payroll, profile, go } = useConsole()

  const filePanel = payroll
    ? [
        { k: 'Name as written', v: 'ADAEZE N OKAFOR', alert: true },
        { k: 'Service number', v: '4471209', alert: true },
        { k: 'NIN', v: '•••• •••• 4471', alert: false },
        { k: 'Grade level', v: 'GL 12', alert: false },
        { k: 'Amount deducted', v: '₦2,500', alert: false },
        { k: 'Deduction code', v: profile.code, alert: false },
      ]
    : [
        { k: 'Response', v: '51 · INSUFFICIENT FUNDS', alert: true },
        { k: 'Presented', v: '28.08.2026 06:00', alert: false },
        { k: 'Bank', v: 'GTBank ••4471', alert: false },
        { k: 'Amount requested', v: '₦2,500', alert: false },
        { k: 'Collected', v: '₦0', alert: true },
        { k: 'Mandate', v: profile.code, alert: false },
      ]

  const memberPanel = payroll
    ? [
        { k: 'Name on our record', v: 'Adaeze Nkiru Okafor', match: true },
        { k: 'Service number', v: '4471208', match: false },
        { k: 'NIN', v: '•••• •••• 4471', match: true },
        { k: 'Grade level', v: 'GL 12', match: true },
        { k: 'Plan amount', v: '₦2,500', match: true },
        { k: 'CSP-ID', v: '4471-2098', match: null },
      ]
    : [
        { k: 'Member', v: 'Adaeze Nkiru Okafor', match: true },
        { k: 'CSP-ID', v: '4471-2098', match: null },
        { k: 'Mandate authorised', v: '04.03.2024', match: true },
        { k: 'Paid on time', v: '28 of 30 months', match: true },
        { k: 'Plan amount', v: '₦2,500', match: true },
        { k: 'Grace ends', v: '27.10.2026', match: false },
      ]

  const actions = payroll
    ? [
        { title: 'Link this deduction to Adaeze Nkiru Okafor', sub: 'Credits her August contribution and corrects the service number on our record. She gets an SMS today.', icon: 'ph-fill ph-link', t: 'green' as const, to: 'recon' as const },
        { title: 'Create a new member from the file row', sub: 'Use only if this really is a different person. Enrolment still needs their NIN verified and a beneficiary named.', icon: 'ph ph-user-plus', t: 'neutral' as const, to: 'members' as const },
        { title: 'Return the money to payroll', sub: '₦2,500 goes back on next month’s schedule as a credit. Use when nobody should have been deducted.', icon: 'ph ph-arrow-u-up-left', t: 'ochre' as const, to: 'recon' as const },
        { title: `Hold and ask ${profile.destShort}`, sub: 'Parks the row and drafts a query with the file reference. The cycle stays open until it comes back.', icon: 'ph ph-chat-circle-text', t: 'neutral' as const, to: 'recon' as const },
      ]
    : [
        { title: 'Retry on 4 September', sub: 'The standard second attempt, after salaries land. Most no-funds failures clear here and she is never told anything went wrong.', icon: 'ph ph-arrows-clockwise', t: 'green' as const, to: 'recon' as const },
        { title: 'Move her collection date to the 30th', sub: 'Permanent fix if her salary date has changed. Needs no new mandate — only the presentation day changes.', icon: 'ph ph-calendar-dot', t: 'neutral' as const, to: 'recon' as const },
        { title: 'Try the card on file instead', sub: 'Card ••4471 is on file as the backup. It costs more to collect, so it is the second choice, not the first.', icon: 'ph ph-credit-card', t: 'ochre' as const, to: 'recon' as const },
        { title: 'Send the USSD prompt', sub: 'SMS with a string she can dial without a smartphone. Use when two retries have already failed.', icon: 'ph ph-device-mobile', t: 'neutral' as const, to: 'recon' as const },
      ]

  return (
    <>
      <button type="button" className="btn-back" onClick={() => go('recon')} style={{ padding: '2px 0 10px' }}>
        <Icon name="ph ph-arrow-left" size={16} />
        Reconciliation queue
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Mono
          size={10}
          color={C.clay}
          style={{ letterSpacing: '.1em', border: `1px solid ${C.clayBorder}`, borderRadius: 5, padding: '3px 8px' }}
        >
          {payroll ? 'UNMATCHED DEDUCTION' : 'FAILED DEBIT'}
        </Mono>
        <Mono size={11.5} color={C.faint}>
          {payroll ? 'EXC-2608-0031 · 1 of 31' : 'EXC-2608-0041 · 1 of 41'}
        </Mono>
      </div>

      <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-.02em', marginTop: 8, textWrap: 'balance' }}>
        {payroll
          ? '₦2,500 was deducted from someone we cannot identify'
          : "₦2,500 was refused by the member's bank"}
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.55, color: C.mut, marginTop: 6, maxWidth: 660 }}>
        {payroll
          ? 'The payroll file has a deduction under this name and service number, but nothing in our member list matches it. Until it is resolved the money sits unallocated and nobody gets credited for August.'
          : 'The mandate is valid but the account had no funds on presentation day. Nothing has been collected for August yet, and her 60-day grace clock started the moment the debit failed.'}
      </div>

      <div
        style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(272px,1fr))',
          gap: 12, marginTop: 20, alignItems: 'start',
        }}
      >
        <div style={{ padding: 17, border: `1.5px solid ${C.clayBorder}`, borderRadius: 12, background: C.white }}>
          <Kicker size={9.5} color={C.clay}>
            {payroll ? 'FROM THE PAYROLL FILE' : 'FROM THE BANK RESPONSE'}
          </Kicker>
          {filePanel.map((r) => (
            <div
              key={r.k}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: `1px solid ${C.line7}` }}
            >
              <span style={{ fontSize: 12.5, color: C.mut }}>{r.k}</span>
              <Mono size={13} weight={500} color={r.alert ? C.clay : C.ink} style={{ textAlign: 'right' }}>{r.v}</Mono>
            </div>
          ))}
          <div style={{ fontSize: 12, lineHeight: 1.5, color: C.faint, marginTop: 11 }}>
            {payroll
              ? `Row 4,208 of the August return file, exactly as sent by ${profile.destShort}.`
              : `NIBSS response code 51 against mandate ${profile.code}, returned within the hour.`}
          </div>
        </div>

        <div style={{ padding: 17, border: `1px solid ${C.gBorder}`, borderRadius: 12, background: C.white }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <Kicker size={9.5} color={C.g}>
              {payroll ? 'CLOSEST MEMBER MATCH' : 'THE MEMBER AND HER MANDATE'}
            </Kicker>
            <Mono
              size={10.5}
              color={C.g}
              style={{ background: C.gTint, border: `1px solid ${C.gBorder}`, borderRadius: 99, padding: '2px 8px' }}
            >
              {payroll ? '94% LIKELY' : 'MANDATE VALID'}
            </Mono>
          </div>
          {memberPanel.map((r) => (
            <div
              key={r.k}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: `1px solid ${C.line7}` }}
            >
              <span style={{ fontSize: 12.5, color: C.mut }}>{r.k}</span>
              <Mono
                size={13}
                weight={500}
                color={r.match === null ? C.ink : r.match ? C.g : C.clay}
                style={{ textAlign: 'right' }}
              >
                {r.v}
              </Mono>
            </div>
          ))}
          <div style={{ fontSize: 12, lineHeight: 1.5, color: C.mut, marginTop: 11 }}>
            {payroll
              ? 'Same NIN, same grade level, name spelled differently and one digit out on the service number — almost certainly a payroll typo, not a different person.'
              : 'The mandate itself is fine, so nothing needs re-authorising. This is a timing problem: she is paid on the 30th and we presented on the 28th.'}
          </div>
        </div>
      </div>

      <Kicker size={9.5} style={{ marginTop: 24 }}>WHAT DO YOU WANT TO DO</Kicker>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 9 }}>
        {actions.map((a) => {
          const skin = tone(a.t)
          return (
            <button
              key={a.title}
              type="button"
              className="pick"
              onClick={() => go(a.to)}
              style={{
                alignItems: 'flex-start', gap: 12, padding: '14px 15px',
                border: `1.5px solid ${a.t === 'green' ? C.gBorder3 : skin.bc}`,
                borderRadius: 11,
                background: a.t === 'green' ? C.gTint : C.white,
              }}
            >
              <Icon name={a.icon} size={19} color={skin.ic} style={{ marginTop: 1 }} />
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: skin.fg }}>{a.title}</span>
                <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.45, color: C.mut, marginTop: 2 }}>{a.sub}</span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Whatever is decided, the reason is kept — this is the audit trail the
          whole product is sold on. */}
      <Panel pad={16} style={{ marginTop: 16, padding: '15px 16px' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          Why did this happen? <span style={{ fontWeight: 400, color: C.faint }}>(kept on the audit trail)</span>
        </div>
        <textarea
          rows={2}
          aria-label="Why did this happen?"
          placeholder={
            payroll
              ? 'e.g. name corrected on payroll in July, our record not updated'
              : 'e.g. member says salary now lands on the 30th'
          }
          style={{
            width: '100%', boxSizing: 'border-box', marginTop: 9, padding: '11px 12px',
            border: `1px solid ${C.line3}`, borderRadius: 9, background: '#FDFDFB',
            fontSize: 13, lineHeight: 1.5, color: C.ink, resize: 'vertical', fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', gap: 9, marginTop: 11, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            style={{ height: 44, padding: '0 18px', color: C.mut }}
            onClick={() => go('recon')}
          >
            Skip for now
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            style={{ height: 44, padding: '0 20px' }}
            onClick={() => go('recon')}
          >
            Resolve and go to next
          </button>
        </div>
      </Panel>
    </>
  )
}
