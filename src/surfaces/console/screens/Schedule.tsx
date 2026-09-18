import { friendly } from '../../../api/problems'
import { useRef, useState } from 'react'
import { Icon } from '../../../components/Icon'
import { Kicker, Mono } from '../../../components/primitives'
import { PageSub, PageTitle, Panel } from '../../../components/surface'
import { C } from '../../../theme/tokens'
import { FORMAT_NOTES, SEND_LOG, tone } from '../data'
import { useConsole } from '../state'
import { useAuth } from '../../../api/auth'
import { SPONSOR_DASHBOARD } from '../../../api/fixtures'
import { useRollFile, useScheduleBatch, useSponsorDashboard, useUploadSchedule } from '../../../api/queries'
import { useLive } from '../../../api/live'
import { parseSchedule, type ParseResult } from '../../../api/csv'
import type { ScheduleBatch } from '../../../api/types'
import { useApi } from '../../../api/provider'

/**
 * The monthly deduction schedule — the thing this whole product exists to send.
 *
 * It leaves as a file and arrives on someone's desk. There is no live endpoint
 * anywhere in this rail, and that single fact shapes every timeline in the app.
 */
export function ConsoleSchedule() {
  const { payroll, profile, format, set, go } = useConsole()
  const { live } = useApi()
  const { can } = useAuth()
  const { data: dash } = useLive(useSponsorDashboard(SPONSOR_DASHBOARD), SPONSOR_DASHBOARD)

  const file = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [filename, setFilename] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [batchId, setBatchId] = useState<string | null>(null)

  const upload = useUploadSchedule(dash.sponsor.id)
  const batch = useScheduleBatch(dash.sponsor.id, batchId)

  // A preparer prepares. Sending is theirs; approving the cycle is not.
  const maySend = can('SCHEDULE_UPLOAD')

  /* Parsed here rather than posted as a file, because the officer should see
     what we read before eight thousand salaries are changed by it — which
     columns were used, how many rows, and which lines we could not read. */
  const choose = async (chosen: File) => {
    setProblem(null)
    setParsed(null)
    setBatchId(null)
    setFilename(chosen.name)
    try {
      setParsed(parseSchedule(await chosen.text()))
    } catch (e) {
      setProblem(friendly(e, 'That file could not be read.'))
    }
  }

  const send = () => {
    if (!parsed || !maySend || upload.isPending) return
    // The period is the month the deduction is for: the next one, since a
    // schedule goes out before the payroll cut-off.
    const next = new Date()
    next.setUTCDate(1)
    next.setUTCMonth(next.getUTCMonth() + 1)
    upload.mutate(
      {
        period: next.toISOString().slice(0, 10),
        filename: filename || 'schedule.csv',
        rows: parsed.rows,
      },
      { onSuccess: (result) => setBatchId(result.batchId) },
    )
  }

  return (
    <>
      <PageTitle>Monthly deduction schedule</PageTitle>
      <PageSub style={{ lineHeight: 1.55, maxWidth: 640 }}>
        {payroll
          ? 'One row per member: service number, NIN, name, amount and the deduction code. It goes out before the payroll cut-off, and the money follows weeks later as a single credit.'
          : 'Self-paying members are collected by direct debit, so there is no schedule to prepare — this screen only shows the run that replaces it.'}
      </PageSub>

      {!payroll && (
        <div
          style={{
            display: 'flex', gap: 11, alignItems: 'flex-start', marginTop: 18, padding: '14px 15px',
            border: `1.5px solid ${C.ochreBorder}`, borderRadius: 12, background: C.ochreBg,
          }}
        >
          <Icon name="ph-fill ph-info" size={19} color={C.ochre} />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ochreInk }}>
              Self-paying sponsors have no schedule to send
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.ochre, marginTop: 3 }}>
              There is no payroll office in this rail. Money is collected by direct debit — use the{' '}
              <button
                type="button"
                onClick={() => go('debit')}
                style={{ border: 0, background: 'transparent', padding: 0, color: C.g, font: 'inherit', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
              >
                collection run
              </button>{' '}
              instead.
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))',
          gap: 14, marginTop: 20, alignItems: 'start',
        }}
      >
        <Panel pad={18}>
          <Kicker size={9.5}>STEP 1 · WHAT GOES OUT</Kicker>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>September 2026 schedule</div>
          <div style={{ marginTop: 12 }}>
            {[
              { k: 'Members on the file', v: '8,440', color: undefined },
              { k: 'Total to deduct', v: '₦21,144,000', color: undefined },
              { k: 'Changed since August', v: '+37 · −9 · 14 tier', color: C.g },
              { k: 'Payroll cut-off', v: '05.09 · 3 days', color: C.clay },
            ].map((r, i, arr) => (
              <div
                key={r.k}
                style={{
                  display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0',
                  borderBottom: i === arr.length - 1 ? undefined : `1px solid ${C.line7}`,
                }}
              >
                <span style={{ fontSize: 13, color: C.mut }}>{r.k}</span>
                <Mono size={13.5} weight={500} color={r.color}>{r.v}</Mono>
              </div>
            ))}
          </div>

          <Kicker size={9.5} style={{ marginTop: 18 }}>FILE FORMAT</Kicker>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {profile.formats.map((name, i) => {
              const on = format === i
              return (
                <button
                  key={name}
                  type="button"
                  className="chip"
                  onClick={() => set({ format: i })}
                  style={{
                    padding: '8px 13px', borderRadius: 999,
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
          <div style={{ fontSize: 12, lineHeight: 1.5, color: C.faint, marginTop: 9 }}>
            {FORMAT_NOTES[Math.min(format, FORMAT_NOTES.length - 1)]}
          </div>
        </Panel>

        <Panel pad={18}>
          <Kicker size={9.5}>STEP 2 · WHERE IT GOES</Kicker>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>{profile.dest}</div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: C.mut, marginTop: 6 }}>
            {payroll
              ? 'The schedule leaves our system as a file and arrives on someone’s desk. There is no live endpoint anywhere in this rail — that single fact shapes every timeline in the app.'
              : 'Nothing is sent to an employer. Mandates go straight to the banks through NIBSS and answer the same day.'}
          </div>

          <div
            style={{
              marginTop: 14, padding: '13px 14px', border: `1px solid ${C.gBorder}`,
              borderRadius: 11, background: C.gTint,
            }}
          >
            <Mono size={10} color={C.g} style={{ display: 'block', letterSpacing: '.1em' }}>DEDUCTION CODE</Mono>
            <Mono size={17} weight={500} style={{ display: 'block', marginTop: 3 }}>{profile.code}</Mono>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: C.mut, marginTop: 5 }}>{profile.codeNote}</div>
          </div>

          {/* Live, the schedule is a file an officer chooses. On fixtures the
              button stands on its own, because the demo has no file to read. */}
          {live && payroll && (
            <>
              <input
                ref={file}
                type="file"
                accept=".csv,text/csv"
                aria-label="Choose a schedule file"
                onChange={(e) => {
                  const chosen = e.target.files?.[0]
                  if (chosen) void choose(chosen)
                }}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%', height: 46, fontSize: 14, gap: 8, marginTop: 16 }}
                onClick={() => file.current?.click()}
              >
                <Icon name="ph ph-upload-simple" size={16} />
                {filename || 'Choose the schedule file'}
              </button>
              {problem && <Problem message={problem} />}
              {parsed && <ParsedSummary parsed={parsed} />}
            </>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
            <button
              type="button"
              className="btn btn-md btn-primary"
              style={{ width: '100%', height: 50, gap: 8 }}
              disabled={live && (!maySend || !parsed || upload.isPending)}
              title={maySend ? undefined : 'Your role cannot send a schedule.'}
              onClick={send}
            >
              <Icon name="ph ph-paper-plane-tilt" size={17} />
              {upload.isPending
                ? 'Sending…'
                : payroll ? `Send to ${profile.destShort}` : 'Present the debit run'}
            </button>
            <button type="button" className="btn btn-secondary" style={{ width: '100%', height: 46, fontSize: 14, gap: 8 }}>
              <Icon name="ph ph-download-simple" size={16} />
              Download to check first
            </button>
          </div>

          {upload.isError && (
            <Problem
              message={
                friendly(upload.error, 'That schedule was refused.')
              }
            />
          )}
          {batch.data && <BatchProgress batch={batch.data} />}
          {batch.data?.state === 'complete' && batchId && (
            <RollFilePanel sponsorId={dash.sponsor.id} batchId={batchId} />
          )}
          {/* Two-person control. An internal auditor asks about this first. */}
          <div style={{ fontSize: 12, lineHeight: 1.5, color: C.faint, marginTop: 10 }}>
            Sending needs a second approver. Amina prepares, Musa approves — no single person can change what payroll
            deducts.
          </div>
        </Panel>
      </div>

      <Kicker size={9.5} style={{ marginTop: 26 }}>STEP 3 · WHAT CAME BACK · LAST SIX CYCLES</Kicker>
      <Panel pad={16} style={{ marginTop: 9, padding: '4px 16px' }}>
        {SEND_LOG.map((lg, i) => {
          const skin = tone(lg.tone)
          return (
            <div
              key={lg.period}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', flexWrap: 'wrap',
                borderBottom: `1px solid ${i === SEND_LOG.length - 1 ? 'transparent' : C.line7}`,
              }}
            >
              <Mono size={12} color={C.faint} style={{ minWidth: 64 }}>{lg.period}</Mono>
              <span style={{ flex: 1, minWidth: 150, fontSize: 13.5, fontWeight: 500 }}>{lg.what}</span>
              <Mono size={12.5} color={C.mut} style={{ minWidth: 96, textAlign: 'right' }}>{lg.amount}</Mono>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 132 }}>
                <Icon
                  name={lg.tone === 'green' ? 'ph-fill ph-check-circle' : 'ph-fill ph-circle-notch'}
                  size={14}
                  color={skin.ic}
                />
                <span style={{ fontSize: 12.5, fontWeight: 500, color: skin.ic }}>{lg.state}</span>
              </span>
            </div>
          )
        })}
        <div style={{ padding: '12px 0 14px', fontSize: 12, lineHeight: 1.5, color: C.faint }}>
          A cycle is only closed when the return file has been reconciled — not when the money lands. One credit covers
          thousands of members, so the file is the only thing that says who is actually covered.
        </div>
      </Panel>
    </>
  )
}

