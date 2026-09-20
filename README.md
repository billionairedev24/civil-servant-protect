# Civil Servant Protection Plan

A group protection scheme for Nigerian civil servants — ₦2,500/month, taken from the payslip — implemented from the
Claude Design handoff bundle in [`project/`](./project).

The cover itself is commodity group life. The product is **administration you can audit**: a CSP-ID, a contribution
ledger nobody can quietly edit, and a claim trail that is time-stamped and append-only. Every design decision here
follows from that.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
npm run typecheck
npm test           # smoke + rails + a11y; needs a build first
npm run smoke      # loads all 48 routes in Chromium
npm run test:rails # asserts the four rails actually branch
npm run a11y       # audits against the spec's accessibility minimums
```

**Showing this to someone?** [`DEMO.md`](./DEMO.md) is a 10-minute script — every screen as a URL you can open ahead of
time, the rail comparison worth building the demo around, and what to say when someone asks what is not real.

Three tests, all driving a real browser, all run by CI on every PR.

`npm run smoke` guards the failure `tsc` cannot see: a screen that throws or renders blank. It loads every route in all
three applications across the four rails, five languages and the scenario flags, and fails on any uncaught exception or
console error. It has already caught a clipped button and a font that silently never loaded.

`npm run test:rails` guards the product's core invariant — that the rail actually branches. 122 assertions on
member- and officer-facing text, because a wrong branch looks like an HR officer told to upload a schedule on a rail
that has none, or a member told their salary was docked when it never was. Writing it found exactly that bug, twice:
once in the ledger's labels and once in the prose around them.

`npm run a11y` reports contrast and hit-target findings per application and fails on a control with no accessible name.

## Three applications

These are three separate products, not three views of one page, so each has its own route tree and its own chrome.

| Application | Routes | Entry | Where |
|---|---|---|---|
| Member app (mobile) | 25 | `/m/home` | `src/surfaces/phone` |
| Member web app | 12 | `/dashboard` | `src/surfaces/web` |
| Sponsor console | 11 | `/console` | `src/surfaces/console` |

`src/App.tsx` is a router, not a shell. Every screen is a real address — `/m/claim`, `/contributions`,
`/console/reconciliation/exceptions/CSP-114-88214` — so deep links, the Back button and refresh all behave, and an
officer can forward an exception by pasting the address bar.

The member app fills the viewport and pins its tab bar to it; the web app puts a nav rail beside the content above
1024 and a scrolling tab row below; the console is desktop-first but collapses to a bottom tab bar rather than
degrading, because an HR officer in a state secretariat is often on a handset and needs the same screens, not fewer.

Until there is a backend, the signed-in member's language and collection rail come from the query string rather than a
session: `/m/pay?rail=self&lang=ha`. `?demo=late,offline,sun` drives the scenario states. That keeps the demo able to
show all four rails without a rail switcher living in product chrome, where it would not belong. Language *is* a real
account setting, so it stays in the web app's header.

The implementation spec is documentation, not a screen; it lives in `docs/spec-source.ts`.

## The one idea everything hangs off

Money does not come from an API. It comes from four rails, and the rail a member sits on keys the entire downstream
experience — the enrolment door, the pay screen, the ID card, the contributions ledger and the whole console.

```
Sponsor (federal MDA / state / employer / none) → Collection method → Member
```

- **Federal (IPPIS)**, **state payroll** and **private employer** are *batch* rails: a schedule goes out, sits on
  someone's desk for most of a month, and a return file comes back. Cover status is a function of that file, not of
  money landing — which is why contributions read "waiting for file" rather than "paid".
- **Self-pay** (NIBSS direct debit) is the only rail that answers the same day, which is why its exceptions are bank
  response codes rather than file mismatches.

Identity, CSP-ID, cover and claims are identical in all four. Only the payment source and the enrolment door differ,
which is what lets a member who transfers, retires or fails a deduction roll onto card without losing cover.

The rail is modelled in `src/data/sponsors.ts` and branched in `src/data/collection.ts`. Treat it as a first-class field
on the member record, resolved once at sign-in — see "Rail branching" in `docs/spec-source.ts` for the full table.

## Layout

```
src/
  App.tsx              router — three route trees, query-param rail/language/scenario
  theme/               palette (tokens.ts) + ground rules and the button system (tokens.css)
  i18n/                strings.ts (5 locales, generated from the bundle) + useT()
  data/                fixtures behind a typed layer: sponsors, member, collection
  components/          Icon, primitives, shared panel/table surface, useMediaQuery
  surfaces/
    phone/             MemberMobileApp — nav.ts owns the screen list, state.tsx the session
    web/               MemberWebApp    — nav.ts owns URLS and the reverse lookup
    console/           SponsorConsoleApp — nav.ts owns CONSOLE_URLS
