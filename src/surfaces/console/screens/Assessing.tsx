import { useState } from 'react'
import { Icon } from '../../../components/Icon'
import { Kicker, Mono } from '../../../components/primitives'
import { PageSub, PageTitle, Panel } from '../../../components/surface'
import { docName } from '../../../components/DocumentPicker'
import { C } from '../../../theme/tokens'
import { CLAIM_FIXTURE, CLAIM_QUEUE } from '../../../api/fixtures'
import { useAssessClaim, useClaim, useClaimQueue, usePayClaim } from '../../../api/queries'
import { NotLive, dayFirst, naira, useLive } from '../../../api/live'
import { useApi } from '../../../api/provider'
import { useAuth } from '../../../api/auth'
import type { CspApi } from '../../../api/client'
import type { ClaimQueueItem } from '../../../api/types'

/** The wording a claim's state deserves in front of the person deciding it. */
function stateLook(state: string): { label: string; tone: 'green' | 'ochre' | 'clay' | 'grey' } {
  switch (state) {
    case 'documents_pending':
      return { label: 'Waiting on papers', tone: 'ochre' }
    case 'assessing':
      return { label: 'To assess', tone: 'clay' }
    case 'approved':
      return { label: 'Approved · to pay', tone: 'green' }
    case 'paid':
      return { label: 'Paid', tone: 'green' }
    case 'declined':
      return { label: 'Declined', tone: 'grey' }
    default:
      return { label: state.replace(/_/g, ' '), tone: 'grey' }
  }
}

const SKIN = {
  green: { fg: C.gd, bg: C.gTint, bc: C.gBorder },
  ochre: { fg: C.ochreInk, bg: C.ochreBg, bc: C.ochreBorder },
  clay: { fg: C.clayInk, bg: C.clayBg, bc: C.clay },
  grey: { fg: C.mut, bg: C.white, bc: C.line },
} as const

/**
 * The assessor's queue, and the two decisions that come after it.
 *
 * Not the sponsor's claims screen: that one is an employer looking at their own
 * staff, with the amount, the cause and the documents all withheld. This is the
 * insurer's side — every sponsor's claims, the evidence itself, and the power to
 * approve. The two are different roles reading different tables, and putting
 * them on one screen is how an employer ends up reading a death certificate.
 */
export function ConsoleAssessing() {
  const { can } = useAuth()
  const { data: queue, failed } = useLive(useClaimQueue(CLAIM_QUEUE), CLAIM_QUEUE)
  const [openRef, setOpenRef] = useState<string | null>(null)

  const mayAssess = can('CLAIM_ASSESS')
  const mayPay = can('CLAIM_PAY')

  const waiting = queue.claims.filter((c) => c.state === 'documents_pending').length
  const toAssess = queue.claims.filter((c) => c.state === 'assessing').length
  const toPay = queue.claims.filter((c) => c.state === 'approved').length

  return (
    <>
      <PageTitle>Claims to assess</PageTitle>
      <PageSub style={{ lineHeight: 1.55, maxWidth: 680 }}>
        Every claim in the scheme, oldest first. Deciding one and paying it are two permissions held by
        two people — the database enforces that separately, so a console that offered both to one
        account would still be refused.
      </PageSub>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginTop: 18 }}>
        {[
          { v: toAssess, k: 'Waiting for a decision', tone: 'clay' as const },
          { v: toPay, k: 'Approved, not yet paid', tone: 'green' as const },
          { v: waiting, k: 'Still missing papers', tone: 'ochre' as const },
        ].map((s) => (
          <Panel key={s.k} pad={16} style={{ padding: '15px 16px' }}>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.03em', color: SKIN[s.tone].fg }}>
              {s.v}
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.35, color: C.mut, marginTop: 3 }}>{s.k}</div>
          </Panel>
        ))}
      </div>

      {failed && <NotLive what="This queue" />}

      <Kicker size={9.5} style={{ marginTop: 24 }}>THE QUEUE</Kicker>
      <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {queue.claims.map((claim) => (
          <QueueRow
            key={claim.ref}
            claim={claim}
            open={openRef === claim.ref}
            onToggle={() => setOpenRef(openRef === claim.ref ? null : claim.ref)}
            mayAssess={mayAssess}
            mayPay={mayPay}
          />
        ))}
        {queue.claims.length === 0 && (
          <div style={{ fontSize: 13.5, color: C.mut, padding: '14px 0' }}>
            Nothing waiting. That is the whole queue, not a filtered view of it.
          </div>
        )}
      </div>
    </>
  )
}