/** Something is wrong with the file, said plainly enough to fix it. */
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

/**
 * What we read, before anything is sent.
 *
 * Including which column each field came from. Payroll exports name their
 * columns differently and this guesses; showing the guess is what lets an
 * officer catch it reading "premium" as the amount when the file also has a
 * "deduction" column.
 */
function ParsedSummary({ parsed }: { parsed: ParseResult }) {
  return (
    <div
      style={{
        marginTop: 12, padding: '12px 13px', border: `1px solid ${C.line}`,
        borderRadius: 10, background: C.white,
      }}
    >
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>
        {parsed.rows.length.toLocaleString('en-NG')} rows ready
      </div>
      <Mono size={11} color={C.faint} style={{ display: 'block', marginTop: 4, lineHeight: 1.6 }}>
        service no ← {parsed.usedColumns.serviceNo}
        <br />
        name ← {parsed.usedColumns.name}
        <br />
        amount ← {parsed.usedColumns.amount}
      </Mono>
      {parsed.problems.length > 0 && (
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.ochre, marginTop: 8 }}>
          {parsed.problems.length} line(s) could not be read and will not be sent — line{' '}
          {parsed.problems[0].line}: {parsed.problems[0].reason}
          {parsed.problems.length > 1 ? `, and ${parsed.problems.length - 1} more.` : '.'}
        </div>
      )}
    </div>
  )
}

