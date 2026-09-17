# Where this is, and what is left

Checked against `docs/build-spec.md`, the running code and the test suites on
2026-09-17. Everything below is verifiable from this repository — where a claim
is made about something working, it was exercised against the API, not inferred.

---

## 1. What works end to end

All of it against the real API, with Postgres and Redis behind it. The figures
come from the seeded database, not from fixtures.

| | What a person can actually do |
|---|---|
| **Member sign-in** | Phone number → SMS code → session. Device-bound refresh token, so a reload does not cost another SMS. |
| **Member app** (`/m`, `/`) | See cover and who it pays, read the contribution ledger, open the protection card, edit and confirm beneficiaries, see and change family cover at the server's quoted price, **file a claim with its papers**, and track it. |
| **Console sign-in** | Keycloak, OIDC + PKCE, eight realm roles carried into every request. |
| **Console — collection** | Upload a monthly schedule (chunked, restartable, 50,000 rows in ~7s), watch the load, work the reconciliation queue under maker–checker, close a cycle, read the direct-debit run and the remittance history. |
| **Console — people** | Enrol one member or a staff list against NIMC, take somebody off the schedule with their cover intact, search the roster, read claims as an employer may see them. |
| **Console — claims** | An assessor works the queue: read each claim's trail, open the evidence itself, approve, decline or ask for more — and operations pays it, which the assessor who approved it cannot. |
| **Console — admin** | Who holds which authority and what it permits, the sponsor's audit trail, five CSV exports. |
| **Platform** | Helm chart renders for dev and prod, ArgoCD applications, Terraform for Postgres, CI green on three jobs. |

**Proof:** 86 API tests, 22 CSV assertions, 122 rail assertions, 49 routes
smoke-tested, 120 route-widths, an accessible-name check, and an Android APK
that builds in CI. All green.

---

## 2. What is not done

Three kinds, and the difference matters when sequencing.

### 2a. Built on the server, not reachable from any screen

The endpoint exists, is tested, and no UI calls it. Cheapest to close and the
most misleading to leave, because the product looks complete and is not.

1. ~~**A member cannot file a claim.**~~ **Done.** Both surfaces open the
   claim, take the server's list of required papers, and upload each one to
   object storage. Two things the browser walk-through turned up: the done
   screen printed the mockup's claim reference above the member's real one, in
   all five languages, and the funeral advance asked for the same certificate a
   second time.
2. ~~**An assessor cannot assess or pay.**~~ **Done.** The console has an
   *Assess claims* screen — the queue, each claim's trail, its evidence opened
   under the assessor's own token, approve/decline/ask-for-more, and the
   payment, which only an account holding `CLAIM_PAY` is shown. Driving it
   found that **the queue returned an empty list to every assessor**: it joins
   `members` for the name, and that policy had no assessor clause, so every
   claim in the scheme fell out of the join. A 200, an empty queue, nothing in
   any log. Fixed in `V12`.
3. ~~**Claim documents are recorded but never stored.**~~ **Done.** The API
   issues the storage key itself, hands back an upload URL — presigned PUT at an
   S3-compatible bucket, or its own endpoint in development — and confirms
   against the store rather than the client's word. Walking it over HTTP found
   that **a member could not open a claim at all**: the sponsor's projection is
   written by a trigger whose only policy is keyed on a sponsor, so under a
   member's scope every claim rolled back. Every existing claim test ran as the
   system scope, where that is invisible. Fixed in `V11`, with the test now
   opening claims as the member does.

### 2b. In the spec, not built at all

