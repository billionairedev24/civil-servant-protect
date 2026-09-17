import { TIER_CODES, TIER_NAMES, TIER_PRICES } from '../../../data/member'
import { BENEFIT_SCHEDULE } from '../../../api/fixtures'
import { useSchedule } from '../../../api/queries'
import { BENEFIT_LABEL_INDEX, naira, useLive } from '../../../api/live'
import { C } from '../../../theme/tokens'
import { useT } from '../../../i18n'

/**
 * The four plans, priced by the server.
 *
 * It used to sit beside the enrolment screens, which are gone: enrolment is a
 * back-office task and a member's app has no business creating a member.
 * Changing the cover you already have is a different thing and a real one, so
 * this moved here rather than going with them.
 */
export function TierList({ selected, onSelect }: { selected: number; onSelect: (i: number) => void }) {
  const t = useT()
  const { data: schedule } = useLive(useSchedule(BENEFIT_SCHEDULE), BENEFIT_SCHEDULE)

  /*
   * The line under each plan: the headline benefit, from that plan's own
   * figures.
   *
   * It used to be a translated sentence per tier — "₦3m life · ₦3m accident ·
   * ₦150k medical" — which went on saying ₦3m after the schedule said ₦2m, two
   * inches under a table that said ₦2m. Those strings are gone; a summary of
   * figures has to be made of the figures.
   *
   * One benefit, not three. Death, accident and disability carry the same
   * amount on every tier, so listing all three was one number said three times
   * — and the labels are sentences, written to stand on their own line in five
   * languages rather than to be strung together with a dot between them.
   */
  const headline = (code: string) => {
    const plan = schedule.tiers.find((p) => p.code === code)
    const death = plan?.benefits.find((b) => b.key === 'death')
    if (!death?.valueMinor) return ''
    return `${naira(death.valueMinor)} · ${t.sched[BENEFIT_LABEL_INDEX.death]}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {TIER_NAMES.map((name, i) => {
        const on = selected === i
        const plan = schedule.tiers[i]
        return (
          <button
            key={name}
            type="button"
            className="pick"
            onClick={() => onSelect(i)}
            style={{
              display: 'block', padding: 16,
              border: `1.5px solid ${on ? C.g : C.line}`,
              background: on ? C.gTint : C.white,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{name}</span>
              <span style={{ fontSize: 17, fontWeight: 700, color: on ? C.gd : C.ink }}>
                {plan ? naira(plan.priceMinor) : TIER_PRICES[i]}
              </span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.45, color: C.mut, marginTop: 5 }}>
              {headline(TIER_CODES[i])}
            </div>
          </button>
        )
      })}
    </div>
  )
}
