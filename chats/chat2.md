# Payroll integration setup

_Started 2026-09-01 23:12 UTC_

---

## User

Continuing from "Mobile app design request".

## Assistant

We were rebuilding the Civil Servant Protect mobile app — a ₦2,500/month group protection scheme for Nigerian civil servants, with claims transparency as the differentiator. The real product is audit-trail administration, not the cover itself.

We'd settled on direction 1c (The Instrument) after working through three visual approaches. That means leading with the CSP-ID and Track My Claim, and building a separate fast track for funeral claims when the member is dead and the beneficiary has never opened the app.

We started on Nocturne (dark, mono palette), then you decided the theme wasn't right. We've now rebuilt the whole app as v2 with a light paper/ink/deep civic green palette (Nigerian civic accent), Public Sans typography, and five languages wired to a real translation dictionary: English, Yorùbá, Igbo, Hausa, and Nigerian Pidgin. Auth is now three screens only — Google or phone → SMS OTP → fingerprint. Beneficiary and HR officer login doors stayed as non-member routes.

The app is driveable end to end across 19 screens: splash + language pick, auth (all three methods), first-run enrolment, home, CSP-ID, benefits + tier upgrade, beneficiary nomination, accident report (4 steps), claim wizard (5 steps), claim tracking, HR view, beneficiary-without-account entry, and offline toggle. Tab bar uses real Phosphor glyphs, filled when active.

Open: translations are machine-drafted and need native-speaker review before any pilot — insurance vocabulary is where machine translation fails, and Igbo/Yorùbá run ~20% longer than English. Diacritics should be tested on real low-end Android. After that: annual beneficiary re-confirmation flow, HR bulk enrolment, the "why your contribution changed" screen, and light-mode testing in bright sun.

Files: csp-i18n.js (translation dictionary), Civil Servant Protect App v2.dc.html (main app), Civil Servant Protect App.dc.html (v1, untouched).

## User

how to we get this to work properly? who do we need to integrate with to get data? and get the money directly from employee paycheck?

## Assistant

_[tool: web_search]_

_[tool: web_search]_

