/**
 * The implementation spec's content, as data.
 *
 * This is what a build team needs that a mockup cannot show: contracts, copy
 * keys, validation rules with the member-facing message, the states the
 * mockups don't draw, breakpoints, and how the four rails branch. Keeping it
 * here rather than in JSX means it stays greppable and diffable as the build
 * moves on — and outdated spec is worse than none.
 */

export type SpecSection =
  | 'overview' | 'matrix' | 'contracts' | 'i18n' | 'rules' | 'states' | 'responsive' | 'rails'

export const SPEC_SECTIONS: readonly { id: SpecSection; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'ph ph-compass' },
  { id: 'matrix', label: 'What lives where', icon: 'ph ph-squares-four' },
  { id: 'contracts', label: 'Data + API', icon: 'ph ph-plugs-connected' },
  { id: 'i18n', label: 'Copy keys', icon: 'ph ph-translate' },
  { id: 'rules', label: 'Validation', icon: 'ph ph-check-square-offset' },
  { id: 'states', label: 'Screen states', icon: 'ph ph-stack' },
  { id: 'responsive', label: 'Breakpoints', icon: 'ph ph-frame-corners' },
  { id: 'rails', label: 'Rail branching', icon: 'ph ph-git-fork' },
]

export const SURFACES = [
  {
    name: 'Member · phone', icon: 'ph ph-device-mobile', meta: 'Android-first · 4.1 MB · offline-capable',
    body: 'Where enrolment, the offline card, the camera and USSD fallback live. Assume a mid-range Android on a slow network, held by someone who may not read English.',
    owner: 'Owns: device trust, offline queue, the protection card at a hospital gate.',
  },
  {
    name: 'Member · web', icon: 'ph ph-monitor', meta: '≥1024 designed · degrades to 360',
    body: 'Same twelve jobs on a wider canvas: full tables, scanned uploads, printing and PDFs. Often a shared office or business-centre machine, so every session is short and code-verified.',
    owner: 'Owns: paperwork, printing, the whole ledger, next-of-kin claims from a laptop.',
  },
  {
    name: 'Sponsor · console', icon: 'ph ph-buildings', meta: 'Desktop-first · phone layout for HR officers',
    body: "Eleven screens driven by the sponsor's collection rail: schedules, return files, reconciliation, exceptions, debit runs, roster. Never sees beneficiaries or claim contents.",
    owner: 'Owns: the payroll record, schedules, exception resolution.',
  },
] as const

export const BUILD_ORDER = [
  { n: '1', title: 'Member record + rail resolution', body: "Nothing else can be built honestly until a member's rail is a first-class field. Every screen branches on it." },
  { n: '2', title: 'Auth on all three surfaces', body: 'One OTP service, three session policies. Do the web idle-timeout rules now, not later — they change the UI.' },
  { n: '3', title: 'Contribution ledger, read-only', body: 'Append-only from day one. It is the spine of trust and the thing members check most.' },
  { n: '4', title: 'Console schedule + reconciliation', body: 'The exception queue is the product for sponsors. Build the payroll rails first, self-pay debit runs second.' },
  { n: '5', title: 'Beneficiaries, then claims', body: 'Claims are worthless if the beneficiary set is stale, so ship the 100% rule and the 12-month re-confirmation before the claim wizard.' },
] as const

/** yes | partial | no (deliberately absent) | n/a (not possible here) */
export type Capability = 'yes' | 'part' | 'no' | 'na'

