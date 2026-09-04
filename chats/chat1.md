# Mobile app design request

_Started 2026-09-01 18:30 UTC_

---

## User

Design a mobile app for the attached idea and tell me your thoughts too

## Assistant



## Assistant

I'll read the proposal first.

_[tool: run_script]_

_[tool: run_script]_

_[tool: ask_user]_

Read the proposal — a ₦2,500/month group protection programme for Nigerian civil servants, with claims transparency as the real differentiator. Form's up; waiting on your answers before I build.

## User

Answered — design_system: Picked a design system (now attached); primary_user: All three, with role switching; core_flows: Onboarding & enrolment, Digital CSP-ID / protection certificate, Benefit schedule & tier upgrade, Beneficiary nomination, Report an accident (24hr), Submit a claim, Track my claim, Contribution histo…; context: Low-end Android, patchy network (offline-first), Low digital literacy — big targets, plain language, Trust deficit — heavy transparency, no fine print traps, USSD/WhatsApp fallback surfaced in-app, M…; variations: 2–3 visual directions on the key screens, then buil…

## Assistant

_[tool: list_files]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: grep]_

Design system loaded (Broadsheet — newsprint serif, cyan/magenta spots). Building three directions on the key screens.

_[tool: dc_write]_

_[tool: ready_for_verification]_

Three directions on the key screens, each with three switchable screens (tabs under the phone). Brief with my assumptions is at the top.

**My thoughts on the idea itself** — worth hearing before you pick a direction:

- **The app is not a side feature, it's the product.** The cover itself is commodity group life; any licensed Nigerian insurer can write it. What you're actually selling government is *administration you can audit* — 500k members, payroll reconciliation, and a claim trail nobody can quietly lose. I'd lead every pitch with the CSP-ID and Track My Claim, not the ₦5m.
- **The claim is made by someone who isn't the user.** For the largest benefit, the member is dead. A beneficiary who has never opened the app must be able to start a funeral claim from a phone number and a CSP-ID alone, and the ₦250k funeral payment must be a *separate, fast* rail from the ₦5m death claim. That's the single hardest design problem here and 1c is the only direction that faces it.
- **Beneficiary nomination is the quiet failure mode.** Unnominated or stale beneficiaries are what turn a 20-day claim into a 12-month dispute. It should be nagged at enrolment, re-confirmed annually at payroll, and visible on the home screen — all three directions do this, 1b most aggressively.
- **₦2,500 flat across 18–64 is an actuarial risk, not a design one**, but it has a UI consequence: if experience rating later forces age bands or a price change, the app needs a way to explain that to a million people without it reading as a betrayal. Build the "why your contribution changed" screen before you need it.
- **Payroll deduction means the app has no billing power** — no failed-payment retries, no lapse-and-reinstate. That's a big simplification. Use the room for the contribution ledger, which is the trust artefact: 14 of 14 months paid, visible, exportable.

Direction-wise I'd back **1c** for the real product and borrow 1a's masthead for the certificate and the pitch deck. 1b is the safe procurement answer.

Say the word and I'll build 1c out as a working prototype across all ten flows, plus the HR-officer and beneficiary roles.

## User

maybe we need to change the theme and I want to include auth etc to it and then the full build

## Assistant



## Assistant

_[tool: ask_user]_

_[tool: ask_user]_

Form's up — theme direction, auth method, which direction to build, and the screen list. I'll build the full app in one pass once you submit.

## User