4. **React Native phone app — started.** `mobile/` is a real RN 0.87 app for
   **Android and iOS**: Hermes, R8, ABI-split APKs, an Xcode project with the
   permissions its native modules require, MMKV for the session and the offline
   card, biometrics on the front door — a fingerprint or Face ID, whichever the
   device has — and the camera for claim documents.
   Metro compiles `../src` rather than a copy, so the phone runs the same API
   client, i18n table, design tokens and claim wizard as the web. Six screens —
   sign in, home, the protection card, cover, the claim wizard, tracking.

   What is not done: no navigation library, the card's QR is not drawn, adding
   a beneficiary or dependant is web-only, **the APK is over the spec's size
   budget** (see 2c.21), and **nobody has run it on a handset on either
   platform**. It typechecks and Metro bundles both platforms here; CI is where
   an APK first exists and where the iOS target is first compiled, because this
   machine has neither an Android SDK nor Xcode. iOS builds the simulator
   target only — a signed archive needs a team and a provisioning profile,
   which are somebody else's to decide.
5. **Next.js SSR for the member web.** The spec asks for server rendering so it
   works on slow links and old browsers. This is a Vite SPA.
6. **USSD twin.** A stateless menu service reading the same i18n table. Not
   started; the comms adapter mentions USSD only as a channel.
7. **Kafka between the load stages.** Today the batch job runs Received →
   Published in one process. The stage boundaries are in the right places, so
   this is a deployment change rather than a rewrite — but there is no topic,
   no retry policy and no dead-letter queue.
8. **Object storage, for everything else.** Claim evidence is done (see 2a.3) —
   MinIO in compose, presigned PUT, SSE-S3. Roll files and their PGP signatures
   still live on disk, and object lock is configured on the bucket rather than
   asserted by the application.
9. **The integration adapters over the wire.** NIMC (JAX-WS SOAP over IPsec),
   comms (SMS/USSD REST), payout (NIBSS REST), the SFTP poller (Apache MINA).
   Each has an interface, a circuit breaker with settings chosen for that
   system, a replay log and a stub that answers locally. `INTEGRATIONS_MODE=http`
   selects implementations that construct and then refuse with a named reason,
   rather than guessing at a protocol nobody has handed us.
10. **Postgres HA and DR.** Patroni, the async Lagos replica, RPO 5 min / RTO
    4 h. The Terraform module provisions one database.
11. **pgAudit, Vault, mTLS, WAF, Loki, Sentry.** A ServiceMonitor exists and
    Prometheus scrapes it. The rest are named in the spec and absent here.
12. **The HSM, in practice.** `Pkcs11KeyVault` is written and `HSM_ENABLED=true`
    selects it; the ES256 path is tested against a software EC key. No hardware
    has ever seen it.
13. **UAT and prod environments.** Dev values and prod values render; nothing is
    deployed to GBB, and no NITDA ruling has been sought.

### 2b-bis. Removed, and the gap that leaves

22. **A next-of-kin has no way to start a claim.** The member app and the web
    app both carried a "claim for someone who has died — no account needed"
    door. Nothing served it: `POST /v1/claims` needs a member session, and the
    member is the person who died. The screens are gone rather than left
    promising it, and the real gap is now visible: today a family rings the
    claims office, or the sponsor raises it. `next_of_kin` exists as a role in
    the schema, so the shape of the answer is there — what is missing is an
    endpoint that authenticates a relative against a CSP-ID and a phone number,
    and a decision about what that is allowed to see.

### 2c. Quality, content and compliance

14. **Translations are machine-drafted** and need a native-speaker pass.
    Insurance vocabulary is where they fail hardest: *beneficiary*, *sum
    assured*, *grace period*, *mandate*.
15. **The newest screens are English-only** — enrolment, leaving the schedule,
    the debit run, remittances, settings and reports were all written here and
    have had no translation pass at all.
16. **Benefit figures are illustrative**, pending actuarial, legal and
    underwriting sign-off. The API is now the single source of them.
17. **Two wording items** from that decision: `hospital_cash` reads "Accident
    medical bills" in English while the other four languages say "accident
    hospital money"; and "Children's education" is now an unused string,
    because the API does not sell it.
18. **Hit targets are 26–38px** against the spec's 44. Everything clears the
    24px WCAG 2.2 floor. Going to 44 changes the density the design was tuned
    for, so it is a design call rather than a defect.