export const MATRIX: readonly [string, Capability, Capability, Capability, string][] = [
  ['Sign in with SMS code', 'yes', 'yes', 'yes', 'The only auth method shared by all three.'],
  ['Fingerprint / device unlock', 'yes', 'na', 'no', 'Device-bound. Browsers are shared machines.'],
  ['Trusted-device shortcut', 'yes', 'na', 'no', 'Requires a device we can attest.'],
  ['See cover and tier', 'yes', 'yes', 'yes', 'Console sees it per member, not personally.'],
  ['Full benefit schedule, all tiers', 'part', 'yes', 'yes', 'Phone shows one tier at a time; the table needs width.'],
  ['Protection card, offline', 'yes', 'na', 'no', 'Cached on the device; a browser cannot promise it.'],
  ['Print card / statement at A4', 'no', 'yes', 'yes', 'Needs a printer and a page-size layout.'],
  ['Contribution ledger', 'part', 'yes', 'yes', 'Phone shows recent months; web shows the whole ledger.'],
  ['Download statement as PDF', 'part', 'yes', 'yes', 'Phone can share a file; web is where people actually print.'],
  ['Edit beneficiaries and shares', 'yes', 'yes', 'no', 'Members only. The console may never touch this.'],
  ['Upload scanned documents to 10 MB', 'no', 'yes', 'yes', 'Camera photos on phone; scanner files on web.'],
  ['Photograph papers at the scene', 'yes', 'no', 'no', 'Camera plus offline queue.'],
  ['File a claim', 'yes', 'yes', 'no', 'Console can see a claim, never create one.'],
  ['Report an accident offline', 'yes', 'no', 'no', 'Queues locally and sends itself on signal.'],
  ['Track claim stages', 'yes', 'yes', 'yes', 'Same audit log, three lenses.'],
  ['Message the assessor', 'yes', 'yes', 'no', 'Sponsor is deliberately outside the claim conversation.'],
  ['Add family cover', 'yes', 'yes', 'no', "Member's own money, member's own decision."],
  ['Next-of-kin claim without an account', 'yes', 'yes', 'no', 'Web accepts scans; phone accepts photos.'],
  ['Upload a monthly schedule', 'no', 'no', 'yes', 'Sponsor-only, and desktop-only in practice.'],
  ['Resolve a reconciliation exception', 'no', 'no', 'yes', 'Officer work on a file of hundreds of rows.'],
  ['Change payroll record fields', 'no', 'no', 'yes', 'The record belongs to the sponsor.'],
  ['USSD / WhatsApp fallback', 'yes', 'no', 'no', '*347*55# for members with no data at all.'],
]

export interface ContractRow {
  screen: string
  surfaces: string
  endpoint: string
  fields: string
  note: string
}

