import type { UseQueryResult } from '@tanstack/react-query'
import { Icon } from '../components/Icon'
import { C } from '../theme/tokens'
import { useApi } from './provider'

/**
 * Reading a screen's data, and being honest about where it came from.
 *
 * Every read hook stands the fixture in as `placeholderData`, which is what lets
 * one set of screens serve both the fixture demo and the live product. That is a
 * good default while a request is in flight — a member opening the app to check
 * whether their deduction arrived should see last month's figures immediately
 * rather than a spinner.
 *
 * It is a bad default when the request *failed*. TanStack keeps returning the
 * placeholder, so a screen that does nothing about it shows invented money with
 * no indication that it is invented. On a product whose entire claim is that the
 * numbers can be trusted, that is the worst possible failure mode: quiet and
 * plausible.
 *
 * So live screens read through here and render {@link NotLive} when `failed` is
 * set. On fixtures `failed` is never true, and the demo is unchanged.
 */
export function useLive<T>(
  query: UseQueryResult<T>,
  fixture: T,
): { data: T; failed: boolean; live: boolean; provisional: boolean } {
  const { live } = useApi()
  return {
    /*
     * The fixture again, explicitly.
     *
     * `placeholderData` only stands in while a query is *pending* — the moment
     * it errors, TanStack drops it and `data` is undefined. A screen reading
     * `data.ref` then throws, which is how a 404 on one claim took down the
     * whole tracking screen rather than showing the notice below it. The
     * fallback belongs here and not at each call site.
     */
    data: query.data ?? fixture,
    failed: live && query.isError,
    /*
     * For the few places where the demo and the product legitimately differ.
     *
     * The rail switcher (`?rail=state`) is a demo control: it re-renders every
     * screen as a different sponsor, which is how four collection rails get
     * reviewed without four backends. A live screen must ignore it and show the
     * member's actual sponsor. Screens that read a sponsor field need to know
     * which of the two they are in.
     */
    live,
    /*
     * True while what is on screen is still the fixture standing in.
     *
     * Almost every screen can ignore this — showing last month's figures for a
     * moment is the point. It matters when one read feeds another: the claim
     * tracker takes a reference out of the claim *list*, and a reference taken
     * from the fixture is a reference to a claim this member does not have. The
     * request 404s, and for a moment the screen says the claim could not be
     * loaded when nothing was ever wrong.
     */
    provisional: live && query.isPlaceholderData,
  }
}

/**
 * A standing mark, whenever the apps are running on fixtures.
 *
 * Small, fixed, and on every screen of all three surfaces, because the
 * alternative was somebody reading the product for an hour and concluding the
 * backend was not connected. They were right about what they were looking at —
 * with `VITE_API_URL` unset, not one screen calls the API — and nothing on the
 * page said so.
 *
 * Absent entirely when an API is configured, so it costs the real product
 * nothing. It is not a warning: fixtures are how the design is reviewed and how
 * the rail tests run. It is a label.
 */
export function DataSourceBadge() {
  const { live } = useApi()
  if (live) return null
  return (
    <div
      // Not a live region: it never changes, and announcing it on every route
      // change would be noise in a screen reader.
      style={{
        position: 'fixed', left: 12, bottom: 12, zIndex: 40,
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '6px 11px', borderRadius: 999,
        border: `1px solid ${C.ochreBorder}`, background: C.ochreBg, color: C.ochreInk,
        fontSize: 11.5, fontWeight: 600, pointerEvents: 'none',
      }}
    >
      <span
        aria-hidden="true"
        style={{ width: 6, height: 6, borderRadius: '50%', background: C.ochre }}
      />
      Demo data · no API configured
    </div>
  )
}

/**
 * Shown above figures that could not be refreshed.
 *
 * Says what is wrong and what it means for what is on screen, because "Error"
 * tells a member nothing they can act on. It does not blank the screen: the
 * layout, the labels and the structure are all still useful, and a member on a
 * flapping connection who loses the whole page has lost more than they gained.
 */
export function NotLive({ what = 'These figures' }: { what?: string }) {
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 9, margin: '12px 0',
        padding: '11px 12px', border: `1px solid ${C.ochreBorder}`, borderRadius: 10,
        background: C.ochreBg, color: C.ochreInk, fontSize: 13, lineHeight: 1.45,
      }}
    >
      <Icon name="ph-fill ph-cloud-slash" size={16} color={C.ochre} />
      <span>
        {what} could not be loaded, so what is shown is not live. Check your
        connection — nothing here has changed.
      </span>
    </div>
  )
}

/*
 * The formatters live in `format.ts` and are re-exported here.
 *
 * Every screen imports them from this module and should keep doing so — the
 * split exists so that a bundle with no DOM in it (the phone) can take the
 * formatting without the components.
 */
export {
  BENEFIT_LABEL_INDEX, LONG_MONTHS, benefitValue, dayFirst, monthName, naira, periodLabel,
  shortNaira, titleCase,
} from './format'
