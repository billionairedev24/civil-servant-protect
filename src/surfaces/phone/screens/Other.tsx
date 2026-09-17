import { Icon } from '../../../components/Icon'
import { Kicker, Mono } from '../../../components/primitives'
import { LANGS, type Lang } from '../../../i18n'
import { MEMBER, initialsOf } from '../../../data/member'
import { C } from '../../../theme/tokens'
import { Screen } from '../Screen'
import { usePhone } from '../state'
import { MORE_ICONS, MORE_TARGETS } from '../nav'
import { useAuth } from '../../../api/auth'

export function ProfileScreen() {
  const { t, lang, setLang, go } = usePhone()
  const { session, signOut } = useAuth()

  /*
   * `more_i` carries six labels and this list shows five of them.
   *
   * Index 4 is "Switch to HR officer view" — a control for reviewing the
   * design, which put a preview of the sponsor console inside a member's app.
   * It is dropped rather than translated away: the console is a separate
   * application at /console with its own sign-in, and offering it here is why
   * the two were hard to tell apart. "How you pay" is spliced in at index 1
   * because the payment rail became a first-class screen only in v3.
   */
  const labels = [...t.more_i.slice(0, 4), t.more_i[5]]
  labels.splice(1, 0, t.more_pay)

  // The last row is "Sign out". Dropping the tokens has to happen before the
  // navigation, or the auth gate lets the app stay open behind it.
  const open = (i: number) => {
    if (MORE_TARGETS[i] === 'auth') signOut()
    go(MORE_TARGETS[i])
  }

  const name = session?.name ?? MEMBER.name

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
          {initialsOf(name)}
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{name}</div>
          <Mono size={12} color={C.mut} style={{ display: 'block', marginTop: 2 }}>
            CSP-ID {MEMBER.cspId}
          </Mono>
        </div>
      </div>

      <Kicker style={{ marginTop: 24 }}>{t.language}</Kicker>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 9 }}>
        {LANGS.map(([code, label]) => {
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
              {label}
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
            onClick={() => open(i)}
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