export const CONTRACTS: readonly { name: string; icon: string; meta: string; rows: ContractRow[] }[] = [
  {
    name: 'Identity and session', icon: 'ph ph-fingerprint', meta: 'shared by all surfaces',
    rows: [
      {
        screen: 'Sign in', surfaces: 'phone · web · console',
        endpoint: 'POST /v1/auth/otp · POST /v1/auth/verify',
        fields: '{ msisdn } → { challengeId, expiresIn } · { challengeId, code } → { accessToken, refreshToken, role, memberId?, sponsorId? }',
        note: 'Three attempts per challenge, then a 15-minute lock. Web tokens are 20-minute idle / 8-hour absolute; the phone app refreshes silently against a device-bound key.',
      },
      {
        screen: 'Device trust', surfaces: 'phone only',
        endpoint: 'POST /v1/devices/attest',
        fields: '{ deviceId, platform, publicKey } → { trusted, revocable }',
        note: 'Never called from a browser. A revoked device is rejected at the token refresh, not at the next screen.',
      },
    ],
  },
  {
    name: 'Member and cover', icon: 'ph ph-shield-check', meta: 'read-mostly',
    rows: [
      {
        screen: 'Dashboard', surfaces: 'phone · web',
        endpoint: 'GET /v1/members/me/summary',
        fields: '{ member{name,cspId,grade}, sponsor{id,type,name,rail,ref}, cover{tier,sumAssured,inForceSince}, collection{state,lastPeriod,nextDate,gracePeriodEndsAt}, attention[] }',
        note: 'One call paints the whole dashboard. attention[] is server-ranked; the client renders at most one banner and never decides priority itself.',
      },
      {
        screen: 'Cover detail', surfaces: 'phone · web · console',
        endpoint: 'GET /v1/products/schedule?tier=all',
        fields: '{ tiers[{code,name,priceMinor,benefits[{key,valueMinor|text}]}], wordingVersion, effectiveFrom }',
        note: "Benefit rows are keyed, not positional, so a locale can reorder them. wordingVersion is what a member's PDF is stamped with.",
      },
      {
        screen: 'Protection card', surfaces: 'phone · web',
        endpoint: 'GET /v1/members/me/card',
        fields: '{ cspId, qrPayload, signature, inForceSince, tier, printUrl }',
        note: 'qrPayload is a signed offline token valid 90 days so a hospital can verify with no network. printUrl returns an A4 PDF with a 30 mm QR.',
      },
    ],
  },
  {
    name: 'Money', icon: 'ph ph-receipt', meta: 'immutable ledger',
    rows: [
      {
        screen: 'Contributions', surfaces: 'phone · web · console',
        endpoint: 'GET /v1/members/me/contributions?from&to&status',
        fields: '{ rows[{period,amountMinor,source,railRef,status,receivedAt}], totals{paidMinor,monthsCovered}, cursor }',
        note: 'Append-only; a correction is a new row with a reversal reference, never an edit. Web pages at 24 rows, phone at 6.',
      },
      {
        screen: 'Family cover', surfaces: 'phone · web',
        endpoint: 'GET/POST /v1/members/me/dependants',
        fields: '{ dependants[{id,name,dob,relation,sumAssuredMinor,premiumMinor,evidence[]}] } → { newPremiumMinor, effectiveFrom }',
        note: "Premium is quoted by the server for the member's age band; the client never multiplies. Adding a dependant on a payroll rail raises the sponsor's line total without disclosing who it covers.",
      },
    ],
  },
  {
    name: 'Beneficiaries and claims', icon: 'ph ph-first-aid-kit', meta: 'member-write, sponsor-blind',
    rows: [
      {
        screen: 'Beneficiaries', surfaces: 'phone · web',
        endpoint: 'GET/PUT /v1/members/me/beneficiaries',
        fields: '{ people[{id,name,relation,msisdn?,nin?,sharePct,trusteeId?,evidence[]}], lastConfirmedAt } → 409 on share sum ≠ 100',
        note: 'PUT replaces the whole set in one transaction, so a half-saved split cannot exist. Every change writes an append-only diff the member can see and the sponsor cannot.',
      },
      {
        screen: 'Make a claim', surfaces: 'phone · web',
        endpoint: 'POST /v1/claims · POST /v1/claims/{id}/documents',
        fields: '{ type, subjectMemberId, claimantRelation, answers{} } → { claimRef, requiredDocs[] } · multipart ≤10 MB, pdf|jpg|png',
        note: 'requiredDocs is derived from the claim type server-side — the client must not hard-code the four-document list. Funeral advance is a separate child claim opened automatically.',
      },
      {
        screen: 'Track claim', surfaces: 'phone · web · console',
        endpoint: 'GET /v1/claims/{ref}',
        fields: '{ ref, type, stages[{key,state,at,actor,note}], documents[{key,state}], assessor{name,office}, payout{accountMask,expectedAt} }',
        note: 'stages[] is the audit log itself, not a summary of it — time-stamped, append-only, readable over USSD by the same reference.',
      },
    ],
  },
  {
    name: 'Sponsor side', icon: 'ph ph-buildings', meta: 'console only',
    rows: [
      {
        screen: 'Schedule upload', surfaces: 'console',
        endpoint: 'POST /v1/sponsors/{id}/schedules',
        fields: 'multipart csv|xlsx → { batchId, rowCount, parsed, rejected[{row,reason}] }',
        note: 'Parse is synchronous up to 5,000 rows, then queued with a webhook. A rejected row never blocks the accepted ones.',
      },
      {
        screen: 'Reconciliation', surfaces: 'console',
        endpoint: 'GET /v1/sponsors/{id}/reconciliation/{batchId}',
        fields: '{ matched, exceptions[{memberId,kind,expectedMinor,receivedMinor,railCode}], summary{byKind} }',
        note: 'kind is file-match for payroll rails (unmatched · no deduction · wrong amount · left service) and a NIBSS response code for self-pay (no funds · revoked · expired). The UI branches on rail, not on sponsor name.',
      },
      {
        screen: 'Exception resolution', surfaces: 'console',
        endpoint: 'POST /v1/reconciliation/exceptions/{id}/resolve',
        fields: "{ action: 'match'|'waive'|'chase'|'remove', note, effectivePeriod } → { memberState, graceEndsAt }",
        note: "Resolving never silently drops a member's cover; 'remove' schedules the 60-day grace and notifies the member on both member surfaces.",
      },
    ],
  },
]

