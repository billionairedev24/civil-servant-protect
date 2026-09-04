# Chat

_Started 2026-09-03 14:48 UTC_

---

## User

Continuing from "User and sponsor mockup integration".

## Assistant

We were consolidating Civil Servant Protect v3 into a single unified shell that combines member phone, member web, sponsor console, and implementation spec — all switchable via top-level tabs, with shared rail and language pickers driving consistency across all three surfaces.

We rebuilt the header to fit at 924px: tabs (Phone / Web / Console / Spec) on one line with flex:none and nowrap, wrapping only when truly needed. The rail and language pickers moved into a light control strip below the main header bar, styled to sit cleanly against the light background alongside the surface name and rail reference.

The member web surface now has full feature parity with phone: sign-in + SMS-only sessions, tier picker, dashboard, contributions ledger, printable A4 card, benefit schedules, beneficiaries manager with 100% validator, claim wizard with 10 MB uploads, claim tracking, family cover, profile with sessions list, and next-of-kin portal for non-account holders.

The implementation spec is complete with system shape, 22-row capability matrix (phone/web/console with reasons), API contracts per screen, 34 outstanding copy keys mapped to csp-i18n, validation rules with member-facing messages, state handling (loading/empty/error/offline), four responsive breakpoints, and the sponsor rail-branching table.

Open: 34 translation keys still need copy; sunlight mode needs its own token set (currently contrast simulation); four newest v3 member screens still English-only pending native-speaker review; low-end Android diacritic testing pending.

Files: Civil Servant Protect System.dc.html (master shell), CSP Member Web.dc.html, CSP Sponsor Console.dc.html, CSP Implementation Spec.dc.html, Civil Servant Protect App v3.dc.html, csp-i18n.js.

