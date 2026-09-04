# Button designs need fixing

_Started 2026-09-02 02:39 UTC_

---

## User

Continuing from "Payroll integration setup".

## Assistant

We were rebuilding Civil Servant Protect v3 — a multi-sponsor mobile app for Nigerian group protection. The key insight came from integrating reality: money doesn't come from a single API, it comes from four separate rails (federal IPPIS batch, state payroll batch, private employer CSV, or self-serve direct debit). The app needed to follow sponsor choice end-to-end.

We settled on a four-door enrolment model: federal/state/employer/self-paying, each keying the entire downstream experience — payment method, contribution ledger, grace timelines, and console reconciliation. The sponsor picker moved from the old flat nav into proper pill chips with icons and a caption line showing the rail detail, separated from screen nav by a rule. Much cleaner than the shouty mono codes.

Identity now honest: NIN gets verified via a licensed agent (Prembly/Dojah), employment sits *pending* until the monthly payroll file returns, contributions turn green only when a remittance actually clears. Card is the backup, never the primary. The "How you pay" screen now shows the real grace timeline: file due → 7-day wait → card attempt → 60-day grace, plus portability rules if you transfer, retire, or leave service.

The HR/sponsor console split by type: payroll sponsors upload a schedule monthly and wait for a return file, reconciling exceptions (unmatched, missing, wrong amount, left service). Self-paying sponsors just run direct debits same-day. Stats tiles branch accordingly. Every sponsor-dependent string (headings, button labels, captions) now flows through `renderVals` so nothing breaks when the sponsor changes.

Open: native-speaker translation review (payment vocabulary is riskier than insurance vocab), diacritic testing on low-end Android, and the four remaining flows (annual beneficiary re-confirmation, private employer onboarding, "why your contribution changed" screen, bright-sun light mode).

Files: Civil Servant Protect App v3.dc.html, csp-i18n.js, v2.dc.html (archive).

## User

I said the button designs are awful, you need to fix that

## Assistant

_[tool: grep]_

_[tool: show_html]_

_[tool: show_html]_

_[tool: multi_screenshot]_

_[tool: grep]_

_[tool: run_script]_

_[tool: run_script]_

_[tool: multi_screenshot]_

_[tool: grep]_

_[tool: grep]_

_[tool: grep]_

_[tool: grep]_

_[tool: read_file]_

_[tool: str_replace_edit]_

_[tool: multi_screenshot]_

Rebuilt the button system across the app: pill geometry (999px) so actions read as actions and never like cards or input fields, one fixed height per tier (54 / 52 / 44 / 40px) instead of eleven different paddings, primary green with an inset top highlight and a soft green-cast shadow plus a real pressed state (darken + 1px sink), outlined secondaries at 1.5px, dashed "add" buttons replaced with solid tinted pills, and the "Something is wrong — tell HR" box demoted to a quiet green text button instead of a fake input.

_[tool: ready_for_verification]_

Done — every button in v3 now runs off one tiered pill system with consistent heights, hover, and pressed states.

## User

see NIN + BVN check, the this is me button literally collapses into the buttom

## Assistant

_[tool: read_file]_

_[tool: run_script]_

_[tool: ready_for_verification]_

That's the home screen's own scroll area — expected. Fixed: the 54px pills had default flex-shrink, so on scroll-heavy screens like NIN + BVN check they got squeezed flat. All 25 pills now hold their height.

## User

same with enrollment and back button should not be that way, bad design. all other pages, similar issues

## Assistant

_[tool: grep]_

_[tool: read_file]_

_[tool: run_script]_

_[tool: multi_screenshot]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: show_html]_

_[tool: eval_js]_

_[tool: grep]_

_[tool: eval_js]_

_[tool: eval_js]_

Fixed both: `flex:none` was overriding `flex:1` on the paired CTAs (now `flex-shrink:0`, so Continue fills the row at a locked 54px), and the wide bordered "Back" text pill next to it is now a 54px circular icon button — on enrolment, report-accident, and claim.

_[tool: ready_for_verification]_

Both fixed across all screens — no button can be squeezed now, and the bottom Back is a circular icon button so the primary action owns the row.

## User

This is bizzare right, thats how your buttons are. This button could be up in this case

## User

also , back can't be at the buttom and another bizzare button

## User

also , back can't be at the buttom and another bizzare button

## Assistant

_[tool: read_file]_

_[tool: read_file]_

_[tool: str_replace_edit]_

_[tool: grep]_

_[tool: grep]_

_[tool: run_script]_

_[tool: ready_for_verification]_

Back now lives at the top-left of enrolment, report-accident and make-a-claim (same text-back as the phone screen), so the bottom row is a single full-width Continue — no more circular orphan. "Something is wrong — tell HR" is a plain underlined text link under the record instead of a full-width tinted pill.

## User

see how number keys eat into the buttom of the screen, and confirm who gets page have similar issues? You should go through all screens and fix issues like this. we want a perfect design

## User

see how number keys eat into the buttom of the screen, and confirm who gets page have similar issues? You should go through all screens and fix issues like this. we want a perfect design

## User

who gets paid, I am not able to edit that

## Assistant

_[tool: grep]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

