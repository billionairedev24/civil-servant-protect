import { friendly } from '../../../api/problems'
import { Icon } from '../../../components/Icon'
import { Kicker, Mono, ScreenTitle, Sub } from '../../../components/primitives'
import { EN_ONLY, fill } from '../../../i18n'
import { MEMBER, TIER_NAMES } from '../../../data/member'
import {
  BENEFICIARY_SET, BENEFIT_SCHEDULE, DEPENDANTS, MEMBER_SUMMARY, PROTECTION_CARD,
} from '../../../api/fixtures'
import {
  useBeneficiaries, useCard, useConfirmBeneficiaries, useDependants, useSchedule, useSummary,
} from '../../../api/queries'
import {
  BENEFIT_LABEL_INDEX, NotLive, benefitValue, dayFirst, naira, useLive,
} from '../../../api/live'
import { C } from '../../../theme/tokens'
import { Screen } from '../Screen'
import { usePhone } from '../state'
import { TierList } from './Tiers'

/** Digital CSP-ID. Saved on the handset and openable with no network — the
    whole point of it is that it works when nothing else does. */
export function ProtectionCardScreen() {
  const { t, sponsor } = usePhone()
  /* The card and the name on it come from two different reads: the card is the
     signed offline token and is cached for an hour, the summary is who the
     member is. Both stand in their fixture while in flight. */
  const { data: card, failed, live } = useLive(useCard(PROTECTION_CARD), PROTECTION_CARD)
  const { data: summary } = useLive(useSummary(MEMBER_SUMMARY), MEMBER_SUMMARY)

  return (
    <Screen scroll>
      <ScreenTitle style={{ paddingTop: 12 }}>{t.card_title}</ScreenTitle>
      <Sub>{t.card_sub}</Sub>
      {/* A card that could not be refreshed still opens at a hospital gate —
          that is the point of an offline token — so this says the figures are
          not live rather than hiding the card. */}
      {failed && <NotLive what="Your card" />}

      <div
        style={{
          marginTop: 16, borderRadius: 16, background: C.ink, color: C.surface,
          padding: '20px 18px', position: 'relative', overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute', right: -30, top: -30, width: 130, height: 130,
            borderRadius: '50%', background: 'rgba(4,106,56,.4)',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="ph-fill ph-shield-check" size={19} color={C.gBright} />
            <Mono size={9} style={{ letterSpacing: '.13em' }}>CIVIL SERVANT PROTECT</Mono>
          </div>
          <Mono
            size={9}
            style={{
              letterSpacing: '.1em', border: '1px solid rgba(247,246,242,.4)',
              borderRadius: 5, padding: '3px 7px',
            }}
          >
            {card.tier.toUpperCase()}
          </Mono>
        </div>

        <div style={{ fontSize: 24, fontWeight: 700, marginTop: 18, letterSpacing: '-.02em' }}>
          {summary.member.fullName}
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.45, opacity: 0.7, marginTop: 3 }}>
          {MEMBER.role}
          <br />
          {MEMBER.ministry}
        </div>

        <div style={{ display: 'flex', gap: 26, marginTop: 18 }}>
          <div>
            <Mono size={8.5} style={{ letterSpacing: '.12em', opacity: 0.6 }}>{t.csp_id}</Mono>
            <Mono size={16} weight={500} style={{ display: 'block', marginTop: 3 }}>{card.cspId}</Mono>
          </div>
          <div>
            <Mono size={8.5} style={{ letterSpacing: '.12em', opacity: 0.6 }}>{t.in_force}</Mono>
            <Mono size={16} weight={500} style={{ display: 'block', marginTop: 3 }}>
              {dayFirst(card.inForceSince)}
            </Mono>
          </div>
        </div>

        <div
          style={{
            marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(247,246,242,.18)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
          }}
        >
          <div>
            <Mono size={8.5} style={{ letterSpacing: '.12em', opacity: 0.6 }}>COLLECTED BY</Mono>
            {/* Live, this is the member's actual sponsor. On fixtures it follows
                the rail switcher, which is how the demo shows the same card
                collected four different ways. */}
            <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 3 }}>
              {live ? card.collectedBy : sponsor.short}
            </div>
          </div>
          <Mono
            size={9}
            color={C.gBright}
            style={{
              letterSpacing: '.1em', border: '1px solid rgba(95,191,140,.5)',
              borderRadius: 5, padding: '3px 7px',
            }}
          >
            {sponsor.tag}
          </Mono>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginTop: 20 }}>
          <div style={{ fontSize: 12.5, lineHeight: 1.45, opacity: 0.72, maxWidth: 165 }}>{t.scan_note}</div>
          {/*
            The real code, drawn by the API.

            This was a CSS checkerboard from the mockup — a picture of a QR that
            decoded to nothing, on the one screen whose entire job is being
            scanned. The image is a data URI, so it renders with no second
            request and survives the gate having no signal.

            `image-rendering: pixelated` matters: the PNG is one pixel block per
            module and the browser's default smoothing blurs the edges at this
            size, which is exactly what a cheap scanner fails to read.

            120px rather than the mockup's 78. That 78 was a decorative square
            and this is a functional one: the signed token is ~150 characters,
            which is a 45-module code, and at 78px that is 1.7px per module —
            marginal for the cheap reader on a scratched screen this is actually
            for. At 120 it is closer to three, and it still fits beside the note
            at 390px, which the layout test checks.
          */}
          <img
            src={card.qrImage}
            alt={t.scan_note}
            width={120}
            height={120}
            style={{
              width: 120, height: 120, borderRadius: 8, display: 'block',
              border: `4px solid ${C.surface}`, background: C.surface,
              imageRendering: 'pixelated',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 9, marginTop: 12 }}>
        <button type="button" className="btn btn-sm btn-primary" style={{ flex: 1, gap: 8 }}>
          <Icon name="ph ph-download-simple" size={17} />
          {t.save_phone}
        </button>
        <button type="button" className="btn btn-sm btn-secondary" style={{ flex: 1, gap: 8 }}>
          <Icon name="ph ph-share-network" size={17} />
          {t.share_hr}
        </button>
      </div>

      <Kicker style={{ marginTop: 26 }}>{t.device}</Kicker>
      <div className="card" style={{ marginTop: 9, padding: 15 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14.5, fontWeight: 600 }}>{MEMBER.device}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: C.g, fontWeight: 600 }}>
            <Icon name="ph-fill ph-seal-check" size={15} />
            {t.trusted}
          </span>
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.faint, marginTop: 5 }}>{t.device_note}</div>
      </div>
    </Screen>
  )
}

