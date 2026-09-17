import { Text, View } from 'react-native'
import { BENEFIT_SCHEDULE, MEMBER_SUMMARY } from '../../../src/api/fixtures'
import { useSchedule, useSummary } from '../../../src/api/queries'
import { useLive } from '../../../src/api/live'
import { BENEFIT_LABEL_INDEX, benefitValue, naira, titleCase } from '../../../src/api/format'
import { C } from '../../../src/theme/tokens'
import { useT } from '../../../src/i18n'
import { Card, Kicker, RecordRow, Screen, Sub, Title } from '../ui'

/**
 * What this member's plan actually pays, on each thing that can happen.
 *
 * Every figure from the API's benefit schedule, matched to this member's tier.
 * None of it is written here — the app and the API disagreeing about what a
 * family is owed is the failure this screen exists to make impossible, and it
 * had already happened once: a card saying ₦5,500,000 two taps from a schedule
 * saying ₦5,000,000.
 */
export function CoverScreen() {
  const t = useT()
  const { data: summary } = useLive(useSummary(MEMBER_SUMMARY), MEMBER_SUMMARY)
  const { data: schedule } = useLive(useSchedule(BENEFIT_SCHEDULE), BENEFIT_SCHEDULE)

  const plan = schedule.tiers.find((tier) => tier.code === summary.cover.tier) ?? schedule.tiers[0]

  return (
    <Screen>
      <Title>{titleCase(summary.cover.tier)}</Title>
      <Sub>
        {naira(summary.cover.premiumMinor)} a month, taken with your salary by {summary.sponsor.shortName}.
      </Sub>

      <Kicker>WHAT IT PAYS</Kicker>
      <Card style={{ paddingVertical: 2 }}>
        {plan?.benefits.map((benefit, i) => {
          /*
           * The translated label for this benefit, by key rather than by
           * position. `t.sched` is a list written when the design sold a
           * slightly different product, and reading it positionally is how a
           * member sees the wrong name against a real amount.
           */
          const label = t.sched[BENEFIT_LABEL_INDEX[benefit.key] ?? 0] ?? benefit.key
          return (
            <RecordRow
              key={benefit.key}
              k={label}
              v={benefitValue(benefit.valueMinor)}
              last={i === plan.benefits.length - 1}
            />
          )
        })}
      </Card>

      <View style={{ marginTop: 14 }}>
        <Text style={{ fontSize: 12.5, lineHeight: 19, color: C.faint }}>
          {/* Said plainly, because "—" against a benefit is a promise of
              nothing and zero is a promise to pay nothing — and the two are
              different at a claim. */}
          A dash means this plan does not include that benefit at all.
        </Text>
      </View>
    </Screen>
  )
}