19. **Sunlight mode is a filter, not a palette**, and Yorùbá and Igbo diacritics
    are untested on low-end Android at small sizes.
20. **NDPA DPIA, the NITDA data-classification ruling and a pen test** are all
    outstanding, and all three gate a pilot rather than a demo.
21. **The APK is 12.2 MB against the spec's 8 MB**, measured rather than
    estimated — that is the armeabi-v7a build, which is what a low-end handset
    installs; arm64 is 16.5 MB. Dropping the universal APK took 55.1 MB off
    what gets published, which was worth doing on its own. Code and resource
    shrinking together took **0.1 MB**: 12.3 → 12.2. That number is the
    argument — the rest is Hermes and the React Native runtime compiled per
    architecture, and no configuration switch removes it. Three real options, in order of
    what they cost:

    - **An app bundle instead of APKs.** Play generates a per-device download,
      which typically lands a third smaller again — but it means distributing
      through Play, and a pilot that sideloads cannot use it.
    - **Accept 12 MB and say so.** It is one download on a scheme somebody
      keeps for decades, and it is the honest figure for React Native with the
      new architecture.
    - **Change the target.** The 8 MB in the spec was written before an
      implementation existed; whether it was a measured requirement or a wish
      is a question for whoever wrote it.

    This is a decision rather than a defect, which is why it is here and in §5
    rather than being worked at until the number moves.

---

## 3. The order to do them in

Sequenced by what blocks what, and by what a reviewer would find missing first.

### Done — the claim path (2a)

The scheme exists to pay claims and no screen could start one. Three pieces, in
this order, because each was worth having on its own:

1. **Object storage behind claim documents.** A presigned upload to an
   S3-compatible bucket, the key recorded where the metadata already is. Do it
   first: the claim wizard needs somewhere to put a death certificate, and the
   roll-file work later needs the same bucket.
2. **The member's claim wizard**, wired to `POST /v1/claims` and the document
   upload — the four steps that already exist as screens.
3. **The assessor's queue**, wired to assess and pay. The rules are already
   tested server-side; this is a client method and two screens.

*Result, now true: a member reports a death, attaches four papers, an assessor
reads the certificate and approves, and operations pays — walked end to end
against a running API, in a browser and over HTTP.*

### Now — finish the phone app (2b.4)

Only after the claim path, because building it first would mean building the
claim screens twice. By then the API client, the i18n table and the design
tokens are settled, which is what makes an RN shell a few days rather than a
rewrite. Android-first, Hermes, MMKV for the offline card, biometrics on the
device.

### Then — the things a pilot cannot start without

- **The four adapters over the wire** (2b.9), in the order somebody can give us
  credentials for. NIMC first: enrolment is blocked on it in a way the others
  are not.
- **HA, DR and pgAudit** (2b.10, 11) — an MDA's security review asks for these
  before it asks about features.
- **DPIA, NITDA classification, pen test** (2c.20). Long lead times; start the
  paperwork in parallel with the adapters rather than after them.

### Then — scale and reach

- **Kafka between the stages** (2b.7) when a second sponsor's roll week overlaps
  the first. One process handles 50,000 rows in seconds; it is 3m rows/month in
  bursts that needs topics and autoscaling workers.
- **The USSD twin** (2b.6), which reaches the members who will never open an
  app and is therefore worth more than it looks.
- **Next.js SSR** (2b.5) — the SPA works; SSR is a page-weight and old-browser
  improvement, not a missing capability.

### Alongside, not after — translation

A native-speaker pass over the whole table (2c.14, 15), booked as soon as the
newest screens stop changing. Everything else on this list can proceed while it
happens, and a pilot cannot start without it.

---

## 4. When each surface is finished

### What "finished" means, per surface

Not "the screens exist" — they all exist today. Finished means every screen
reads and writes the real API, with nothing hard-coded behind it, verified
against a running backend rather than asserted.