export function BenefitsScreen() {
  const { t, tier, set } = usePhone()
  const { data: schedule, failed } = useLive(useSchedule(BENEFIT_SCHEDULE), BENEFIT_SCHEDULE)

  /*
   * The tier being looked at, which is the demo's chooser here and the member's
   * own plan when one is signed in. Its benefits, in the API's order, with the
   * API's figures — the same numbers the web app shows in its four-column
   * table, because both read the one schedule.
   */
  const plan = schedule.tiers[tier] ?? schedule.tiers[1] ?? schedule.tiers[0]

  return (
    <Screen scroll>
      <ScreenTitle style={{ paddingTop: 12 }}>{t.cover_title}</ScreenTitle>
      <Sub>{t.cover_sub}</Sub>
      {failed && <NotLive what="This schedule" />}

      <div style={{ marginTop: 14 }}>
        {plan?.benefits.map((benefit) => (
          <div
            key={benefit.key}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              gap: 14, padding: '14px 0', borderBottom: `1px solid ${C.line5}`,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 500 }}>
              {t.sched[BENEFIT_LABEL_INDEX[benefit.key]] ?? benefit.key.replace(/_/g, ' ')}
            </div>
            <div
              style={{
                fontSize: 15.5, fontWeight: 700, whiteSpace: 'nowrap',
                // A benefit this tier does not include is grey and "—", not a
                // green figure. It is the difference between a promise to pay
                // nothing and no promise at all.
                color: benefit.valueMinor == null ? C.faint : C.g,
              }}
            >
              {benefitValue(benefit.valueMinor)}
            </div>
          </div>
        ))}
      </div>

      <Kicker style={{ marginTop: 26 }}>{t.change_plan}</Kicker>
      <div style={{ marginTop: 10 }}>
        <TierList selected={tier} onSelect={(i) => set({ tier: i })} />
      </div>

      <div
        style={{
          marginTop: 14, padding: 14, border: `1px solid ${C.line}`, borderRadius: 10,
          background: C.white, fontSize: 13, lineHeight: 1.55, color: C.mut,
        }}
      >
        {t.plan_note}
      </div>
      <button type="button" className="btn btn-xl btn-primary" style={{ width: '100%', marginTop: 12 }}>
        {fill(t.upgrade, { tier: TIER_NAMES[tier] })}
      </button>
      <div style={{ marginTop: 20, fontSize: 12, lineHeight: 1.6, color: C.ghost }}>{t.disclaimer}</div>
    </Screen>
  )
}

