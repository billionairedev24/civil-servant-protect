# Civil Service Protection Plan · Build spec v1

Cloud and technology decisions. This is the authoritative source for stack
choices; `spec-source.ts` beside it covers screens, API contracts, copy keys and
validation.

> Recorded here because it was not in the handoff bundle. Anything that
> contradicts this file is a bug, including in code already written.

## Cloud and sovereignty

Sovereign cloud in Nigeria under the Cloud-First policy; a cloud-agnostic stack
so the plan is never locked to one provider.

Nigeria's National Digital Cloud Policy (Aug 2026) makes Cloud-First mandatory
for federal MDAs, aggregates public-cloud procurement through Galaxy Backbone
(GBB), and requires sovereign data at Level 3–4 to be hosted in Nigeria. CSPP
holds NINs, payroll rows and military nominal rolls, so assume Level 3–4: run on
GBB's sovereign cloud (or a NITDA-registered Nigerian provider through the GBB
marketplace), keep everything cloud-agnostic (Kubernetes, Postgres,
S3-compatible storage, Terraform), and use foreign hyperscaler regions only for
Level 1 assets or a DR exemption NITDA has actually granted.

### Where each kind of data may live

| Level | What in CSPP | Hosting | Controls |
|---|---|---|---|
| **L4** | Defence nominal rolls (Army, Navy, NAF): rank, unit, posting, service number | Nigeria only · sovereign control · segmented tenancy | Separate DB schema + encryption key per service; access by Defence-cleared roles only; no export |
| **L3** | Member PII: NIN, DOB, phone, payroll ID, beneficiaries, claim evidence, payout accounts | Nigeria only (GBB Abuja + Lagos DR) | NIN stored as HMAC (HSM key) + encrypted column; row-level security by rail; append-only audit |
| **L2** | Aggregates: cycle totals, SLA metrics, exception counts, benefit schedule versions | Nigeria by default; hybrid only with NITDA authorisation | No member identifiers; read replica for reporting |
| **L1** | Public assets: web shell, images, translations, USSD menu text, this spec | Anywhere · CDN edge allowed | Static, signed builds; no cookies |

## Tech stack · Java on the server, React on every screen

| Layer | Choice | Why | Alternative |
|---|---|---|---|
| Member phone | **React Native · TypeScript** | One codebase, Android-first (Hermes, ABI-split APK ≤ 8 MB); SQLite/MMKV for the offline card; react-native-biometrics for fingerprint; shares i18n and API client with the web. | Flutter |
| Member web + NOK portal | **React · Next.js (SSR) · TypeScript** | Server-rendered so it works on slow links and old browsers; A4 print CSS; shares components and API client with the phone app via a common TS package. | React + Vite SPA |
| Plan console | **React · TypeScript · Vite** | Internal SPA behind OIDC; role-gated routes; data grids for loads, exceptions and claims. | Angular |
| USSD twin | **Stateless menu service** | Session-keyed handler behind the telco aggregator; strings from the same i18n table. | — |
| APIs | **Java 25 · Spring Boot 4.1.1 · REST/JSON** | Spring Security for OIDC + role scopes; maker–checker in one aspect layer; springdoc OpenAPI; virtual threads (Loom) for the NIMC/SMS fan-out; the skill set most MDA and OAGF teams already run. | Quarkus |
| Load pipeline | **Spring Batch workers · Kafka between stages** | Chunked, restartable jobs stream 1m-row CSVs; each stage Received → Published is a Kafka topic with retries and dead-letter; workers autoscale on roll week. | Spring Batch + RabbitMQ |
| Database | **PostgreSQL 16 · Patroni HA** | Partitioned by cycle; row-level security by rail; pgAudit; append-only audit table with hash chain. | — |
| Object storage | **S3-compatible (MinIO / Ceph)** | Roll files, PGP signatures, claim evidence; server-side encryption; object lock for audit retention. | Provider object store if S3 API |
| Cache / events | **Redis 7 · Kafka 3** | Redis: OTP challenges, rate limits, console sessions. Kafka: load-stage events, audit stream, SMS/USSD outbox. | Redis Streams instead of Kafka at v1 scale |
| Console identity | **Keycloak (OIDC) · TOTP MFA** | 8 roles as realm roles; SSO-ready for OAGF later; every action carries the user id into audit. | Azure AD B2C only if hosted in-country |
| Member identity | **Custom: NIN+DOB lookup · SMS OTP · device-bound refresh token** | No accounts to create; biometrics stay on device; rate limits at the gateway. | — |
| Integration adapters | **Spring Boot services**: `nimc-adapter` (JAX-WS SOAP over IPsec) · `comms` (SMS/USSD REST) · `payout` (NIBSS REST) · SFTP (Apache MINA) | Each external system isolated in its own service with Resilience4j circuit breaker and a replay log. | Apache Camel routes |
| Platform | **Kubernetes · Terraform · Helm · ArgoCD · GitLab CI** | Runs identically on GBB, any NITDA-registered provider, or a hyperscaler if policy allows; signed images. | OpenShift |
| Security & ops | **Vault + in-country HSM · mTLS · WAF · Prometheus/Grafana/Loki · Sentry** | Keys never leave Nigeria; NDPA DPIA before pilot; annual pen test; 7-year audit retention. | — |