/**
 * The signed record of what was sent.
 *
 * Offered here rather than buried in a reports screen, because the moment an
 * officer has just handed over eight thousand salaries is the moment the
 * receipt is worth having. It is a receipt in the strict sense: the file says
 * what arrived and what was taken, and the signature says we cannot have
 * changed our mind about it afterwards.
 */
function RollFilePanel({ sponsorId, batchId }: { sponsorId: string; batchId: string }) {
  const { api } = useApi()
  const rollFile = useRollFile(sponsorId, batchId)
  const [problem, setProblem] = useState<string | null>(null)

  const save = async (part: 'download' | 'signature') => {
    setProblem(null)
    try {
      const { blob, filename } = await api!.rollFileDownload(sponsorId, batchId, part)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      // Revoked on the next tick: revoking immediately races the click on
      // Safari and the file arrives empty.
      setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (e) {
      setProblem(friendly(e, 'That file could not be downloaded.'))
    }
  }

  const data = rollFile.data
  if (!data) return null

  if (data.error) {
    return (
      <div style={{ marginTop: 10 }}>
        <Problem
          message={
            'The schedule loaded correctly, but the signed record of it could not be written. ' +
            'The deductions are unaffected. Someone should look at this before the cycle closes.'
          }
        />
      </div>
    )
  }

  // Neither a key nor an error: the step has not run yet. The hook is polling.
  if (!data.objectKey) {
    return (
      <div style={{ fontSize: 12.5, color: C.mut, marginTop: 10 }}>Writing the signed record…</div>
    )
  }

  return (
    <div
      style={{
        marginTop: 10, padding: '12px 13px', borderRadius: 10,
        border: `1px solid ${C.line}`, background: C.white,
      }}
    >
      <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>Signed record</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.55, color: C.mut, marginTop: 4 }}>
        What this payroll sent and what was taken, as one file, signed. Keep it with the month's
        paperwork — it is what answers a query about this schedule in a year's time.
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => save('download')} style={saveButton}>
          <Icon name="ph ph-download-simple" size={14} /> Download
        </button>
        <button type="button" onClick={() => save('signature')} style={saveButton}>
          Signature
        </button>
      </div>
      <Mono size={11} color={C.faint}>
        <div style={{ marginTop: 9, wordBreak: 'break-all' }}>sha256 {data.sha256}</div>
      </Mono>
      {problem && <Problem message={problem} />}
    </div>
  )
}

