import { Icon } from '../../../components/Icon'
import { Kicker, Mono } from '../../../components/primitives'
import { EN_ONLY, LANGS, type Lang } from '../../../i18n'
import { collectionFor, exceptionColors } from '../../../data/collection'
import { MEMBER } from '../../../data/member'
import { C } from '../../../theme/tokens'
import { Screen, BackButton } from '../Screen'
import { usePhone } from '../state'
import { MORE_ICONS, MORE_TARGETS } from '../nav'

export function ProfileScreen() {
  const { t, lang, setLang, go } = usePhone()

  // `more_i` carries six labels; "How you pay" is spliced in at index 1 because
  // the payment rail became a first-class screen only in v3.
  const labels = [...t.more_i]
  labels.splice(1, 0, t.more_pay)

  return (
    <Screen scroll>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, paddingTop: 14 }}>
        <div
          style={{
            width: 50, height: 50, borderRadius: '50%', background: C.gTint2,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 17, fontWeight: 700, color: C.g,
          }}
        >
          {MEMBER.initials}
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{MEMBER.name}</div>
          <Mono size={12} color={C.mut} style={{ display: 'block', marginTop: 2 }}>
            CSP-ID {MEMBER.cspId}
          </Mono>
        </div>
      </div>

      <Kicker style={{ marginTop: 24 }}>{t.language}</Kicker>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 9 }}>
        {LANGS.map(([code, name]) => {
          const on = lang === code
          return (
            <button
              key={code}
              type="button"
              className="chip"
              onClick={() => setLang(code as Lang)}
              style={{
                padding: '9px 14px',
                border: `1.5px solid ${on ? C.g : C.line3}`,
                background: on ? C.gTint : C.white,
                color: on ? C.gd : C.ink,
                fontSize: 13.5, fontWeight: on ? 600 : 500,
              }}
            >
              {name}
            </button>
          )
        })}
      </div>

      <div style={{ marginTop: 22 }}>
        {labels.map((title, i) => (
          <button
            key={title}
            type="button"
            className="row-hover"
            onClick={() => go(MORE_TARGETS[i])}
            style={{
              display: 'flex', alignItems: 'center', gap: 13, width: '100%', textAlign: 'left',
              padding: '16px 2px', border: 0, borderBottom: `1px solid ${C.line5}`,
              background: 'transparent', cursor: 'pointer',
            }}
          >
            <Icon name={MORE_ICONS[i]} size={21} color={C.g} />
            <span style={{ flex: 1, fontSize: 15.5, fontWeight: 500 }}>{title}</span>
            <Icon name="ph ph-caret-right" size={15} color={C.ghost2} />
          </button>
        ))}
      </div>

      <div style={{ marginTop: 22, fontSize: 12, lineHeight: 1.6, color: C.ghost }}>{t.disclaimer}</div>
    </Screen>
  )
}

/**
 * The sponsor console as an HR officer sees it on a handset. The full desktop
 * console is its own surface; this is the pocket version of the same cycle and
 * the same exceptions queue.
 */
