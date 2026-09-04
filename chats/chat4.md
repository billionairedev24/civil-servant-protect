# User and sponsor mockup integration

_Started 2026-09-03 05:03 UTC_

---

## User

Continuing from "Button designs need fixing".

## Assistant

We were building Civil Servant Protect v3 — a multi-sponsor mobile app plus HR console for Nigerian group protection. The architecture hinges on four payment rails (federal IPPIS batch, state payroll, private employer CSV, self-serve direct debit), each driving the entire experience downstream.

We rebuilt the button system to a single tiered pill geometry (54/52/44/40px) with proper pressed states and flex-shrink protection so buttons never collapse on scroll-heavy screens. Moved "Back" to the top-left, made CTAs full-width at the bottom. Fixed numeric keypads eating into buttons and overhauled "Who gets paid" from generated markup into editable template cards.

Then expanded scope: 11 HR console screens (dashboard, schedule upload, return-file reconciliation, exception detail, member roster, debit runs) plus 4 member flows (beneficiary re-confirmation, private employer onboarding, contribution change explanation, sunlight mode). Console lives in its own file with a desktop/mobile toggle and sidebar nav. Member flows added to v3.

The console branches heavily on sponsor type. Payroll sponsors see schedule/return-file/reconciliation paths; self-paying sponsors see debit-run results instead. Exception handling differs: payroll exceptions are file-match mismatches (unmatched, missing, wrong amount), while self-pay exceptions are NIBSS response codes (no funds, revoked, expired). Each exception screen shows the right data panel and four context-specific resolution paths.

Open: sunlight mode is currently a contrast simulation, not a real high-contrast palette — needs its own token set after translation review. The four new member screens aren't yet wired through csp-i18n.js, so they're English-only for now. Native-speaker translation review and low-end Android diacritic testing still pending.

Files: Civil Servant Protect App v3.dc.html, CSP Sponsor Console.dc.html, csp-i18n.js.

## User

now the user and sponsor mockups shoul;d be combined and we need the web/desktop version of the user app too. Comprehensive so I can get it ready for implementation

## Assistant



## Assistant

_[tool: run_script]_

_[tool: grep]_

_[tool: grep]_

_[tool: grep]_

_[tool: grep]_

_[tool: ask_user]_

_[tool: ask_user]_

Form's up — waiting on your answers on how the three surfaces should combine, what member web is for, and how much implementation spec to bake in.

## User

Answered — shell: One shell file with a top surface switcher; each surface keeps its own screen index (recommended); web_scope: Sign in + OTP, Enrolment / tier pick, Home dashboard, Contributions ledger, Protection card (printable), Cover + tiers detail, Beneficiaries manager, Make a claim, Track claim, Family cover, Profile…; web_why: Full parity with the phone app — same jobs, bigger canvas; web_chrome: option_1; handoff: Data + API contract notes per screen, Copy keys mapped to csp-i18n, Validation rules and edge cases, Responsive breakpoint notes, A separate spec page in the file (not in…

## Assistant

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: grep]_

_[tool: read_file]_

_[tool: update_todos]_

_[tool: dc_write]_

## Assistant

_[tool: dc_write]_

_[tool: show_html]_

_[tool: get_webview_logs]_

_[tool: show_html]_

_[tool: dc_write]_

_[tool: dc_write]_

_[tool: dc_js_str_replace]_

Now the combined shell:

_[tool: dc_write]_

_[tool: show_html]_

_[tool: read_file]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: update_todos]_

_[tool: ready_for_verification]_

**Civil Servant Protect System.dc.html** is the single entry point: four tabs (Member · phone, Member · web, Sponsor · console, Implementation spec) with rail and language pickers in the top bar that drive all three surfaces at once.

New in this turn:
- **CSP Member Web** — 12 desktop screens at full parity: split-panel sign-in with SMS-only sessions, tier picker, dashboard, whole-ledger contributions table, printable A4 card, four-tier benefit schedule table, beneficiaries manager with the 100% validator, claim wizard with 10 MB scan uploads, claim timeline, family cover, profile with device/session list, and the no-account next-of-kin portal. Every screen names what's phone-only vs web-only in place.
- **CSP Implementation Spec** — eight sections: system shape and build order, a 22-row capability matrix (phone/web/console with reasons), API contracts per screen with field shapes, copy-key map flagging the 34 outstanding keys, validation rules with the member-facing message for each, loading/empty/error/offline states per screen, four breakpoints with minimums, and the rail-branching table plus open questions.

Caveats: the spec's translation-debt and sunlight-mode items are recorded as open, not fixed. The four newest v3 member screens are still English-only.

## User

Found issues — fixing…

## Assistant

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: show_html]_

Header fits at 924 with everything reachable — tabs on one line, rail and language chips moved to a light control strip below.

_[tool: ready_for_verification]_

Fixed: tab labels shortened to Phone / Web / Console / Spec with `flex:none` + `white-space:nowrap`, the header wraps instead of squeezing, and the RAIL + LANG pickers now sit in a white control strip below the bar (restyled for the light ground) alongside the surface name and rail reference.