export type KeyState = 'live' | 'new' | 'untranslated'

export const KEY_ROWS: readonly [string, string, KeyState][] = [
  ['Splash + language', 'tagline · continue · size_note', 'live'],
  ['Sign in', 'signin_title · signin_sub · google · phone_btn · bene_title · hr_title · ussd_note', 'live'],
  ['Phone + OTP', 'phone_title · phone_label · send_code · otp_title · otp_sub · resend · wrong_code · voice_fallback', 'live'],
  ['Enrolment', 'step · e0_* · e1_* · e2_* · add_person · tier_d[] · done_title · your_id', 'live'],
  ['Dashboard', 'greeting · if_you_die · paid_to · accident_amount · see_cover · attention · offline_note', 'live'],
  ['Cover detail', 'cover_title · cover_sub · sched[] · tier_d[] · change_plan · plan_note · disclaimer · upgrade', 'live'],
  ['Protection card', 'card_title · card_sub · csp_id · in_force · scan_note · save_phone · share_hr · device*', 'live'],
  ['Beneficiaries', 'benes_title · benes_sub · shares_title · confirm_correct · ask_again · add_person', 'live'],
  ['Claim + track', 'cl_q[] · cl_h[] · cl_o[] · cl_cta[] · docs_n[] · sum_k[] · stages[] · stage_when[] · now_* · audit_note', 'live'],
  ['Contributions', 'paid_title · paid_sub · across_months · recent · deduction · download', 'live'],
  ['Family cover', 'fam_title · fam_sub · fam_n[] · add_family · new_total*', 'live'],
  ['Next-of-kin', 'bene_page_title · bene_page_sub · their_id · your_number · no_id_note · start_funeral · funeral_target', 'live'],
  ['Web session + print', 'web_session_note · print_a4 · download_pdf · export_data · upload_hint · shared_machine_note', 'new'],
  ['Web-only / phone-only notes', 'only_on_web[] · only_on_phone[] · why_not_here', 'new'],
  ['Beneficiary re-confirmation', 'beneconf_* · whychanged_*', 'untranslated'],
  ['Employer onboarding', 'onboard_*', 'untranslated'],
  ['Sponsor console', 'console_* (nav, exceptions, debit runs, roster filters)', 'untranslated'],
]

export const I18N_STATS = [
  { label: 'LOCALES', value: '5', sub: 'en · ha · yo · ig · pcm', alert: false },
  { label: 'KEYS TRANSLATED', value: '168', sub: 'Machine-drafted, unreviewed', alert: false },
  { label: 'KEYS OUTSTANDING', value: '34', sub: 'Web session, console, 4 new member screens', alert: true },
] as const