export function HrConsoleScreen() {
  const { sponsor, go } = usePhone()
  const col = collectionFor(sponsor)
  const stats = [...col.stats, { v: String(col.exceptionTotal), k: 'Exceptions to clear' }]

  return (
    <Screen scroll pad="6px 22px 40px">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Mono
              size={9}
              color={C.g}
              style={{ letterSpacing: '.1em', border: `1px solid ${C.gBorder}`, borderRadius: 5, padding: '2px 6px' }}
            >
              {sponsor.tag}
            </Mono>
            <Mono size={9.5} color={C.faint} style={{ letterSpacing: '.12em' }}>{EN_ONLY.console_label}</Mono>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', marginTop: 4 }}>{sponsor.org}</div>
        </div>
        <button
          type="button"
          className="chip"
          onClick={() => go('home')}
          style={{
            padding: '8px 13px', border: `1px solid ${C.line3}`, background: C.white,
            color: C.mut, fontSize: 12.5, fontWeight: 600,
          }}
        >
          {EN_ONLY.console_switch}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 18 }}>
        {stats.map((s, i) => (
          <div key={s.k} className="card" style={{ padding: 15 }}>
            <div
              style={{
                fontSize: 25, fontWeight: 700, letterSpacing: '-.025em',
                color: i === stats.length - 1 ? C.clay : C.ink,
              }}
            >
              {s.v}
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.35, color: C.mut, marginTop: 3 }}>{s.k}</div>
          </div>
        ))}
      </div>

      <Kicker size={9.5} style={{ marginTop: 24 }}>{EN_ONLY.console_needs_you}</Kicker>
      <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 9 }}>
        {col.tasks.map((task) => (
          <button
            key={task.title}
            type="button"
            className="pick"
            style={{ gap: 12, padding: 15, border: `1px solid ${task.bc}`, background: C.white }}
          >
            <Icon name={task.icon} size={21} color={task.ic} />
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 15.5, fontWeight: 600 }}>{task.title}</span>
              <span style={{ display: 'block', fontSize: 12.5, color: C.mut, marginTop: 2 }}>{task.sub}</span>
            </span>
            <span style={{ fontSize: 16, fontWeight: 700, color: task.ic }}>{task.count}</span>
          </button>
        ))}
      </div>

      <Kicker size={9.5} style={{ marginTop: 26 }}>{col.cycleHeading}</Kicker>
      <div className="card" style={{ marginTop: 9, padding: 16 }}>
        {col.cycle.map((c, i) => {
          const last = i === col.cycle.length - 1
          return (
            <div key={c.title} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 11, alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                <Icon
                  name={c.state === 'done' ? 'ph-fill ph-check-circle' : 'ph-fill ph-circle-notch'}
                  size={19}
                  color={c.state === 'done' ? C.g : C.ochre}
                />
                <div
                  style={{
                    width: 2, flex: 1, minHeight: last ? 0 : 12, borderRadius: 1,
                    background: last ? 'transparent' : C.gBorder,
                  }}
                />
              </div>
              <div style={{ paddingBottom: last ? 14 : 18 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{c.title}</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.45, color: C.faint, marginTop: 2 }}>{c.sub}</div>
              </div>
              <Mono size={11} color={C.faint} style={{ whiteSpace: 'nowrap' }}>{c.when}</Mono>
            </div>
          )
        })}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button type="button" className="btn btn-sm btn-secondary" style={{ flex: 1, gap: 7 }}>
            <Icon name={col.actionAIcon} size={16} />
            {col.actionA}
          </button>
          <button type="button" className="btn btn-sm btn-primary" style={{ flex: 1, gap: 7 }}>
            <Icon name={col.actionBIcon} size={16} />
            {col.actionB}
          </button>
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: C.faint, marginTop: 11 }}>{col.cycleNote}</div>
      </div>

      <Kicker size={9.5} style={{ marginTop: 26 }}>{EN_ONLY.console_exceptions_head}</Kicker>
      <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {col.exceptions.map((ex) => {
          const skin = exceptionColors(ex.hard)
          return (
            <button
              key={ex.title}
              type="button"
              className="pick"
              style={{ gap: 12, padding: 14, border: `1px solid ${skin.bc}`, borderRadius: 11, background: C.white }}
            >
              <Mono size={17} weight={500} color={skin.ic} style={{ minWidth: 34 }}>{ex.n}</Mono>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600 }}>{ex.title}</span>
                <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.4, color: C.mut, marginTop: 2 }}>
                  {ex.sub}
                </span>
              </span>
              <Icon name="ph ph-caret-right" size={15} color={C.ghost2} />
            </button>
          )
        })}
      </div>

      <div style={{ marginTop: 14, padding: 14, border: `1px solid ${C.line}`, borderRadius: 11, background: C.white }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{EN_ONLY.console_four_types}</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.55, color: C.mut, marginTop: 4 }}>{col.consoleNote}</div>
      </div>
    </Screen>
  )
}

/**
 * Beneficiary entry with no account. For the biggest benefit the member is dead,
 * so a relative who has never opened the app must be able to start a funeral
 * claim from a phone number and a CSP-ID alone.
 */
export function BeneficiaryPortalScreen() {
  const { t, go } = usePhone()
  return (
    <Screen pad="6px 22px 24px">
      <BackButton to="auth" />
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.025em', marginTop: 8, textWrap: 'balance' }}>
        {t.bene_page_title}
      </div>
      <div style={{ fontSize: 15, lineHeight: 1.55, color: C.mut, marginTop: 8 }}>{t.bene_page_sub}</div>

      <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Kicker>{t.their_id}</Kicker>
          <div
            style={{
              padding: 16, border: `1.5px solid ${C.g}`, borderRadius: 10, background: C.white,
            }}
          >
            <Mono size={18} weight={500}>{MEMBER.cspId}</Mono>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Kicker>{t.your_number}</Kicker>
          <div style={{ padding: 16, border: `1px solid ${C.line3}`, borderRadius: 10, background: C.white }}>
            <Mono size={18} color={C.faint}>0803 000 0000</Mono>
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 18, padding: 15, border: `1px solid ${C.line}`, borderRadius: 12,
          background: C.white, fontSize: 13.5, lineHeight: 1.55, color: C.mut,
        }}
      >
        {t.no_id_note}
      </div>

      <div style={{ flex: 1 }} />
      <button type="button" className="btn btn-xl btn-primary" style={{ width: '100%' }} onClick={() => go('claim')}>
        {t.start_funeral}
      </button>
      <div style={{ marginTop: 11, textAlign: 'center', fontSize: 13, lineHeight: 1.5, color: C.faint }}>
        {t.funeral_target}
      </div>
    </Screen>
  )
}