Short answer: you need three separate integrations — payroll (money in), identity (who's who), and underwriting/regulation (who pays claims). None of them are the app.

**1. Money out of the paycheck**

There is no single national deduction API. Two routes:

- **Federal staff** — check-off deduction on IPPIS. IPPIS is the official salary payment platform for most federal workers, run by the Office of the Accountant-General (OAGF) with the OHCSF. Third-party deductions (cooperatives, insurance, unions) go through an approved-deduction schedule: you need OAGF/IPPIS Department sign-off, a deduction code, and usually a union or cooperative as the sponsoring body. Slow, political, but it's the whole prize — one approval unlocks 600k+ salaries. Note federal tertiary institutions have exited IPPIS onto GIFMIS, so universities are a separate conversation.
- **State staff** — states have separate payroll systems. 36 separate integrations, each with the State Accountant-General / Office of the Head of Service. Pick 1–2 friendly states for the pilot (Lagos, Kaduna, Ekiti-type reformers) rather than chasing federal first.

**Fallback that lets you launch now:** direct debit instead of check-off. NIBSS e-Mandate / recurring card debit via Paystack or Flutterwave, or Remita mandate. ₦2,500/mo is small enough that card-on-file works; salary-day timing matters more than the rail. Build for direct debit day one, treat payroll deduction as the scale unlock.

**2. Identity and eligibility data**

- **NIN via NIMC** — the spine. IPPIS 2026 integrates NIMC and BVN, so NIN is how you match a member to a payroll record. Access is through a NIMC-licensed verification agent, not directly.
- **BVN via NIBSS** — bank account ownership, and it's how you pay a claim to the right person.
- **IPPIS number** — proves current employment and grade level. This is what your CSP-ID should ultimately be derived from.
- **Death registration (NPC)** — mostly unusable in practice; funeral claims will run on hospital certificate + attestation, which is exactly why your beneficiary fast-track matters.

**3. Who actually carries the risk**

You cannot hold premiums yourself. Either:
- **Partner with a licensed underwriter** — a NAICOM-licensed life or microinsurance company carries the risk; you're the tech/distribution layer. Fastest path. Post-recapitalisation there's a clean list to pick from — 43 companies were declared compliant with the new capital requirements.
- **Register as a broker/agent** with NAICOM to earn commission legally.
- **Get your own microinsurance licence** — slowest and most capital-heavy; only if this becomes the business.

Also: NDPC registration under the NDPA for the personal data, and a claims-payout rail (NIBSS transfer) that can pay a beneficiary who has no relationship with you.

**Sequence I'd run**

Underwriter partnership → direct debit pilot with one state union or cooperative (2–5k members) → prove claims-paid numbers publicly → use that record to win the payroll deduction code. The audit trail your app is built around is the asset that gets you approved, not a pitch deck.

Want me to add an admin/ops surface for this — the underwriter reconciliation view, deduction schedule upload, and the HR bulk enrolment we'd parked?

## User

are there APIs though and how do we get access? and can we build this to support federal, state and even private institutions and self service?

## Assistant

Yes — but they split into two tiers: **public APIs you can get in a week**, and **government integrations that are contracts, not signups**.

## Tier 1 — real APIs, self-serve or near it

**Money**
- **Paystack / Flutterwave** — recurring card debit + bank direct debit. Signup, test keys same day, live keys after CAC docs. Days.
- **Remita (SystemSpecs)** — the important one. Remita has public mandate/direct-debit APIs *and* is the rail a lot of Nigerian government payment and payroll disbursement runs through. That dual position means a Remita partnership is the shortest bridge from a commercial API to a payroll relationship. Partner/merchant onboarding, weeks.
- **NIBSS** — NIP transfers, e-Mandate, Direct Debit. Not self-serve: you integrate *through* a licensed bank or a PSSP/licensed fintech sponsor. NIBSS doesn't onboard startups directly.

**Identity**
- **Prembly (Identitypass), Dojah, VerifyMe, Youverify, QoreID** — these are NIMC-licensed verification agents and BVN-permitted aggregators. NIN verification, BVN match, phone-to-NIN, liveness/selfie match. Sandbox keys are effectively self-serve; production needs your CAC, NDPC registration and a signed agreement. **This is how you get NIN and BVN — you do not integrate NIMC or NIBSS directly for KYC.** Days to a couple of weeks.
- **Mono / Okra** — bank account data and account-number verification, useful for payout validation.

So: **your entire pilot can be live on Tier 1 alone.** Direct debit + third-party NIN/BVN verification + an underwriter partner. No government approval needed.

## Tier 2 — payroll deduction, which is not an API

IPPIS, GIFMIS and state payroll systems have **no public developer portal**. Integration is:

1. A sponsoring body (union, cooperative, or the employer itself) applies for a **third-party deduction code**.
2. Approval from OAGF / IPPIS Department (federal) or the State Accountant-General (state).
3. The actual data exchange is usually **batch files, not REST** — you send a deduction schedule (member ID, IPPIS number, amount) monthly, they return a remittance/exception file. Often SFTP or a portal upload. Sometimes literally spreadsheets.

Design for that reality: your system should treat payroll as an **async batch reconciliation problem**, not a live API call. Submit schedule → wait → parse returns → mark who paid, who lapsed, who left service.

Private institutions are the same shape but far easier — their HR/payroll (SAP, Sage, SeamlessHR, PaidHR, Workpay) either has an API or exports CSV, and there's no ministry to convince.

## Yes, build it multi-tenant from day one

One product, four collection modes on the same member record:

| Mode | Who | Rail |
|---|---|---|
| Federal check-off | IPPIS MDAs | Deduction code, batch file |
| State check-off | State civil service | Per-state schedule, batch/portal |
| Employer group | Private cos, hospitals, schools | HR API or CSV upload + invoice |
| Self-service | Anyone, incl. informal | Card/bank direct debit |

The abstraction is: **Sponsor** (employer/MDA/state/none) → **Collection Method** → **Member**. A member's identity, CSP-ID, benefits, claims and audit trail are identical in all four; only the payment source and the enrolment door differ. Self-service is the same app with sponsor = null and mode = direct debit — it's a *fallback* for every other mode too, which matters enormously: when a member is transferred, retires, or the deduction fails, they roll to card without losing cover. That continuity is a genuine competitive advantage over union schemes that just drop you.

**Access sequence, concretely:** register CAC + NDPC (both cheap, do now) → Prembly/Dojah sandbox → Paystack or Remita merchant → sign the underwriter → launch self-service and one private employer → use those claims-paid numbers to apply for a state deduction code → federal last.

Want me to build the sponsor/collection-mode layer into the app? That's: an enrolment router (four doors), a payment-method screen that shows *how* you're paying and what happens if it fails, and an HR/sponsor console with deduction-schedule upload and reconciliation exceptions.

## User

update the designs based on this truth

## Assistant

_[tool: read_file]_

_[tool: read_file]_

_[tool: copy_files]_

_[tool: run_script]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: dc_set_props]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