The Who gets paid cards were generated from a data array in the logic class, which is why the editor couldn't reach the names, shares or bars. They're now literal template markup — three real cards (the third revealed by "Add another person"), with the names, percentages and bar widths all directly editable. The relationship words still come from the translation file so they stay in sync across languages.

## User

if we have a payroll batch, how do we get the money?

## Assistant

Money never comes from the app — it comes from the employer's payroll run, and the app only ever learns about it after the fact. The cycle:

**1. Schedule out (before payroll cut-off)**
You send the sponsor a deduction schedule — one row per member: staff/IPPIS number, NIN, name, amount, policy ref. For federal that goes through the IPPIS deduction-request process; for a state it's the Accountant-General's office or their payroll bureau; for a private employer it's a file to HR/finance.

**2. Deduction at source**
Payroll applies the deduction when it runs salaries. Nothing hits your account yet — the employer is now holding the money.

**3. Remittance (the actual cash)**
The sponsor pays one lump sum by bank transfer/NIBSS to your collections account, covering all members for that month. One credit, hundreds of members. This is usually days-to-weeks after the salary run, which is exactly why the app says "waiting for file" rather than "paid".

**4. Return file / schedule back**
The sponsor sends back the reconciled schedule: who was actually deducted, who wasn't, and how much. This is the only document that tells you which member is covered — the bank credit alone can't.

**5. Reconciliation**
Match the lump sum against the return file, then allocate per member. Exceptions are the real work: unmatched (in file, no member), missing (member deducted nothing), wrong amount (partial deduction), left service. Those drive the grace-period logic and the card fallback.

The two hard constraints this puts on the design: you're reconciling one credit against many members, and cover status is a function of the return file, not of the money landing. Which is why in the app employment stays *pending* and contributions only go green once step 5 clears.

## User

can we include all the hr screens and the other screens?

## Assistant



## Assistant

_[tool: grep]_

_[tool: grep]_

22 screens exist today, but HR is a single screen. Before I build out the console I need a few calls — including one big one: a Nocturne design system just got attached, and it's a dark blue-grey/blurple system that would replace the app's green Nigerian palette entirely.

_[tool: ask_user]_

Waiting on your answers — mainly whether Nocturne applies to the whole app or just the console, and which HR screens you want. I'll build once you submit.

## User

Answered — hr_screens: Console home / dashboard, Upload monthly schedule, Return-file reconciliation queue, Single exception detail + resolve, Member roster + search, Add / remove members, Direct-debit run (self-paying spo…; member_screens: Annual beneficiary re-confirmation, Private employer onboarding, Why your contribution changed, Bright-sun light mode; hr_device: Both; placement: Ask me if it gets big; notes: for theme, maintain same theme

## Assistant

Clear: keep the green theme (Nocturne stays unused), all 11 HR screens, all 4 member flows, both devices. 11 desktop screens is big — HR console goes in its own file, member flows into v3.

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

Building the console as its own file, same green theme, with a desktop/mobile toggle.

_[tool: dc_write]_

Console done. Now the four member flows into v3.

_[tool: read_file]_

_[tool: run_script]_

_[tool: read_file]_

_[tool: run_script]_

_[tool: ready_for_verification]_

Two files, same green theme (Nocturne left unused per your note):

**CSP Sponsor Console.dc.html** — 11 desktop screens in a browser frame with a real app shell (sidebar, grouped nav, user footer), plus a phone toggle in the left rail that reflows the same screens for an HR officer working off a handset. Everything branches on sponsor type: payroll sponsors get the schedule/return-file/reconciliation path, self-paying get the debit run, and each screen that doesn't apply to the current rail says so and points to the one that does. The reconciliation queue and the single-exception screen are the core — file row vs member record side by side, a 94%-confidence suggested match, and four decisions including returning money to payroll.

**Civil Servant Protect App v3.dc.html** — added the four member flows: annual beneficiary re-confirmation (with the unreachable-number flag and what happens if you ignore it), private employer onboarding (employer code confirm, who-pays-what split, what the employer can and cannot see, portability), why your contribution changed (₦2,500 → ₦3,700 itemised, including a discount line, plus a 30-day dispute), and a bright-sunlight toggle in the control row. Entry points wired from the contributions and beneficiaries screens.

Two caveats: the sunlight mode is a contrast simulation on the whole frame rather than a proper second palette — if you want a real high-contrast theme it needs its own token set, worth doing after the translation pass. And the new screens are English-only so far; they don't yet route through `csp-i18n.js` like the rest.

## User

Found issues — fixing…

## Assistant

_[tool: run_script]_

_[tool: run_script]_

_[tool: ready_for_verification]_

Reconciliation and exception detail now branch on the collection rail rather than assuming payroll:

Self-pay reconciliation reads "Debit results · August 2026 — 1,240 mandates presented, settled the same day", with a banner saying there is no return file on this rail, a settled/no-funds/revoked/expired match bar, and bank-response exception rows (all sized to 1,240, not 8,412).

Exception detail becomes a failed debit — "₦2,500 was refused by the member's bank" — with a NIBSS response-code panel instead of a payroll-file panel, the member's mandate history opposite it, and four different decisions: retry on the 4th, move her collection date to the 30th, fall back to the card, or send the USSD prompt. The sidebar badge now counts 51 instead of 57 when payroll is off.

