# Civil Servant Protect

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
```

## The four surfaces

One shell (`src/App.tsx`) switches between them, with the rail and language pickers in the header driving all of them at
once — the point being that a member, the same member on a desk browser, and their sponsor's officer are looking at one
record on one collection rail.

| Surface | Screens | Where |
|---|---|---|
| Member · phone | 25 | `src/surfaces/phone` |
| Member · web | 12 | `src/surfaces/web` |
| Sponsor · console | 11 | `src/surfaces/console` |
| Implementation spec | 8 sections | `src/surfaces/spec` |

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
on the member record, resolved once at sign-in — see the spec surface, "Rail branching", for the full table.

## Layout

```
src/
  App.tsx              surface shell — tabs, rail picker, language picker
  theme/               palette (tokens.ts) + ground rules and the button system (tokens.css)
  i18n/                strings.ts (5 locales, generated from the bundle) + useT()
  data/                fixtures behind a typed layer: sponsors, member, collection
  components/          Icon, primitives, shared panel/table surface
  surfaces/            phone · web · console · spec
```

**Data is fixtures.** Everything a screen renders comes from `src/data` and each surface's `data.ts`, never from the
component. Swapping in a real API is a change to those modules and their callers' `await`, not to the JSX. The spec
surface carries the intended request/response shapes per screen.

**Copy is never inlined.** All member-facing strings come from `src/i18n/strings.ts` through `useT()`. Five locales —
English, Hausa, Yorùbá, Igbo, Nigerian Pidgin — all complete at 168 keys.

**The button system** is one tiered pill geometry (54 / 52 / 44 / 40px) in `tokens.css`. Two rules there are load-bearing
and were each arrived at by fixing a real bug: every tier pins `flex-shrink: 0` so actions never collapse on
scroll-heavy screens, and `Back` lives at the top-left of a wizard, never at the bottom beside the primary.

Fonts and icons are self-hosted rather than CDN-loaded. The member app targets slow connections and shared office
machines behind restrictive networks; a blocked font CDN must not change the layout.

## Known gaps, carried forward from the design

These are real and deliberate — not oversights to tidy away.

1. **Translations are machine-drafted.** Every non-English line needs a native-speaker pass before any pilot. Insurance
   and payment vocabulary is where it fails hardest: *beneficiary*, *sum assured*, *grace period*, *mandate*.
2. **34 copy keys are outstanding.** The four newest member screens (beneficiary re-confirmation, employer onboarding,
   why-your-contribution-changed, sunlight mode) and the console are English-only. They are collected in `EN_ONLY` in
   `src/i18n/index.tsx` so the translation pass has one file to work through rather than a hunt through JSX.
3. **Sunlight mode is a contrast simulation, not a palette.** It filters the whole frame. A real high-contrast theme
   needs its own token set — worth doing after translation review, because longer strings change the layout it has to
   survive.
4. **Low-end Android diacritics are untested.** Yorùbá and Igbo marks on stock system fonts at 12px and below.
5. **The web and phone designs disagree on fixtures.** Web uses CSP-114-88214 and a 50/30/20 beneficiary split including
   a minor; phone uses 4471-2098 and 60/40. Both are reproduced as designed rather than silently reconciled — see the
   note at the top of `src/surfaces/web/data.ts`. Worth deciding before these become seed data.
6. **Benefit figures are illustrative**, pending actuarial, legal and underwriting sign-off.

## What this is not

No backend, no auth, no persistence. Every flow is driveable end to end against fixtures; nothing is wired to IPPIS,
NIMC, NIBSS or an underwriter. The spec surface documents what those integrations would need — and the transcripts in
[`chats/`](./chats) record why they are contracts rather than signups.
