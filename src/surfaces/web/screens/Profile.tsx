import { Icon } from '../../../components/Icon'
import { Kicker } from '../../../components/primitives'
import { LANGS, type Lang } from '../../../i18n'
import { C, MONO } from '../../../theme/tokens'
import { PHONE_ONLY, SESSIONS, WEB_MEMBER, WEB_ONLY } from '../data'
import { FeatureRow, PageSub, PageTitle, Panel } from '../../../components/surface'
import { useWeb } from '../state'

/**
 * Profile and settings. The honest bit here is the payroll record: on a payroll
 * rail the member cannot edit their own name, grade or gross pay — those are
 * read from the monthly file, and only HR can change them. Saying so prevents a
 * support queue full of "why can't I fix my own name".
 */
export function WebProfile() {
  const { t, lang, setLang, sponsor, go } = useWeb()
  const payroll = sponsor.payroll

  const record: [string, string][] = [
    [t.rec_k[0], WEB_MEMBER.fullName],
    [t.rec_k[1], WEB_MEMBER.grade],
    [t.rec_k[2], sponsor.org],
    [t.rec_k[3], WEB_MEMBER.dob],
    [t.rec_k[4], WEB_MEMBER.gross],
  ]

  const sessionColor = (state: string) =>
    state === 'REVOKED' ? C.clay : state === 'THIS SESSION' ? C.gd : C.g

  return (
    <div className="rise page">
      <PageTitle>Profile and settings</PageTitle>
      <PageSub>
        Your record comes from {payroll ? `${sponsor.org}'s payroll file` : 'what you gave us at sign-up'}. Some
        fields only they can change.
      </PageSub>

      <div className="cards" style={{ marginTop: 18 }}>
        <Panel>
          <Kicker size={9.5}>PAYROLL RECORD</Kicker>
          <div style={{ marginTop: 9 }}>
            {record.map(([k, v]) => (
              <div
                key={k}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '10px 0', borderTop: '1px solid #EFEEE8' }}
              >
                <span style={{ fontSize: 13.5, color: C.mut }}>{k}</span>
                <span style={{ fontSize: 14, fontWeight: 600, textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 11, fontSize: 12.5, lineHeight: 1.5, color: C.faint }}>
            {payroll
              ? 'Name, grade and gross pay are read from the payroll file each month. To change them, your HR officer edits the record — we cannot.'
              : 'You maintain these yourself. A change to your bank details re-verifies the mandate with NIBSS before the next debit.'}
          </div>
        </Panel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Panel>
            <Kicker size={9.5}>{t.device}S AND SESSIONS</Kicker>
            <div style={{ marginTop: 9 }}>
              {SESSIONS.map((d) => {
                const state = d.state === 'trusted' ? t.trusted.toUpperCase() : d.state
                return (
                  <div
                    key={d.name}
                    style={{ display: 'flex', gap: 11, alignItems: 'center', padding: '10px 0', borderTop: '1px solid #EFEEE8' }}
                  >
                    <Icon name={d.icon} size={18} color={C.mut} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{d.name}</span>
                      <span style={{ display: 'block', fontSize: 12, color: C.faint }}>{d.meta}</span>
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: sessionColor(d.state) }}>
                      {state}
                    </span>
                  </div>
                )
              })}
            </div>
            <div style={{ marginTop: 11, fontSize: 12.5, lineHeight: 1.5, color: C.faint }}>{t.device_note}</div>
          </Panel>

          <Panel>
            <Kicker size={9.5}>{t.language}</Kicker>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {LANGS.map(([code, name]) => {
                const on = lang === code
                return (
                  <button
                    key={code}
                    type="button"
                    className="chip"
                    onClick={() => setLang(code as Lang)}
                    style={{
                      padding: '7px 13px',
                      border: `1.5px solid ${on ? C.g : C.line2}`,
                      background: on ? C.gTint : 'transparent',
                      color: on ? C.gd : C.mut,
                      fontSize: 13, fontWeight: on ? 600 : 500,
                    }}
                  >
                    {name}
                  </button>
                )
              })}
            </div>
            <div style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.5, color: C.faint }}>
              Set per account, not per device — the phone app follows this choice at next sign-in. Machine-drafted
              translations still need a native-speaker pass.
            </div>
          </Panel>
        </div>
      </div>

      {/* Neither surface replaces the other, and both say so in place. */}
      <div className="cards" style={{ marginTop: 14 }}>
        <Panel>
          <Kicker size={9.5} color={C.g}>ONLY ON WEB</Kicker>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
            {WEB_ONLY.map((w) => (
              <FeatureRow key={w.title} icon={w.icon} title={w.title} body={w.body} />
            ))}
          </div>
        </Panel>

        <Panel dashed>
          <Kicker size={9.5}>ONLY ON THE PHONE</Kicker>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
            {PHONE_ONLY.map((p) => (
              <FeatureRow key={p.title} icon={p.icon} title={p.title} body={p.body} muted />
            ))}
          </div>
        </Panel>
      </div>

      <button
        type="button"
        className="btn"
        style={{
          marginTop: 16, height: 44, padding: '0 20px', gap: 8,
          border: '1.5px solid #E3C7BC', background: C.white, color: C.clay, fontSize: 15,
        }}
        onClick={() => go('signin')}
      >
        <Icon name="ph ph-sign-out" size={17} />
        Sign out of this browser
      </button>
    </div>
  )
}