| Surface | Finished when | Where it is now |
|---|---|---|
| **Console** | Every screen live, including an assessor who can assess and pay | **Done** — verified against a running API |
| **Member web** | Every screen live, including filing a claim with evidence | **Done** — verified in a browser against a running API |
| **Member mobile** | An installable Android and iOS build doing the member journey offline-capable, with biometrics | Built and bundling on both; an APK exists only in CI, iOS compiles for the simulator, and no handset has run either |
| **USSD** | The same journeys reachable with no smartphone | Not started |

### The estimate

A **build day** below means a day of focused work of the kind that produced
enrolment, leavers, the debit run, remittances, family cover, settings, reports,
the layout fix and the seed rework — that was one session. Estimates are for the
work itself; anything waiting on a third party is marked and is not mine to
promise.

| # | Work | Build days | Blocked on |
|---|---|---|---|
| ~~**1**~~ | ~~**Object storage** for claim evidence~~ — **done**: MinIO in compose, presigned PUT, SSE-S3, server-chosen keys, confirmation checked against the store | 0.5 | — |
| ~~**2**~~ | ~~**Member claim wizard** wired, both surfaces~~ — **done** | 0.5 | 1 |
| ~~**3**~~ | ~~**Assessor queue** wired — assess, pay~~ — **done** | 0.5 | — |
| | **→ Console and member web are finished: a member can report a death, attach a certificate, and be paid** | **done** | |
| **4** | ~~**React Native app**: shell, the member journey in RN primitives, MMKV offline card, biometrics, Hermes, ABI-split release config, CI that builds the APK~~ — **done bar a device** | 5 | Somebody with an Android handset |
| **5** | Remaining `/m` screens ported to reach parity | 3 | 4 |
| | **→ Mobile is finished here** | **8** | |
| **6** | The four adapters over the wire — NIMC SOAP/IPsec, comms REST, NIBSS REST, SFTP poller | 3 | **Credentials, endpoints and sandbox access** for each |
| **7** | Postgres HA + DR replica, pgAudit, Vault, mTLS, Loki, Sentry | 3 | Hosting decision |
| **8** | Kafka between the load stages, workers autoscaling | 2 | — |
| **9** | USSD twin | 2 | Aggregator access |
| **10** | Next.js SSR for the member web | 3 | — |

**Two things I cannot do from here.** This container has Gradle but no Android
SDK, so the APK in item 4 is built in CI and installed by somebody with a
handset — I can write it and prove it compiles, not that it runs on a Tecno.
And every item marked *blocked on* waits on somebody outside this repository:
NIMC will not issue a WSDL to a developer, and no amount of build days
substitutes for that.

### So, in order

- **Console and member web: finished.** A member reports a death, attaches four
  papers, an assessor reads the certificate and approves, operations pays, and
  the claim leaves the queue — walked end to end against the API rather than
  asserted.
- **Mobile: about eight build days after that**, of which five get to an
  installable app doing the core journey and three reach parity with every
  screen `/m` has.
- **Everything a pilot needs: three to eight more build days of code**, but the
  calendar is set by credentials, the NITDA ruling and a translation pass —
  none of which are code, and all of which should be started now rather than
  when the code is ready.

## 5. What needs a decision from somebody else

1. **Actuarial sign-off on the benefit figures** (2c.16), and the two wording
   items (2c.17).
2. **Who hosts, and under what ruling** — GBB vs a NITDA-registered provider,
   and whether Defence rolls need a segmented tenancy (`docs/build-spec.md`,
   "Open decisions").
3. **DR in a second Nigerian site, or an exemption for a foreign region.**
4. **44px hit targets vs the design's density** (2c.18).
5. **The 8 MB APK budget** (2c.21). The build is 12.2 MB for the architecture
   most low-end handsets use, and no configuration closes that gap — the
   options are an app bundle, accepting the figure, or changing the target.