export const I18N_DEBT = [
  "All five locales are machine-drafted. Insurance vocabulary in Hausa, Yorùbá and Igbo needs a native-speaker pass before any pilot — 'beneficiary', 'sum assured', 'grace period' and 'mandate' are the risky ones.",
  'The four newest member screens (beneficiary re-confirmation, employer onboarding, contribution change, sunlight mode) are English-only and not yet wired through csp-i18n.js.',
  'The sponsor console is English-only on purpose for now — officers work in English — but the exception reasons a member sees must be translated.',
  'Yorùbá and Igbo diacritics need testing on low-end Android system fonts; some render as boxes at 12px and below.',
] as const

export type Severity = 'block' | 'nudge' | 'info'

export const RULES: readonly { name: string; icon: string; rows: { rule: string; msg: string; sev: Severity }[] }[] = [
  {
    name: 'Identity and enrolment', icon: 'ph ph-identification-card',
    rows: [
      { rule: 'MSISDN must match the payroll record for a payroll-rail member', msg: 'That number is not the one on your payroll record. Ask your HR officer to update it, or sign in with the old number.', sev: 'block' },
      { rule: 'NIN and BVN must both verify before cover starts', msg: 'We could not confirm your NIN. Your cover cannot start until it matches — this protects your family at claim time.', sev: 'block' },
      { rule: 'A member may hold exactly one active cover per sponsor', msg: 'You are already covered through this sponsor. To change tier, use Move to another plan.', sev: 'block' },
      { rule: 'Self-pay mandate must clear a ₦100 verification debit', msg: 'We will take ₦100 to confirm the account and return it within 24 hours.', sev: 'info' },
    ],
  },
  {
    name: 'Beneficiaries', icon: 'ph ph-users-three',
    rows: [
      { rule: 'Shares must total exactly 100%', msg: 'The shares add up to {total}%. Adjust them to 100% before saving.', sev: 'block' },
      { rule: 'At least two named beneficiaries', msg: 'Name at least two people, so one unreachable name never holds up a claim.', sev: 'block' },
      { rule: 'A minor needs a birth certificate and an adult trustee', msg: 'Amaka is under 18. Name an adult who will receive on her behalf, and add her birth certificate.', sev: 'block' },
      { rule: 'Re-confirmation prompt after 12 months', msg: 'Last confirmed 14 months ago. Check these names are still right.', sev: 'nudge' },
    ],
  },
  {
    name: 'Claims and documents', icon: 'ph ph-first-aid-kit',
    rows: [
      { rule: 'Death claim requires a death certificate or a hospital letter', msg: 'We need one of these two papers to open the claim. The rest can follow.', sev: 'block' },
      { rule: 'Files: pdf, jpg, png only, 10 MB each, 12 per claim', msg: 'That file is {size}. Photograph it instead, or ask someone to scan it smaller.', sev: 'block' },
      { rule: 'Blurry or unreadable scan is flagged, never rejected outright', msg: 'A person will read this. If they cannot, we will call you — do not re-upload unless we ask.', sev: 'info' },
      { rule: 'Funeral advance opens automatically alongside a death claim', msg: '₦250,000 funeral money is already moving, separately from the ₦5,000,000.', sev: 'info' },
      { rule: 'Offline accident report queues and is never lost', msg: 'Saved on this phone. It sends itself when you get network.', sev: 'info' },
    ],
  },
  {
    name: 'Collection and grace', icon: 'ph ph-calendar-x',
    rows: [
      { rule: 'A missed payroll month never lapses cover inside 60 days', msg: 'Your sponsor has not sent {period} yet. Your cover stays in force — we are chasing them, not you.', sev: 'info' },
      { rule: 'Self-pay debit retries on the 3rd and 10th before grace starts', msg: 'The debit did not go through. We will try again on the 10th.', sev: 'nudge' },
      { rule: 'Grace expiry requires a notice on both member surfaces plus SMS', msg: 'Cover ends on {date} unless {period} is paid. Call 0700 277 7836 if this is wrong.', sev: 'block' },
      { rule: 'A tier change on a payroll rail waits for sponsor approval', msg: 'Your new plan starts the month after HR approves the deduction.', sev: 'info' },
    ],
  },
  {
    name: 'Web session hygiene', icon: 'ph ph-monitor',
    rows: [
      { rule: '20-minute idle timeout, 8-hour absolute session', msg: 'You were signed out because this machine was idle. Sign in again to continue.', sev: 'block' },
      { rule: "No 'remember me' on web, ever", msg: 'We do not keep you signed in on a browser. These machines are shared.', sev: 'info' },
      { rule: 'Card, ledger and claim PDFs are single-use signed URLs, 10 minutes', msg: 'This download link has expired. Open it again from your account.', sev: 'block' },
      { rule: 'NIN, BVN and account numbers are masked until an explicit reveal', msg: 'Show full number', sev: 'info' },
    ],
  },
]