Answered — theme: Swap to a different design system entirely (pick it in the next question); design_system: Picked a design system (now attached); auth: Phone number + SMS OTP, IPPIS / service number + OTP, Email + password, 6-digit app PIN after first login, Biometric unlock, Beneficiary access with no account — CSP-ID + phone, HR officer login (MDA…; build_direction: 1c — The Instrument (my recommendation); scope: Splash + language pick, Auth (OTP, PIN, biometric, errors), First-run enrolment, Home, Digital CSP-ID / certificate, Benefits + tier upgrade, Beneficiary nomination, Report an acc…

## Assistant

New design system — let me load it.

_[tool: list_files]_

_[tool: read_file]_

_[tool: grep]_

Nocturne loaded — dark, Inter, blurple accent, outlined actions. Building the full app now.

_[tool: update_todos]_

_[tool: dc_write]_

## Assistant

_[tool: dc_write]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

_[tool: update_todos]_

Full build is in **Civil Servant Protect App.dc.html** — 21 screens on Nocturne, driveable end to end. Left rail jumps to any screen; right rail explains the reasoning per screen. The original three-direction exploration stays in the other file.

What actually works: language pick, all three sign-in doors, tappable OTP keypad (with a "demo: wrong code" link to see the error state), PIN entry, 3-step enrolment, tier selection that propagates, 4-step accident report, 5-step claim wizard, claim tracking, HR view, beneficiary-without-account entry, and an offline toggle under the phone.

Two things to flag:

- **Nocturne is a mono palette** — one blurple accent, no second colour. I've carried urgency with weight and outline instead of red/green, which is disciplined but means an insurance app has no true alert colour. If you want one, it should be added to the design system rather than invented here.
- **Dark UI in bright sun** is the one real risk for a field-used Nigerian app. Worth a light mode before any pilot.

Next I'd suggest: the annual beneficiary re-confirmation flow, HR bulk enrolment, and the "why your contribution changed" screen.

## User

Found issues — fixing…

## Assistant

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

Tab bar now uses real Phosphor glyphs — house, file-text, identification-card, users-three, dots-three-circle — filled on the active tab, regular otherwise.

## User

now, I think the auth is too verborse, social login, otp, biometrics is fine for starters. then, I do not like this theme and the fonts and colors too, we have to change that

## Assistant



## Assistant



## Assistant



## Assistant

Both are worth getting right before I touch the file — a retheme rewrites every colour and font anyway, so I'll do the auth simplification in the same pass.

_[tool: ask_user]_

Noted — real translation, not just a label swap: every string on all 21 screens comes from a language dictionary, so picking Igbo redraws the whole app.

Folding that into the same form so nothing is lost:

_[tool: ask_user]_

_[tool: ask_user]_

Waiting on the theme, typeface, accent, translation scope and auth confirmation — then I'll rebuild the whole app in one pass.

## User

Answered — direction: Light with a Nigerian civic accent — deep green + ink on paper; languages: Also add Nigerian Pidgin as a fifth; auth_confirm: Google sign-in, Phone number + SMS OTP, Fingerprint / Face unlock, Beneficiary access with CSP-ID (no account), HR officer sign-in

## Assistant

Building it: light paper + deep civic green, Public Sans, five languages wired to a real dictionary, slimmed auth. New file so v1 stays intact.

_[tool: update_todos]_

_[tool: dc_write]_

## Assistant

Too large for one pass — splitting the translation dictionary into its own file.

_[tool: write_file]_

Now the app itself, reading from that dictionary.

_[tool: dc_write]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

**Civil Servant Protect App v2** — new theme, slim auth, five real languages. v1 is untouched.

**Theme:** paper `#EDEBE4` / ink `#14181B` / deep civic green `#046A38`, Public Sans with IBM Plex Mono for reference numbers and CSP-IDs. Two semantic colours added since Nocturne had none: clay for accident and errors, ochre for "needs attention". Green stays reserved for money and confirmation.

**Auth is now three screens:** Google or phone number → 6-digit SMS code → fingerprint. IPPIS, email, the PIN screen and the device-binding screen are gone; device trust moved onto the card screen where it's actually relevant. The two non-member doors stayed — a grieving relative and an HR officer still can't be routed through a member login.

**Languages** switch on the splash screen or in Profile. Every string on all 19 screens comes from one table, including claim-wizard questions, timeline stages and tab labels — so Igbo or Pidgin redraws the whole app, not just the headings.

Two flags: the translations are machine-drafted and need a native speaker per language before any pilot — insurance vocabulary is where machine translation fails hardest, and Igbo/Yorùbá strings run ~20% longer than English, so watch for wrapping. Second, Yorùbá and Igbo diacritics render correctly in Public Sans but should be checked on real low-end Android, where font fallback is less reliable.