/** Unnominated or stale beneficiaries are what turn a 20-day claim into a
    12-month dispute, so this screen nags and the share validator is visible. */
export function BeneficiariesScreen() {
  const { t, benes, set, go } = usePhone()
  const { data: nominated, failed, live } = useLive(useBeneficiaries(BENEFICIARY_SET), BENEFICIARY_SET)

  /* Live, the set is whatever the member has named. On fixtures the `benes`
     control adds a third person who holds no share, which is the demo's way of
     showing the unshared state — the very thing this screen exists to catch. */
  const shown = live ? nominated.people : nominated.people.slice(0, benes)

  return (
    <Screen scroll>
      <ScreenTitle style={{ paddingTop: 12 }}>{t.benes_title}</ScreenTitle>
      <Sub>{t.benes_sub}</Sub>
      {failed && <NotLive what="Who you have named" />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 16 }}>
        {shown.map((b) => (
          <div key={b.id} className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{b.name}</div>
                <div style={{ fontSize: 13, color: C.mut, marginTop: 2 }}>
                  {/* No number on file is its own fact — this screen exists so a
                      claims officer can reach these people, and an em dash says
                      "we cannot" where a blank says nothing. */}
                  {b.relation} · {b.msisdn ?? EN_ONLY.benes_no_number}
                </div>
              </div>
              <div style={{ fontSize: 21, fontWeight: 700, color: C.g }}>{b.sharePct}%</div>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: C.line8, marginTop: 12, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${b.sharePct}%`, background: C.g }} />
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-md btn-tinted" onClick={() => set({ benes: Math.min(3, benes + 1) })}>
          <Icon name="ph ph-plus" size={16} />
          {t.add_person}
        </button>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 15 }}>
        <button
          type="button"
          className="pick"
          onClick={() => go('beneconf')}
          style={{
            gap: 11, marginBottom: 14, padding: 15,
            border: `1px solid ${C.ochreBorder}`, background: C.ochreBg,
          }}
        >
          <Icon name="ph ph-calendar-check" size={19} color={C.ochre} />
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: C.ochreInk }}>
              {EN_ONLY.beneconf_due_card}
            </span>
            <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.4, color: C.ochre, marginTop: 2 }}>
              {EN_ONLY.beneconf_due_card_sub}
            </span>
          </span>
          <Icon name="ph ph-caret-right" size={15} color={C.ochre} />
        </button>

        <div style={{ fontSize: 14.5, fontWeight: 600 }}>{t.shares_title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: C.mut, marginTop: 3 }}>
          {shareSummary(shown)}
        </div>
      </div>

      <button type="button" className="btn btn-xl btn-primary" style={{ width: '100%', marginTop: 14 }} onClick={() => go('home')}>
        {t.confirm_correct}
      </button>
      <div style={{ marginTop: 10, textAlign: 'center', fontSize: 12.5, color: C.faint }}>{t.ask_again}</div>
    </Screen>
  )
}

/** Annual re-confirmation. Runs once a year against the payroll cycle. */
export function BeneConfirmScreen() {
  const { go } = usePhone()
  const { data: nominated, failed } = useLive(useBeneficiaries(BENEFICIARY_SET), BENEFICIARY_SET)
  const confirm = useConfirmBeneficiaries()

  /* Only the payees. Someone named with no share is not who a claim pays, and
     this screen's whole question is "are these still the right people to send
     the money to" — see PAYEES in src/data/member. */
  const rows = nominated.people
    .filter((b) => b.sharePct > 0)
    .map((b) => ({
      b,
      // A beneficiary we cannot telephone is the practical failure this annual
      // check exists to find — a claims officer with no number has to trace a
      // grieving family through an HR office.
      ok: b.msisdn !== null,
      note: b.msisdn !== null ? EN_ONLY.beneconf_named_since : EN_ONLY.beneconf_unreachable,
    }))

  /* Confirming is a write, so it gets the two states a write needs: it cannot
     be pressed twice, and a refusal says so instead of navigating away as if it
     had worked. */
  const yes = () => {
    if (confirm.isPending) return
    confirm.mutate(undefined, { onSuccess: () => go('home') })
  }

  return (
    <Screen scroll>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingTop: 14 }}>
        <Mono
          size={9.5}
          color={C.ochre}
          style={{ letterSpacing: '.1em', border: `1px solid ${C.ochreBorder}`, borderRadius: 5, padding: '3px 7px' }}
        >
          {EN_ONLY.beneconf_badge}
        </Mono>
        <Mono size={10.5} color={C.faint}>{EN_ONLY.beneconf_due}</Mono>
      </div>

      <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-.02em', marginTop: 10, textWrap: 'balance' }}>
        {EN_ONLY.beneconf_title}
      </div>
      <div style={{ fontSize: 14.5, lineHeight: 1.55, color: C.mut, marginTop: 8 }}>{EN_ONLY.beneconf_sub}</div>
      {failed && <NotLive what="Who you have named" />}

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 9 }}>
        {rows.map(({ b, ok, note }) => (
          <div key={b.id} className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{b.name}</div>
                <div style={{ fontSize: 13, color: C.mut, marginTop: 2 }}>
                  {b.relation} · {b.msisdn ?? EN_ONLY.benes_no_number}
                </div>
              </div>
              <div style={{ fontSize: 21, fontWeight: 700, color: C.g }}>{b.sharePct}%</div>
            </div>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 7, marginTop: 11,
                paddingTop: 11, borderTop: `1px solid ${C.line7}`,
              }}
            >
              <Icon
                name={ok ? 'ph-fill ph-check-circle' : 'ph ph-warning-circle'}
                size={15}
                color={ok ? C.g : C.ochre}
              />
              <span style={{ fontSize: 12.5, lineHeight: 1.4, color: ok ? C.mut : C.ochre }}>{note}</span>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{ marginTop: 16, padding: 15, border: `1px solid ${C.ochreBorder}`, borderRadius: 12, background: C.ochreBg }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="ph-fill ph-info" size={17} color={C.ochre} />
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ochreInk }}>{EN_ONLY.beneconf_ignore_title}</div>
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: C.ochre, marginTop: 5 }}>{EN_ONLY.beneconf_ignore_body}</div>
      </div>

      {confirm.isError && (
        <div
          role="alert"
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 14, padding: '12px 13px',
            border: `1px solid ${C.clayBorder2}`, borderRadius: 10, background: C.clayBg,
          }}
        >
          <Icon name="ph-fill ph-warning-circle" size={17} color={C.clay} />
          <span style={{ fontSize: 13, lineHeight: 1.45, color: C.clayInk }}>
            {confirm.error instanceof Error
              ? friendly(confirm.error, 'That could not be saved.')
              : 'We could not record that. Try again.'}
          </span>
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          type="button"
          className="btn btn-xl btn-primary"
          style={{ width: '100%' }}
          disabled={confirm.isPending}
          onClick={yes}
        >
          {confirm.isPending ? '…' : EN_ONLY.beneconf_yes}
        </button>
        <button type="button" className="btn btn-lg btn-secondary" style={{ width: '100%' }} onClick={() => go('benes')}>
          {EN_ONLY.beneconf_changed}
        </button>
      </div>
      <div style={{ marginTop: 12, textAlign: 'center', fontSize: 12.5, lineHeight: 1.5, color: C.faint }}>
        {EN_ONLY.beneconf_footnote}
      </div>
    </Screen>
  )
}

/** A face for a relation, without needing the API to send an icon name. */
function familyIcon(relation: string): string {
  const r = relation.toLowerCase()
  if (r.includes('spouse') || r.includes('wife') || r.includes('husband')) return 'ph ph-heart'
  if (r.includes('mother') || r.includes('father') || r.includes('parent')) return 'ph ph-user'
  return 'ph ph-baby'
}

export function FamilyScreen() {
  const { t } = usePhone()
  const { data: family, failed } = useLive(useDependants(DEPENDANTS), DEPENDANTS)
  const { data: summary } = useLive(useSummary(MEMBER_SUMMARY), MEMBER_SUMMARY)

  const covered = family.dependants.filter((d) => d.active)
  const topUpMinor = covered.reduce((sum, d) => sum + d.premiumMinor, 0)

  return (
    <Screen scroll>
      <ScreenTitle style={{ paddingTop: 12 }}>{t.fam_title}</ScreenTitle>
      <Sub>{t.fam_sub}</Sub>
      {failed && <NotLive what="Your family cover" />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 16 }}>
        {family.dependants.map((d) => (
          <div
            key={d.id}
            style={{
              padding: 16,
              border: `1.5px solid ${d.active ? C.gBorder : C.line}`,
              borderRadius: 12,
              background: d.active ? C.gTint : C.white,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <Icon name={familyIcon(d.relation)} size={22} color={d.active ? C.g : C.faint} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{d.name}</div>
                <div style={{ fontSize: 13, color: C.mut, marginTop: 1 }}>{d.relation}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: d.active ? C.g : C.faint }}>
                {d.active ? naira(d.sumAssuredMinor) : 'Removed'}
              </div>
              <div style={{ fontSize: 12.5, color: C.faint, marginTop: 1 }}>
                {d.active ? `${naira(d.premiumMinor)}/mo` : '—'}
              </div>
            </div>
          </div>
        ))}
        {/* Adding somebody is a priced decision with a date of birth and a
            quote behind it, so it happens on the web app where there is room
            to show the band and the new total. The phone lists and reassures. */}
        <button type="button" className="btn btn-md btn-tinted">
          <Icon name="ph ph-plus" size={16} />
          {t.add_family}
        </button>
      </div>

      <div className="card" style={{ marginTop: 18, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 14, color: C.mut }}>{t.new_total}</span>
          <span style={{ fontSize: 23, fontWeight: 700 }}>
            {naira(summary.cover.premiumMinor + topUpMinor)}
          </span>
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.faint, marginTop: 5 }}>{t.new_total_sub}</div>
      </div>
    </Screen>
  )
}

/**
 * The one line under "How it is shared".
 *
 * Says the arithmetic when it adds up and names the problem when it does not.
 * Derived from the set, because the member looking at this screen is the one
 * whose family it describes.
 */
function shareSummary(people: { name: string; sharePct: number }[]): string {
  const paid = people.filter((b) => b.sharePct > 0)
  const unpaid = people.filter((b) => b.sharePct === 0)
  const total = paid.reduce((sum, b) => sum + b.sharePct, 0)

  if (unpaid.length === 1) return fill(EN_ONLY.benes_unshared_one, { name: unpaid[0].name })
  if (unpaid.length > 1) {
    return fill(EN_ONLY.benes_unshared_many, { names: unpaid.map((b) => b.name).join(', ') })
  }
  if (paid.length === 0) return 'Nobody is named yet. A claim cannot be paid until someone is.'
  // "60% + 40% = 100%". A total that is not 100 is worth showing as the sum it
  // actually is, because that is the number the member has to change.
  return `${paid.map((b) => `${b.sharePct}%`).join(' + ')} = ${total}%.`
}
