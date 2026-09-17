import { Icon } from '../../../components/Icon'
import { Kicker, Mono } from '../../../components/primitives'
import { CLAIM } from '../../../data/member'
import { CLAIM_FIXTURE, MY_CLAIMS } from '../../../api/fixtures'
import { useClaim, useMyClaims } from '../../../api/queries'
import { useClaimWizard } from '../../../api/claim'
import { DocumentPicker, docName } from '../../../components/DocumentPicker'
import { EN_ONLY, fill } from '../../../i18n'
import { NotLive, dayFirst, useLive } from '../../../api/live'
import { C, MONO } from '../../../theme/tokens'
import { WEB_CLAIM_SUMMARY } from '../data'
import { PageTitle, Panel } from '../../../components/surface'
import { useWeb } from '../state'

const CL_ICONS = [
  ['ph ph-flower-lotus', 'ph ph-first-aid', 'ph ph-wheelchair'],
  ['ph ph-user', 'ph ph-heart', 'ph ph-flower-lotus'],
]

/**
 * Claim wizard. Same five steps as the phone, but the document step takes real
 * scans up to 10 MB rather than camera photos — both land in the same store
 * with the same OCR pass.
 */
export function WebClaim() {
  const { t, clStep, cl, set, go } = useWeb()
  const claim = useClaimWizard()

  // The server's list for this claim type, not the mockup's four papers. Empty
  // on fixtures, where no claim was opened and the demo runs as it always has.
  const docs = claim.ref ? claim.requiredDocs : []
  const busy = claim.opening || Object.values(claim.docState).includes('sending')

  const next = async () => {
    // The claim is created on the way out of "who for": the server decides
    // which papers it wants, and it needs both answers to decide.
    if (clStep === 1) {
      const opened = await claim.open(cl[0], cl[1])
      if (claim.error && !opened) return
    }
    if (clStep < 4) return set({ clStep: clStep + 1 })
    set({ clStep: 0 })
    claim.reset()
    go('track')
  }

  return (
    <div className="rise page">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {t.cl_q.map((_, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ height: 4, borderRadius: 99, background: i <= clStep ? C.g : C.line }} />
            <Mono
              size={9.5}
              color={i === clStep ? C.gd : C.faint}
              weight={i === clStep ? 600 : 400}
              style={{ letterSpacing: '.06em' }}
            >
              {`0${i + 1}`}
            </Mono>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        <PageTitle>{t.cl_q[clStep]}</PageTitle>
      </div>
      {/* See the note on the phone screen: `cl_h[4]` carries the mockup's claim
          number, which would print above the member's real one. */}
      {clStep < 4 && (
        <div style={{ fontSize: 14, lineHeight: 1.5, color: C.mut, marginTop: 5 }}>{t.cl_h[clStep]}</div>
      )}

      {clStep < 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 18, maxWidth: 560 }}>
          {t.cl_o[clStep].map((label, i) => {
            const on = cl[clStep] === i
            return (
              <button
                key={label}
                type="button"
                className="pick"
                onClick={() => {
                  const next = cl.slice()
                  next[clStep] = i
                  set({ cl: next })
                }}
                style={{
                  gap: 12, padding: 16, borderRadius: 11,
                  border: `1.5px solid ${on ? C.g : C.line3}`,
                  background: on ? C.gTint : C.white,
                }}
              >
                <Icon name={CL_ICONS[clStep]?.[i] ?? 'ph ph-circle'} size={20} color={C.g} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 15.5, fontWeight: 600 }}>{label}</span>
                <Icon name="ph ph-arrow-right" size={16} color={C.faint} />
              </button>
            )
          })}
        </div>
      )}

      {clStep === 2 && (
        <>
          <div className="cards" style={{ marginTop: 18 }}>
            {docs.length > 0
              ? docs.map((key) => {
                  const state = claim.docState[key] ?? 'waiting'
                  const done = state === 'received'
                  const failed = state === 'failed'
                  return (
                    <div
                      key={key}
                      style={{
                        padding: 16,
                        border: `1.5px dashed ${done ? '#B9D3C6' : failed ? C.clay : C.line9}`,
                        borderRadius: 11,
                        background: done ? C.gTint : C.white,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14.5, fontWeight: 600 }}>{docName(key)}</div>
                          <div
                            style={{
                              fontSize: 12.5, marginTop: 2,
                              color: failed ? C.clayInk : done ? C.g : C.mut,
                            }}
                          >
                            {done
                              ? EN_ONLY.doc_received
                              : failed
                                ? EN_ONLY.doc_failed
                                : state === 'sending'
                                  ? EN_ONLY.doc_sending
                                  : 'PDF, JPG or PNG · max 10 MB'}
                          </div>
                        </div>
                        <Icon
                          name={
                            done
                              ? 'ph-fill ph-check-circle'
                              : failed
                                ? 'ph-fill ph-warning-circle'
                                : 'ph ph-upload-simple'
                          }
                          size={20}
                          color={done ? C.g : failed ? C.clay : C.faint}
                        />
                      </div>
                      <div style={{ marginTop: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <DocumentPicker
                          docKey={key}
                          state={state}
                          compact
                          onPick={(file) => void claim.send(key, file)}
                        />
                      </div>
                    </div>
                  )
                })
              : t.docs_n.map((name, i) => (
                  <div
                    key={name}
                    style={{
                      padding: 16,
                      border: `1.5px dashed ${i < 2 ? '#B9D3C6' : C.line9}`,
                      borderRadius: 11,
                      background: i < 2 ? C.gTint : C.white,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 14.5, fontWeight: 600 }}>{name}</div>
                        <div style={{ fontSize: 12.5, color: C.mut, marginTop: 2 }}>{t.docs_s[i]}</div>
                      </div>
                      <Icon
                        name={i < 2 ? 'ph-fill ph-check-circle' : 'ph ph-upload-simple'}
                        size={20}
                        color={i < 2 ? C.g : C.faint}
                      />
                    </div>
                    <div style={{ marginTop: 11 }}>
                      <Mono size={10.5} color={C.faint}>
                        {i < 2 ? 'PDF · 1.2 MB' : 'PDF, JPG or PNG · max 10 MB'}
                      </Mono>
                    </div>
                  </div>
                ))}
          </div>

          {docs.length > 0 && (
            <div
              style={{
                marginTop: 12, fontSize: 14, fontWeight: 600,
                color: claim.outstanding === 0 ? C.g : C.ochre,
              }}
            >
              {claim.outstanding === 0
                ? EN_ONLY.doc_all_in
                : claim.outstanding === 1
                  ? EN_ONLY.doc_outstanding_one
                  : fill(EN_ONLY.doc_outstanding_many, { n: String(claim.outstanding) })}
            </div>
          )}

          <div
            style={{
              marginTop: 12, padding: '14px 16px', borderRadius: 10, background: C.white,
              border: `1px solid ${C.line}`, fontSize: 13, lineHeight: 1.55, color: C.mut,
            }}
          >
            Web takes a dragged-in scan and the phone photographs the same papers — both go to the same
            store, straight from the browser, and never through the API. {docs.length > 0 ? EN_ONLY.doc_photograph_note : t.docs_note}
          </div>
        </>
      )}

      {clStep === 3 && (
        <>
          <div style={{ marginTop: 18, maxWidth: 620 }}>
            <div style={{ borderRadius: 12, background: C.white, border: `1px solid ${C.line}`, overflow: 'hidden' }}>
              {t.sum_k.map((k, i) => (
                <div
                  key={k}
                  style={{
                    display: 'flex', justifyContent: 'space-between', gap: 16,
                    padding: '13px 17px', borderTop: '1px solid #EFEEE8',
                  }}
                >
                  <span style={{ fontSize: 13.5, color: C.mut }}>{k}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, textAlign: 'right' }}>{WEB_CLAIM_SUMMARY[i]}</span>
                </div>
              ))}
            </div>
          </div>
          <div
            style={{ marginTop: 12, padding: '15px 17px', borderRadius: 11, background: C.gTint, border: '1px solid #D8E6DE' }}
          >
            <div style={{ fontSize: 14.5, fontWeight: 600, color: C.gd }}>{t.funeral_first}</div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: C.g, marginTop: 3 }}>{t.funeral_first_sub}</div>
          </div>
        </>
      )}

      {clStep === 4 && (
        <div style={{ marginTop: 18, padding: 24, borderRadius: 13, background: C.g, color: C.gTint, maxWidth: 560 }}>
          <Icon name="ph-fill ph-check-circle" size={34} />
          <div style={{ fontSize: 19, fontWeight: 600, marginTop: 12 }}>
            {t.claim_ref} {claim.ref ?? CLAIM.newRef}
          </div>
          {claim.funeralAdvanceRef && (
            <div style={{ fontSize: 14, marginTop: 4, color: 'rgba(241,246,243,.9)' }}>
              {t.funeral_first} {claim.funeralAdvanceRef}
            </div>
          )}
          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'rgba(241,246,243,.85)', marginTop: 6 }}>
            {t.assessor_note}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        {clStep > 0 && clStep < 4 && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ height: 46, padding: '0 20px', fontSize: 15 }}
            onClick={() => set({ clStep: Math.max(0, clStep - 1) })}
          >
            {t.back}
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          style={{ height: 46, padding: '0 24px', fontSize: 15, opacity: busy ? 0.7 : 1 }}
          // Held until every paper is in: a claim finished with documents
          // outstanding sits at documents_pending and nobody is told why.
          disabled={busy || (clStep === 2 && docs.length > 0 && claim.outstanding > 0)}
          onClick={() => void next()}
        >
          {claim.opening ? EN_ONLY.claim_opening : t.cl_cta[clStep]}
        </button>
      </div>

      {claim.error && (
        <div
          style={{
            marginTop: 12, maxWidth: 560, padding: '13px 15px', borderRadius: 10,
            border: `1px solid ${C.clay}`, background: C.clayBg,
            fontSize: 13.5, lineHeight: 1.5, color: C.clayInk,
          }}
        >
          {claim.error}
        </div>
      )}
    </div>
  )
}