v3 is in — v2 untouched. What changed:

**Sponsor model.** New "Who pays your salary?" screen with four doors (federal/IPPIS, state, private employer, self-paying). Pick one in the left rail and the whole app follows: pay screen, ID card, contributions ledger, and console all re-key. Same member record, same CSP-ID, in all four.

**Identity check screen.** NIN via a licensed verification agent, account via NIBSS — both green. Employment sits *pending* against the monthly payroll file, because that's the truth.

**"How you pay" screen.** Main rail + card backup, the actual grace timeline (file due → 7-day wait → card attempt → 60-day grace), and portability if you transfer, retire or leave.

**Contributions now honest.** A month only turns green when the remittance file returns; card months are a lighter green; the current month reads "waiting" instead of claiming a payment nobody has seen.

**HR view → Sponsor console.** Batch reality, not an API: schedule sent → weeks with the payroll office → return file → reconciliation, blocked by an exceptions queue (unmatched deductions, missing deductions, wrong amounts, left service). Self-paying sponsors get the direct-debit variant, which reconciles same-day.

Harness has a "simulate late deduction" toggle. New strings drafted in all five languages — same native-speaker review caveat, and the payment vocabulary is riskier than the insurance vocabulary was.

## User

Found issues — fixing…

## Assistant

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

Fixed: console stat tiles now branch on sponsor type (self-paying shows 1,240 members / ₦3.1m presented / 96% same-day), the exceptions count is summed from the list rather than hardcoded, and the employer sponsor reads "EMPLOYER · CSV SCHEDULE".

## User

Found issues — fixing…

## Assistant

_[tool: dc_js_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

Both fixed: the console footer paragraph now branches (payroll wording vs. "no schedule to send, only a debit run to chase"), and the plan-upgrade task reads "next collection" under self-paying sponsors.

## User

Found issues — fixing…

## Assistant

Root cause: the `s_hr` block still contains literal payroll strings (section heading + both action buttons) that never pass through `renderVals`, so they can't follow the sponsor. Fixing by moving every sponsor-dependent string in that block into holes in one pass.

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

Every sponsor-dependent string in the console now comes from `renderVals` — heading ("DEDUCTION CYCLE" vs "COLLECTION RUN") and both actions ("Schedule (CSV)" / "Upload return file" vs "Export debit run (CSV)" / "Retry failed debits"). No literal payroll copy left in that block.

## User

the buttons are bizzare though and you could do a better job

## Assistant

_[tool: show_html]_

_[tool: screenshot_user_view]_

The left-rail sponsor picker — shouty mono codes in full-width outlined boxes, easily mistaken for nav items. Replacing with proper chips plus one caption line carrying the rail detail.

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

Sponsor picker is now four pill chips with icons and human labels (Federal / State / Employer / Self-pay), separated from the screen nav by a rule, with the rail detail as a single mono caption underneath instead of shouting codes in every button.

