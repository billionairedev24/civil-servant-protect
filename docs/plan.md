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
| **Member app** (`/m`, `/`) | See cover and who it pays, read the contribution ledger, open the protection card, edit and confirm beneficiaries, see and change family cover at the server's quoted price, track a claim. |
| **Console sign-in** | Keycloak, OIDC + PKCE, eight realm roles carried into every request. |
| **Console — collection** | Upload a monthly schedule (chunked, restartable, 50,000 rows in ~7s), watch the load, work the reconciliation queue under maker–checker, close a cycle, read the direct-debit run and the remittance history. |
| **Console — people** | Enrol one member or a staff list against NIMC, take somebody off the schedule with their cover intact, search the roster, read claims as an employer may see them. |
| **Console — admin** | Who holds which authority and what it permits, the sponsor's audit trail, five CSV exports. |
| **Platform** | Helm chart renders for dev and prod, ArgoCD applications, Terraform for Postgres, CI green on three jobs. |

**Proof:** 72 API tests, 22 CSV assertions, 122 rail assertions, 48 routes
smoke-tested, 115 route-widths, an accessible-name check. All green.

---

## 2. What is not done

Three kinds, and the difference matters when sequencing.

### 2a. Built on the server, not reachable from any screen

The endpoint exists, is tested, and no UI calls it. Cheapest to close and the
most misleading to leave, because the product looks complete and is not.

1. **A member cannot file a claim.** `POST /v1/claims` exists and is tested.
   The claim wizard on both surfaces is still fixtures, and `openClaim` in the
   API client is called by nothing. For a death-benefit scheme this is the
   single most important missing path.
2. **An assessor cannot assess or pay.** `POST /claims/{ref}/assess` and
   `/pay` exist, with the maker–checker and idempotency rules tested. There is
   no client method and no screen; the console's claim queue is read-only.
3. **Claim documents are recorded but never stored.** The API takes a
   `storageKey` from the caller and writes metadata. Nothing uploads bytes,
   there is no object store, and no presigned-URL flow. A claim cannot carry
   its evidence.

### 2b. In the spec, not built at all

4. **React Native phone app.** The spec asks for RN + Hermes, an ABI-split APK
   ≤8 MB, MMKV for the offline card, `react-native-biometrics`. What exists is
   a mobile-first React web app at `/m` sharing the i18n table, the design
   tokens and the API client — most of the shared code the spec describes, and
   no APK.
5. **Next.js SSR for the member web.** The spec asks for server rendering so it
   works on slow links and old browsers. This is a Vite SPA.
6. **USSD twin.** A stateless menu service reading the same i18n table. Not
   started; the comms adapter mentions USSD only as a channel.
7. **Kafka between the load stages.** Today the batch job runs Received →
   Published in one process. The stage boundaries are in the right places, so
   this is a deployment change rather than a rewrite — but there is no topic,
   no retry policy and no dead-letter queue.
8. **Object storage.** S3/MinIO for roll files, PGP signatures and claim
   evidence, with server-side encryption and object lock for retention. None of
   it exists.
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

---

## 3. The order to do them in

Sequenced by what blocks what, and by what a reviewer would find missing first.

### Now — finish the claim path (2a)

The scheme exists to pay claims and no screen can start one. Three pieces, in
this order, because each is worth having on its own:

1. **Object storage behind claim documents.** A presigned upload to an
   S3-compatible bucket, the key recorded where the metadata already is. Do it
   first: the claim wizard needs somewhere to put a death certificate, and the
   roll-file work later needs the same bucket.
2. **The member's claim wizard**, wired to `POST /v1/claims` and the document
   upload — the four steps that already exist as screens.
3. **The assessor's queue**, wired to assess and pay. The rules are already
   tested server-side; this is a client method and two screens.

*Result: a member can report a death, attach evidence, and an assessor can pay
it — the product's whole reason for existing, demonstrable end to end.*

### Next — the phone app (2b.4)

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

## 4. What needs a decision from somebody else

1. **Actuarial sign-off on the benefit figures** (2c.16), and the two wording
   items (2c.17).
2. **Who hosts, and under what ruling** — GBB vs a NITDA-registered provider,
   and whether Defence rolls need a segmented tenancy (`docs/build-spec.md`,
   "Open decisions").
3. **DR in a second Nigerian site, or an exemption for a foreign region.**
4. **44px hit targets vs the design's density** (2c.18).