/** Track claim. The audit trail, which is the product's real differentiator. */
export function WebTrack() {
  const { t, sponsor, lang } = useWeb()

  /* Same two reads as the phone's tracking screen: the list, then the detail.
     A member cannot be asked for a reference they were never given. */
  const { data: mine, failed: listFailed, provisional } = useLive(useMyClaims(MY_CLAIMS), MY_CLAIMS)
  const ref = provisional ? '' : (mine.claims[0]?.ref ?? '')
  const { data: claim, failed: detailFailed } = useLive(useClaim(ref, CLAIM_FIXTURE), CLAIM_FIXTURE)
  const failed = listFailed || detailFailed

  const langName = { en: 'English', ha: 'Hausa', yo: 'Yorùbá', ig: 'Igbo', pcm: 'Pidgin' }[lang]
  const assessor = claim.assessor

  const notes = [
    `Filed from this browser at ${sponsor.short}.`,
    'Death certificate and ID read and accepted.',
    assessor ? `${assessor.name}, ${assessor.office}, is reading them now.` : 'Being read now.',
    `You are told by SMS and here, in ${langName}.`,
    'Paid to the account on your record, not to the sponsor.',
  ]

  return (
    <div className="rise page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20 }}>
        <div>
          <Kicker>
            {claim.ref} · {t.funeral_benefit}
          </Kicker>
          <div style={{ marginTop: 6 }}>
            <PageTitle>{t.claim_status}</PageTitle>
          </div>
          <div style={{ fontSize: 14, color: C.mut, marginTop: 4 }}>{t.claim_status_sub}</div>
          {failed && <NotLive what="This claim" />}
        </div>
        <button type="button" className="btn btn-secondary" style={{ height: 42, padding: '0 18px', fontSize: 14, gap: 8 }}>
          <Icon name="ph ph-chat-circle-text" size={16} color={C.g} />
          {t.msg_assessor}
        </button>
      </div>

      <div className="lead" style={{ marginTop: 18 }}>
        <Panel pad={20}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {t.stages.map((title, i) => {
              // The claim's own audit log, one stage per translated title.
              const stage = claim.stages[i] ?? null
              const st = (stage?.state ?? 'todo') as 'done' | 'now' | 'todo'
              return (
                <div key={title} style={{ display: 'flex', gap: 13 }}>
                  <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Icon
                      name={
                        st === 'done'
                          ? 'ph-fill ph-check-circle'
                          : st === 'now'
                            ? 'ph-fill ph-circle-notch'
                            : 'ph ph-circle'
                      }
                      size={19}
                      color={st === 'todo' ? C.line9 : C.g}
                    />
                    <div style={{ flex: 1, width: 2, background: st === 'done' ? C.g : C.line, minHeight: 16 }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, paddingBottom: 18 }}>
                    <div style={{ fontSize: 15, fontWeight: st === 'now' ? 700 : 500, color: st === 'todo' ? C.faint : C.ink }}>
                      {title}
                    </div>
                    <Mono size={11} color={C.faint} style={{ display: 'block', marginTop: 2 }}>
                      {stage && stage.at ? dayFirst(stage.at) : t.stage_when[i]}
                    </Mono>
                    <div style={{ fontSize: 13, lineHeight: 1.5, color: C.mut, marginTop: 4 }}>{notes[i]}</div>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ paddingTop: 12, borderTop: '1px solid #EFEEE8', fontSize: 12, lineHeight: 1.5, color: C.faint }}>
            {t.audit_note}
          </div>
        </Panel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ padding: 17, borderRadius: 12, background: C.gTint, border: '1px solid #D8E6DE' }}>
            <Kicker size={9.5} color={C.g}>{t.now_title}</Kicker>
            <div style={{ fontSize: 15.5, fontWeight: 600, color: C.gd, marginTop: 6 }}>{t.now_head}</div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: C.g, marginTop: 4 }}>{t.now_body}</div>
          </div>

          <Panel pad={17}>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>{t.separate_title}</div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: C.mut, marginTop: 4 }}>{t.separate_sub}</div>
          </Panel>

          <Panel pad={17}>
            <Kicker size={9.5}>DOCUMENTS</Kicker>
            {/* The claim's own documents and their real states. This panel used
                to list the mockup's four papers and call the first three
                ACCEPTED whatever the claim said — including on a claim still
                waiting for all of them. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 9 }}>
              {claim.documents.map((doc) => {
                const received = doc.state === 'received'
                return (
                  <div
                    key={doc.key}
                    style={{
                      display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center',
                      padding: '8px 0', borderTop: '1px solid #EFEEE8',
                    }}
                  >
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                      <Icon
                        name={received ? 'ph-fill ph-check-circle' : 'ph ph-clock'}
                        size={15}
                        color={received ? C.g : C.ochre}
                      />
                      <span style={{ fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {docName(doc.key)}
                      </span>
                    </span>
                    <span
                      style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: received ? C.g : C.ochre }}
                    >
                      {received ? 'RECEIVED' : 'WAITING'}
                    </span>
                  </div>
                )
              })}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