function QueueRow({
  claim,
  open,
  onToggle,
  mayAssess,
  mayPay,
}: {
  claim: ClaimQueueItem
  open: boolean
  onToggle: () => void
  mayAssess: boolean
  mayPay: boolean
}) {
  const look = stateLook(claim.state)
  const skin = SKIN[look.tone]

  return (
    <div style={{ border: `1px solid ${open ? C.line3 : skin.bc}`, borderRadius: 11, background: C.white }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          padding: 15, background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left',
        }}
      >
        <Mono size={11.5} color={C.faint} style={{ minWidth: 110 }}>{claim.ref}</Mono>
        <span style={{ flex: 1, minWidth: 150 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>
            {/* "Late" only on a death claim — writing it on an accident tells
                somebody their colleague is dead when they are in hospital. */}
            {claim.type === 'death' ? `Late ${claim.memberName}` : claim.memberName}
          </span>
          <span style={{ display: 'block', fontSize: 12, color: C.faint, marginTop: 1 }}>
            {claim.cspId} · {claim.type.replace(/_/g, ' ')} · opened {dayFirst(claim.openedAt)}
            {claim.outstandingDocs > 0 && ` · ${claim.outstandingDocs} paper${claim.outstandingDocs > 1 ? 's' : ''} outstanding`}
          </span>
        </span>
        <span
          style={{
            flex: 'none', fontSize: 12.5, fontWeight: 600, color: skin.fg,
            background: skin.bg, border: `1px solid ${skin.bc}`, borderRadius: 99, padding: '4px 11px',
          }}
        >
          {look.label}
        </span>
        <Icon name={open ? 'ph ph-caret-up' : 'ph ph-caret-down'} size={15} color={C.faint} />
      </button>

      {open && <ClaimDetail claimRef={claim.ref} mayAssess={mayAssess} mayPay={mayPay} />}
    </div>
  )
}

/** One claim: its trail, its evidence, and what may be done to it. */
function ClaimDetail({
  claimRef,
  mayAssess,
  mayPay,
}: {
  claimRef: string
  mayAssess: boolean
  mayPay: boolean
}) {
  const { api, live } = useApi()
  const { data: claim, failed } = useLive(useClaim(claimRef, CLAIM_FIXTURE), CLAIM_FIXTURE)
  const assess = useAssessClaim(claimRef)
  const pay = usePayClaim(claimRef)

  const [note, setNote] = useState('')
  const [amount, setAmount] = useState('')
  const [bankCode, setBankCode] = useState('')
  const [account, setAccount] = useState('')

  const decide = (decision: 'approve' | 'decline' | 'request_more') => {
    if (!mayAssess || assess.isPending) return
    assess.mutate({
      decision,
      note,
      // Naira on screen, kobo on the wire. A number typed into a box is not a
      // money type, and the one place that conversion may not be guessed at is
      // the field that decides what a family receives.
      amountMinor: decision === 'approve' && amount ? Math.round(Number(amount) * 100) : undefined,
    })
  }

  const noteTooShort = note.trim().length < 4

  return (
    <div style={{ padding: '0 15px 15px', borderTop: `1px solid ${C.line7}` }}>
      {failed && <NotLive what="This claim" />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16, marginTop: 14 }}>
        <div>
          <Kicker size={9.5}>THE TRAIL</Kicker>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {claim.stages.map((stage, i) => (
              <div key={`${stage.key}-${i}`} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                <Icon
                  name={stage.state === 'done' ? 'ph-fill ph-check-circle' : 'ph ph-circle-dashed'}
                  size={15}
                  color={stage.state === 'done' ? C.g : C.faint}
                  style={{ marginTop: 2 }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{stage.key.replace(/_/g, ' ')}</div>
                  <div style={{ fontSize: 12, color: C.faint, marginTop: 1 }}>
                    {stage.at ? dayFirst(stage.at) : '—'}
                    {stage.note ? ` · ${stage.note}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <Kicker size={9.5}>THE EVIDENCE</Kicker>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {claim.documents.map((doc) => {
              const received = doc.state === 'received'
              return (
                <div
                  key={doc.key}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, justifyContent: 'space-between' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <Icon
                      name={received ? 'ph-fill ph-check-circle' : 'ph ph-clock'}
                      size={15}
                      color={received ? C.g : C.ochre}
                    />
                    <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {docName(doc.key)}
                    </span>
                  </span>
                  {received && live && api ? (
                    /*
                     * Opened, not downloaded. The stream comes through the API
                     * under this assessor's own token rather than a presigned
                     * link, because a signed URL to a death certificate works
                     * for whoever ends up holding it.
                     */
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ flex: 'none', height: 30, padding: '0 12px', fontSize: 12 }}
                      onClick={() => void openDocument(api, claimRef, doc.key)}
                    >
                      Read it
                    </button>
                  ) : (
                    <Mono size={10.5} color={received ? C.g : C.ochre}>
                      {received ? 'RECEIVED' : 'WAITING'}
                    </Mono>
                  )}
                </div>
              )
            })}
            {claim.documents.length === 0 && (
              <div style={{ fontSize: 12.5, color: C.faint }}>No documents on this claim.</div>
            )}
          </div>
        </div>
      </div>

      {/* ── The decision ─────────────────────────────────────────────────── */}
      {claim.state === 'assessing' && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.line7}` }}>
          <Kicker size={9.5}>YOUR DECISION</Kicker>
          {!mayAssess ? (
            <div style={{ fontSize: 13, lineHeight: 1.5, color: C.mut, marginTop: 8 }}>
              Your role reads claims but does not decide them. An assessor does this.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                <label style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12, color: C.mut, marginBottom: 4 }}>
                    Why — kept on the claim trail
                  </span>
                  <input
                    className="field"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Certificate and ID checked against the record"
                    style={{ width: '100%' }}
                  />
                </label>
                <label style={{ flex: '0 1 180px' }}>
                  <span style={{ display: 'block', fontSize: 12, color: C.mut, marginBottom: 4 }}>
                    Amount (₦), on approval
                  </span>
                  <input
                    className="field"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                    placeholder="5000000"
                    style={{ width: '100%' }}
                  />
                </label>
              </div>

              <div style={{ display: 'flex', gap: 9, marginTop: 12, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ height: 42, padding: '0 18px', fontSize: 14 }}
                  disabled={noteTooShort || assess.isPending}
                  onClick={() => decide('approve')}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ height: 42, padding: '0 18px', fontSize: 14 }}
                  disabled={noteTooShort || assess.isPending}
                  onClick={() => decide('request_more')}
                >
                  Ask for more
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ height: 42, padding: '0 18px', fontSize: 14, color: C.clayInk, borderColor: C.clay }}
                  disabled={noteTooShort || assess.isPending}
                  onClick={() => decide('decline')}
                >
                  Decline
                </button>
                {noteTooShort && (
                  <span style={{ alignSelf: 'center', fontSize: 12.5, color: C.mut }}>
                    Say why first — a decision with no reason on the record is the one an ombudsman asks about.
                  </span>
                )}
              </div>
            </>
          )}
          {assess.isError && <Refused error={assess.error} />}
        </div>
      )}

      {/* ── Paying it ────────────────────────────────────────────────────── */}
      {claim.state === 'approved' && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.line7}` }}>
          <Kicker size={9.5}>SEND THE MONEY</Kicker>
          {!mayPay ? (
            <div style={{ fontSize: 13, lineHeight: 1.5, color: C.mut, marginTop: 8 }}>
              Approved. Operations sends it — and never the person who approved it, which the database
              holds as well as this screen.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, lineHeight: 1.5, color: C.mut, marginTop: 8 }}>
                {naira(claim.amountMinor)} to the account on the member's record. NIBSS is asked whose
                account this is first, and the name it returns is what gets stored — that is what
                catches a transposed digit.
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                <label style={{ flex: '0 1 140px' }}>
                  <span style={{ display: 'block', fontSize: 12, color: C.mut, marginBottom: 4 }}>Bank code</span>
                  <input
                    className="field"
                    inputMode="numeric"
                    value={bankCode}
                    onChange={(e) => setBankCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                    placeholder="058"
                    style={{ width: '100%' }}
                  />
                </label>
                <label style={{ flex: '0 1 200px' }}>
                  <span style={{ display: 'block', fontSize: 12, color: C.mut, marginBottom: 4 }}>
                    Account number
                  </span>
                  <input
                    className="field"
                    inputMode="numeric"
                    value={account}
                    onChange={(e) => setAccount(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="0123456789"
                    style={{ width: '100%' }}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ alignSelf: 'flex-end', height: 42, padding: '0 20px', fontSize: 14 }}
                  disabled={bankCode.length !== 3 || account.length !== 10 || pay.isPending}
                  onClick={() => pay.mutate({ bankCode, accountNumber: account })}
                >
                  {pay.isPending ? 'Sending…' : 'Send payment'}
                </button>
              </div>
            </>
          )}
          {pay.isError && <Refused error={pay.error} />}
          {pay.isSuccess && (
            <div
              style={{
                marginTop: 11, padding: '12px 14px', borderRadius: 10,
                border: `1px solid ${C.gBorder}`, background: C.gTint,
                fontSize: 13, lineHeight: 1.5, color: C.gd,
              }}
            >
              Sent — {naira(pay.data.amountMinor)} to {pay.data.accountName}, session{' '}
              <Mono size={11.5} color={C.gd}>{pay.data.sessionId}</Mono>. The name is the bank's, not
              the one typed here.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The server's refusal, verbatim.
 *
 * These messages are the product: "a claim that has not been assessed cannot be
 * paid" tells an officer what to do next, and "Request failed with status 409"
 * tells them to phone somebody.
 */
function Refused({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'That was refused.'
  return (
    <div
      style={{
        marginTop: 11, padding: '12px 14px', borderRadius: 10,
        border: `1px solid ${C.clay}`, background: C.clayBg,
        fontSize: 13, lineHeight: 1.5, color: C.clayInk,
      }}
    >
      {message}
    </div>
  )
}

/**
 * Open a document in a new tab.
 *
 * Fetched with the session's token and handed to the browser as a blob, because
 * the API refuses an unauthenticated request and a plain `<a href>` sends none.
 */
async function openDocument(api: CspApi, ref: string, docKey: string) {
  const { blob } = await api.claimDocument(ref, docKey)
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener')
  // Released once the tab has had it; revoking immediately would break the open.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