/** [screen, loading, empty, error, offline/cached] */
export const STATES: readonly string[][] = [
  ['Dashboard', 'Skeleton for the cover card and the ledger rows; the sponsor chip renders from the token immediately', 'Never truly empty — a member without cover sees the enrolment path instead', 'Cached summary with a stale banner; actions that need the network are disabled, not hidden', 'Phone: full offline card and last-saved summary. Web: read-only from cache, no writes'],
  ['Cover detail', 'Table header first, benefit rows in', 'n/a', 'Retry inline; the tier the member holds still shows from cache', 'Web caches the schedule for 24 h; phone caches indefinitely with a version check'],
  ['Protection card', 'Card frame with the QR box reserved', 'n/a', 'Card still shows; print and PDF disabled with a reason', "Phone card is valid offline for 90 days; web shows 'connect to print'"],
  ['Contributions', 'Eight skeleton rows at row height', "'No contributions yet — your first is expected {date}'", 'Keep the rows, banner the staleness, disable download', 'Phone shows last 6 months offline; web needs the network for the full ledger'],
  ['Beneficiaries', 'Rows plus a disabled share total', "'No one named yet' with the two-person rule stated up front", 'Editing is blocked offline — a half-saved split must not exist', 'Phone queues nothing here by design; web disables Save'],
  ['Make a claim', 'Step bar renders immediately, options in', 'n/a', 'Phone: the whole draft persists locally and sends itself. Web: the draft is server-side per step', 'This is the one flow where the two surfaces genuinely differ'],
  ['Track claim', 'Stage rail with muted stages', 'n/a', 'Last-known stages with the time they were fetched', 'Same audit log; USSD reads it aloud by reference'],
  ['Family cover', 'Row skeletons, total hidden until quoted', "'No dependants added'", 'Quote requires the network; the form holds its input', 'Never estimate a premium client-side while offline'],
  ['Next-of-kin portal', 'Form renders instantly, no session to wait for', 'n/a', 'Hard requirement: this flow needs the network', 'Web accepts scans to 10 MB, phone accepts camera photos'],
]

export const BREAKPOINTS = [
  {
    range: '≥ 1280', name: 'Desktop, designed', who: 'Office PC · member web and console',
    rules: [
      'Member web: 218px nav rail, content capped at 830px, two-column dashboard at 1.35fr / 1fr.',
      'Console: 224px sidebar plus a data pane that grows; tables never centre.',
      'Benefit schedule and ledger show every column.',
    ],
  },
  {
    range: '1024 – 1279', name: 'Small desktop', who: 'Secretariat monitors, the common real case',
    rules: [
      'Dashboard collapses to one column; the cover card stays first.',
      'Ledger drops the reference column, keeps month / source / amount / status.',
      'Benefit table becomes horizontally scrollable rather than shrinking type.',
    ],
  },
  {
    range: '768 – 1023', name: 'Tablet / narrow window', who: 'Rare but must not break',
    rules: [
      'Nav rail becomes a top row of icon tabs.',
      'All tables become stacked cards, one record per card.',
      'Print and PDF actions stay — this is often where a claim gets printed.',
    ],
  },
  {
    range: '≤ 767', name: 'Phone browser', who: 'Members without the app installed',
    rules: [
      'Do not simulate the native app. Single column, 16px base, 44px targets.',
      'Offer the app once, non-blocking; the web flow must complete without it.',
      'Hide nothing essential: the whole ledger stays reachable by paging.',
    ],
  },
] as const