docs/spec-source.ts    the implementation spec
tests/harness.mjs      the route tables the browser tests drive
```

Each application's `nav.ts` is the single place a screen's id, label and URL are declared; the shell derives the
current screen from `useLocation()` and hands it to the state provider, which no longer owns it. Adding a screen means
one entry there and one entry in the `SCREENS` record.

**Data is fixtures.** Everything a screen renders comes from `src/data` and each application's `data.ts`, never from the
component. Swapping in a real API is a change to those modules and their callers' `await`, not to the JSX.
`docs/spec-source.ts` carries the intended request/response shapes per screen.

**Copy is never inlined.** All member-facing strings come from `src/i18n/strings.ts` through `useT()`. Five locales —
English, Hausa, Yorùbá, Igbo, Nigerian Pidgin — all complete at 178 keys, enforced by the `Strings` interface, so a
locale missing a key fails `npm run build` rather than falling back silently.

**One member, three applications.** The identity, beneficiaries and family live once, in `src/data/member.ts`, and the
web and console read them from there. The design bundle gave each surface its own copy, and they had drifted: two
different CSP-IDs for one person, two different families, and a relationship that was "Daughter" on the phone and
"Mother" on the web. The console used both IDs — in one case the exception's URL said one and its own detail panel said
the other. The payee sentence is derived from who actually holds a share rather than written out, because that sentence
is where the drift showed up first. `test:rails` asserts the ID is identical on all five screens that print it.

**Prose follows the rail, not just labels.** A payroll member's money arrives in a monthly remittance file; a
self-paying member's arrives when their bank clears a debit. Ten keys therefore have a `_self` twin, and `test:rails`
asserts that no screen on the self-pay rail mentions a payroll file, a payroll office or a deduction. Getting this
wrong is not a cosmetic bug — it sends a member to an HR office that was never involved in their payment.

**The button system** is one tiered pill geometry (54 / 52 / 44 / 40px) in `tokens.css`. Two rules there are load-bearing
and were each arrived at by fixing a real bug: every tier pins `flex-shrink: 0` so actions never collapse on
scroll-heavy screens, and `Back` lives at the top-left of a wizard, never at the bottom beside the primary.

Fonts and icons are self-hosted rather than CDN-loaded. The member app targets slow connections and shared office
machines behind restrictive networks; a blocked font CDN must not change the layout.

## Known gaps, carried forward from the design

These are real and deliberate — not oversights to tidy away. For where the build
as a whole stands, what is not done and the order it should be done in, see
[docs/plan.md](docs/plan.md).

1. **Translations are machine-drafted.** Every non-English line needs a native-speaker pass before any pilot. Insurance
   and payment vocabulary is where it fails hardest: *beneficiary*, *sum assured*, *grace period*, *mandate*.
2. **34 copy keys are outstanding.** The four newest member screens (beneficiary re-confirmation, employer onboarding,
   why-your-contribution-changed, sunlight mode) and the console are English-only. They are collected in `EN_ONLY` in
   `src/i18n/index.tsx` so the translation pass has one file to work through rather than a hunt through JSX.
3. **Sunlight mode is a contrast simulation, not a palette.** `?demo=sun` filters the whole app. A real high-contrast theme
   needs its own token set — worth doing after translation review, because longer strings change the layout it has to
   survive.
4. **Low-end Android diacritics are untested.** Yorùbá and Igbo marks on stock system fonts at 12px and below.
5. ~~**The member's benefit and family-cover amounts are still per-surface.**~~ Closed. Every figure that says what
   cover pays now comes from `GET /v1/products/schedule` and the member's own record, so the phone's headline and the
   web's agree by construction rather than by review. The phone's ₦5,500,000 against the web's ₦5,000,000 was the
   clearest symptom.
6. **Benefit figures are illustrative**, pending actuarial, legal and underwriting sign-off — now served from one
   place, `Pricing.SCHEDULE`, so signing them off is a change to one file.
7. **The ten newest strings have had no translation pass at all.** Closing the payroll-prose gap below meant writing
   `paid_sub_self`, `ct_note_self`, `ct_legend_self`, `pay_if_body_self`, `pay_grace`, `pay_grace_self`,
   `home_pay_head_self`, `ct_src_card` and the two `ct_src_pending*` keys in all five locales. They are machine-drafted
   like the rest of the file, but unlike the rest they were drafted here rather than carried over from the bundle, so
   they are the first place a reviewer should look. They are listed together at the top of this note for that reason.
8. **Hit targets are below the spec's 44px.** The spec asks for 44px everywhere; the design's chips, nav rows and
   table actions are 26–38px. Everything clears the 24px WCAG 2.2 floor, which was worth fixing outright, but going to
   44 would visibly change the density the design was tuned for — so it stays a design call. `npm run a11y` reports
   the count per application.

## One deliberate departure from the mockups

The mockups failed the spec's own contrast rule, and the spec won.

The spec lists 4.5:1 as a non-negotiable minimum and says in as many words: *do not tint text below `#5C6560` on
white*. The designs used `#8A928C` for secondary text (3.2:1 on white, 2.7:1 on paper) and `#A9A69B` for mono eyebrow
labels (2.0–2.4:1) — not a few instances, but the standard secondary-text treatment on every screen. For a product
used outdoors in bright sun by people who may not read English well, that is the wrong trade.