const saveButton = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '7px 11px', borderRadius: 8, border: `1px solid ${C.line}`,
  background: C.white, color: C.ink, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
} as const

/**
 * The load, while it runs.
 *
 * The bar is loaded against staged, not matched against staged: matched climbs
 * first and then loaded follows, so a single bar would appear to finish twice.
 */
function BatchProgress({ batch }: { batch: ScheduleBatch }) {
  const done = batch.state === 'complete'
  const rejected = batch.stagedCount - batch.loadedCount
  const pct = batch.stagedCount === 0 ? 0 : Math.round((batch.loadedCount / batch.stagedCount) * 100)

  return (
    <div
      role="status"
      style={{
        marginTop: 12, padding: '12px 13px', borderRadius: 10,
        border: `1px solid ${done ? C.gBorder : C.line}`,
        background: done ? C.gTint : C.white,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: done ? C.gd : C.ink }}>
          {done ? 'Loaded' : 'Loading…'}
        </span>
        <Mono size={12} color={C.mut}>
          {batch.loadedCount.toLocaleString('en-NG')} of {batch.stagedCount.toLocaleString('en-NG')}
        </Mono>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: C.line8, marginTop: 9, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: C.g, transition: 'width .3s' }} />
      </div>
      {done && rejected > 0 && (
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.ochre, marginTop: 8 }}>
          {rejected.toLocaleString('en-NG')} row(s) matched no member on this sponsor and were not
          loaded. They are listed against the batch with their line numbers.
        </div>
      )}
      {batch.failure && <Problem message={batch.failure} />}
    </div>
  )
}