export const MINIMUMS = [
  { icon: 'ph ph-text-aa', title: '16px body on web', body: '14px is the floor for secondary text; 12px only for monospace metadata.' },
  { icon: 'ph ph-hand-tap', title: '44px hit targets', body: 'On every surface, including desktop — many members use touchscreens on shared PCs.' },
  { icon: 'ph ph-eye', title: '4.5:1 text contrast', body: 'The green on cream palette is tested; do not tint text below #5C6560 on white.' },
  { icon: 'ph ph-keyboard', title: 'Full keyboard path', body: 'Every console and web flow completable without a mouse; visible 2px focus ring.' },
  { icon: 'ph ph-translate', title: 'Copy expands 40%', body: 'Hausa and Yorùbá run longer than English — no fixed-height buttons or single-line assumptions.' },
  { icon: 'ph ph-printer', title: 'A4 first, Letter safe', body: 'Nigeria prints A4. Card, statement and claim summary must fit both without reflow.' },
] as const

export const RAIL_HEAD = ['ASPECT', 'FEDERAL · IPPIS', 'STATE PAYROLL', 'PRIVATE EMPLOYER', 'SELF-PAY'] as const

export const RAILS: readonly string[][] = [
  ['Who is billed', 'Federal MDA via IPPIS', 'State payroll office', 'Private employer payroll', 'The member directly'],
  ['Collection artefact', 'IPPIS deduction code CSP-114', 'State schedule CSP-LA-07', 'Monthly CSV or payroll API', 'NIBSS e-mandate + card on file'],
  ['Cadence', 'Monthly, OAGF calendar', 'Monthly, often late', 'Monthly, fastest loop', "Monthly on the member's chosen date"],
  ['Console screens shown', 'Schedule · return file · reconciliation', 'Schedule · return file · reconciliation', 'Schedule · invoice · reconciliation', 'Debit runs · mandate health (no schedule)'],
  ['Exception kinds', 'Unmatched · no deduction · wrong amount · left service', 'Same, plus schedule-not-sent', 'Same, resolved in days not weeks', 'No funds · mandate revoked · card expired'],
  ['Who is chased', 'OAGF and the MDA', 'State Accountant-General', "The employer's own finance team", 'The member, by SMS'],
  ['Member-side copy', "'Deducted from your payslip'", "'Deducted from your payslip'", "'Deducted from your payslip'", "'Debited from GTBank ••4471'"],
  ['Tier change path', 'HR approves, next month', 'HR approves, next month', 'HR approves, next month', 'Immediate, from the next debit'],
  ['Grace behaviour', '60 days, member never penalised', '60 days, member never penalised', '60 days, member never penalised', '60 days after two failed retries'],
]

export const OPEN_QUESTIONS = [
  { warn: true, title: 'Sunlight mode is a simulation, not a palette', body: 'It currently filters contrast. It needs its own token set — a real high-contrast ramp — decided after translation review, because longer strings change the layout it has to survive.' },
  { warn: true, title: 'Four member screens are English-only', body: 'Beneficiary re-confirmation, employer onboarding, contribution change and sunlight mode are not yet wired through csp-i18n.js.' },
  { warn: false, title: 'Native-speaker translation review', body: 'Blocking for a pilot. Insurance vocabulary first, then the claim flow, then console exception reasons members see.' },
  { warn: false, title: 'Low-end Android diacritic testing', body: 'Yorùbá and Igbo marks on stock system fonts at small sizes.' },
  { warn: false, title: 'Payroll API vs CSV for private employers', body: 'The console assumes both. Which one ships first decides whether the reconciliation loop is same-day or monthly.' },
] as const