`faint` and `ghost` are now both `#636C67`. On this cream ground the AA-passing band is only `#5C6560`–`#636C67`, so a
third tier *in lightness* cannot exist — the eyebrow hierarchy is carried by type instead (mono, 9px, `.12em`
tracking), which is how it already read. Three smaller follow-ons came with it: the nav group label darkens to `mut` on
a selected row, where the tint drops it below the line; the green benefit card's eyebrow went from 70% to 85% alpha;
and the USSD line on the web app's green panel went from 75% to 88%, because it is a phone number someone may need to
read in a hurry.

One more came out of auditing every route rather than one screen per application: a contribution row's amount was
drawn in `gSoft` (`#8ABBA1`, 2.0:1 on cream) to mark it as card-paid. The amount is the row's most important number, so
it is ink now, and the icon and state line carry which rail paid it.

`ghost2` (`#B9B6AB`) survives for decorative carets, unselected marks and disabled controls, which carry no text.

`npm run a11y` now reports zero contrast failures across all 48 routes at both handset and desk widths. If you want the
original palette back, it is two values in `src/theme/tokens.ts` and `tokens.css`.

## What this is not

No backend, no auth, no persistence. Every flow is driveable end to end against fixtures; nothing is wired to IPPIS,
NIMC, NIBSS or an underwriter. `docs/spec-source.ts` documents what those integrations would need — and the transcripts
in [`chats/`](./chats) record why they are contracts rather than signups.

It is also not a reproduction of the Claude Design canvas the prototypes were presented on. The bundle in
[`project/`](./project) shows the screens inside a phone bezel, beside an index rail listing every screen and a panel
explaining how the surface works. Those are presentation, not product, and none of them are here.