## Topology · two Nigerian sites

```
members ─▶ CDN/WAF (NG) ─▶ ingress ─▶ ┌ member-web (SSR)
rails   ─▶ SFTP (key auth)            │ member-api
NIMC    ◀─ IPsec VPN ── nimc-adapter  │ console-api   ─▶ Postgres HA (Patroni)
SMS/USSD◀─ REST/webhook ─ comms       │ load-workers  ─▶ Redis (queue/cache)
NIBSS   ◀─ REST ────────── payout     └ audit-sink    ─▶ S3-compatible objects
                                                          (roll files, evidence, PGP-verified)

Primary: GBB Abuja  ·  DR: GBB Lagos (async replica, RPO 5 min, RTO 4 h)
Secrets & signing keys: Vault + in-country HSM  ·  KMS never leaves Nigeria
```

## Environments

`dev` (synthetic roll, mock NIMC/SMS) → `UAT` (OAGF-supplied anonymised extract,
NIMC sandbox, one pilot MDA) → `prod` (Abuja) + `DR` (Lagos).

GitLab CI builds signed images; ArgoCD promotes; Terraform + Helm own every
environment. **No human writes to prod Postgres — every change is a migration in
git.**

## Size · v1

≈1.3m members, ≈3m roll rows/month in bursts around the 5th, a few hundred
claims/day. Three-node Kubernetes (8 vCPU / 32 GB each), Postgres HA 3× (16 vCPU
/ 64 GB, 2 TB NVMe, partitioned by cycle), Redis 3×, 5 TB object storage growing
~200 GB/yr. Load workers autoscale 2 → 20 during roll week. Small by cloud
standards; sovereignty and ops discipline are the cost, not compute.

## Access and procurement

**Galaxy Backbone (GBB) — the host.** Federal-government-owned ICT
shared-services company (2006), under the Ministry of Communications, Innovation
& Digital Economy; designated core infrastructure provider for MDAs. Tier-III DC
Abuja, Tier-IV Kano. Product: Galaxy Cloud Platform (GxCP) VMs + HA/DR, moderated
by their technical services team — no self-serve console. Route: sponsoring MDA
(OAGF / Head of Service) requests hosting → GBB scopes capacity and SLA → we
deploy Kubernetes + Postgres via Terraform/Helm onto it.
`galaxybackbone.com.ng` · `services.gov.ng`

**NITDA — the regulator.** National Information Technology Development Agency
(Act 2007): sets IT standards, policy and assurance; under the 2026 Cloud Policy
it rules on data classification, registers cloud providers and decides
exemptions (e.g. a foreign DR region). Our company must hold NITDA
IT-service-provider registration to contract with an MDA: CAC-registered, >51%
Nigerian-owned, `.ng` website, a principal officer registered with CPN;
provisional certificate 6 months, then substantive. Penalty for non-compliance
2% of gross revenue. `nitda.gov.ng` · `iicp.nitda.gov.ng`

**Finding registered providers.** IT service providers: NITDA's National Database
of Indigenous IT Companies (published IICP list). Cloud providers: the policy's
National Digital Marketplace and mandatory CSP register are still being stood up;
until published, the in-country shortlist is GBB, Rack Centre, MainOne, CloudFlex
and Okra — any of which must be procured through GBB's whole-of-government
aggregation for a federal plan.

## Open decisions for the plan owner

1. Formal data-classification ruling from NITDA for the roll and claim data.
2. GBB sovereign cloud vs. a NITDA-registered private provider via the GBB marketplace.
3. Whether Defence rolls need a separately segmented tenancy.
4. DR in a second Nigerian site vs. an exemption for a foreign region.
