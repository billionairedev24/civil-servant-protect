# Setup

Everything needed to run Civil Servant Protect locally and test it.

If you only want to *see* the product, skip to [DEMO.md](./DEMO.md) — the three
frontends run against fixtures with no backend at all. This file is for working
on it.

---

## What you need

| | Version | Why that one |
|---|---|---|
| **JDK** | 25 | Build spec. `--release 25` is set in the pom, so 21 will not compile it. |
| **Maven** | 3.9+ | |
| **Node** | 22+ | The frontends. |
| **Docker + Compose** | any current | Postgres, Redis and Keycloak. Nothing else needs it. |

```bash
java -version    # must say 25
mvn -v
node -v
docker compose version
```

**No JDK 25?** Temurin publishes builds at
[adoptium.net](https://adoptium.net/temurin/releases/?version=25), or
`sdk install java 25-tem` with SDKMAN.

---

## 1. Bring up the backing services

```bash
docker compose up -d
```

That is Postgres 16, Redis 7, and Keycloak with the CSP realm imported. Wait for
all three to report healthy:

```bash
docker compose ps
```

| | Port | Notes |
|---|---|---|
| Postgres | 5432 | user `csp`, password `csp`, databases `csp` and `csp_test` |
| Redis | 6379 | no persistence — OTP challenges are worthless after five minutes |
| Keycloak | 8081 | admin `admin` / `admin` at http://localhost:8081 |

## 2. Run the API

```bash
cd api

JWT_SECRET=local-development-secret-at-least-32-chars \
OTP_ECHO=true \
OTP_FIXED_CODE=000000 \
mvn spring-boot:run -Dspring-boot.run.profiles=seed
```

Flyway migrates on start. The `seed` profile then writes the demo data — the
same figures the UI fixtures use, so the apps look identical whether they are
reading fixtures or the API.

Check it:

```bash
curl -s localhost:8080/actuator/health
# {"groups":["liveness","readiness"],"status":"UP"}
```

**Drop `seed` after the first run** unless you want the database rewritten. It
truncates and re-inserts every time.

API docs are at http://localhost:8080/swagger-ui.html.

## 3. Run the frontends

```bash
npm install
npm run dev                                   # fixtures, no backend needed
VITE_API_URL=http://localhost:8080 npm run dev  # live, against the API

# The console additionally needs Keycloak, or its sign-in button has nothing
# to go to:
VITE_API_URL=http://localhost:8080 \
VITE_OIDC_ISSUER=http://localhost:8081/realms/csp \
npm run dev
```

`VITE_API_URL` is the only switch for the member apps. Unset, the screens read `src/data` exactly as
they always have — which is how the design gets reviewed and how the
rail-branching tests run, neither of which should need Postgres. Set, the same
screens read the API.

Data access is **TanStack Query** (`src/api/`):

| | |
|---|---|
| `types.ts` | the wire types, hand-written against the spec's contracts |
| `client.ts` | `fetch` only, no React — so the React Native build can share it |
| `queries.ts` | one hook per resource, with the query keys in one place |
| `fixtures.ts` | the existing fixtures re-expressed in the API's shape |
| `auth.tsx` | sign-in state, and `can('EXCEPTION_RESOLVE')` for what a role may do |
| `oidc.ts` | the console's Keycloak flow — authorization code with PKCE |

Sign-in differs by surface, on purpose:

| | Member app (`/m`, `/`) | Console (`/console`) |
|---|---|---|
| Door | phone number + SMS code | Keycloak, with TOTP |
| Access token | in memory | in memory |
| Refresh token | `sessionStorage`, device-bound | none — not kept |
| Survives a reload | yes, via `/v1/auth/refresh` | no, by design |

The console's session dying with the tab is the point: it runs on shared
secretariat machines, and one officer's token must not outlive them at the desk.
The member's does not, because a device-bound refresh token is what the spec
gives them so that scrolling their contributions does not cost another SMS.

Fixtures are passed as `placeholderData`, not `initialData`: they render
instantly and the query still runs, so the cache never treats hard-coded data as
fresh. A member opening the app to check whether their deduction arrived sees
last month's figures at once, and the live values replace them a moment later.

Retries are deliberate. Transport failures retry twice with backoff; a 401, 403,
404 or 409 never does — a refusal from the maker–checker rule is a decision, not
a blip, and retrying it three times only makes the officer wait. Mutations never
retry at all, because retrying "close the cycle" is retrying a decision someone
is accountable for.

## 4. Sign in

**As a member** — phone number and a one-time code. With `OTP_FIXED_CODE` set,
the code is always `000000`:

```bash
CID=$(curl -s -XPOST localhost:8080/v1/auth/otp \
  -H 'Content-Type: application/json' \
  -d '{"msisdn":"+2348030000214"}' | jq -r .challengeId)

curl -s -XPOST localhost:8080/v1/auth/verify \
  -H 'Content-Type: application/json' \
  -d "{\"challengeId\":\"$CID\",\"code\":\"000000\"}" | jq
```

| Rail | Number | Member |
|---|---|---|
| Federal (IPPIS) | `+2348030000214` | Adaeze Okafor |
| State | `+2348030000215` | Folake Adeyemi |
| Employer | `+2348030000216` | Musa Ibrahim |
| Self-pay | `+2348030000217` | Chidi Eze |

**As a console user** — Keycloak, not SMS. The SMS path refuses console roles on
purpose; a finance officer has an MDA account with TOTP, a civil servant has a
phone number. Asking for a code on a console user's number still returns a
challenge — the endpoint will not tell a stranger who is enrolled — but the
verify step refuses it. All six have password `password`:

| Username | Role | Can |
|---|---|---|
| `amina` | Preparer | upload a schedule, propose how an exception is resolved |
| `musa` | Approver | commit what a preparer proposed, close a cycle |
| `ngozi` | Viewer | read the month, change nothing |
| `ibrahim` | Admin | manage the roster and roles — **not** approve money |
| `assessor` | Claims assessor | read and assess any claim, across every rail |
| `ops` | CSP operations | administer the scheme itself; not scoped to one MDA |

The realm pins each account's user id, and the API seed stores the same value as
`users.oidc_subject`. That join is what makes a Keycloak sign-in land on the
seeded officer — and their sponsor scope — instead of quietly creating a second
account with the same name on first use. Change one side and you must change the
other; both are commented where they sit.

To get a console token without the browser:

```bash
curl -s -XPOST 'http://localhost:8081/realms/csp/protocol/openid-connect/token' \
  -d 'client_id=csp-console' -d 'grant_type=password' \
  -d 'username=musa' -d 'password=password' | jq -r .access_token
```

### The replay log

Every call to an external system is written to `integration_calls` **before**
it is attempted and completed afterwards. If the process dies mid-call the row
survives as `attempting`, which is the honest state: we asked, and we do not
know what happened.

That is the state nobody wants and everybody needs. NIBSS may or may not have
moved the money; the SMS gateway may or may not have sent the code. A log line
written only on success answers neither question.

```bash
# What is stuck, for somebody to work through. Operations only.
curl -s localhost:8080/v1/operations/integration-calls/stuck \
  -H "Authorization: Bearer $OPS_TOKEN" | jq
```

There is no replay button. Replaying a payout is a decision with a bank
statement behind it, and the claim reference is the idempotency key, so calling
the operation again is refused rather than duplicated.

L3 data never reaches this table: a phone number is stored as `+234803••••214`,
an account as `••••6789`, and a NIN or a one-time code as `«withheld»`. It is
the table somebody exports to a spreadsheet at 2am, which is exactly why.

### Paying a claim

The money path is two decisions by two people, like everything else here:

| | Who | Permission |
|---|---|---|
| Assess the claim | Claims assessor | `CLAIM_ASSESS` |
| Send the money | CSP operations | `CLAIM_PAY` |

Neither role holds the other's permission, and the database says the same thing
again with `payer_is_not_assessor` — so an account that could approve a payout
and then make it does not exist, whatever the service layer is asked to do.

```bash
# The assessor decides.
curl -s -XPOST localhost:8080/v1/claims/CLM-2026-0091/assess \
  -H "Authorization: Bearer $ASSESSOR" -H 'Content-Type: application/json' \
  -d '{"decision":"approve","note":"documents complete","amountMinor":500000000}'

# Operations sends it. NIBSS is asked whose account this is first, and the name
# it returns is what gets stored — that is what catches a transposed digit.
curl -s -XPOST localhost:8080/v1/claims/CLM-2026-0091/pay \
  -H "Authorization: Bearer $OPS" -H 'Content-Type: application/json' \
  -d '{"bankCode":"058","accountNumber":"0123456789"}'
```

### What a sponsor may know

Row-level security answers "may you see this row", which is the right question
almost everywhere here and the wrong one twice. A sponsor may not see who a
member has nominated, but must know *whether* they have nominated anybody —
chasing the ones who have not is their job. A sponsor may not read a claim, but
must know one exists on their member, because the insurer asks them one question
about it.

Both facts come from **projections** rather than from filtered queries:
`members.has_payee_beneficiary` and the `sponsor_claim_view` table, maintained by
trigger from rows the sponsor cannot read. A projection cannot accidentally grow
a sensitive column the way a query against the real table can, and its policy is
an ordinary one.

A migration that reads existing rows must set `csp.unscoped` first — Flyway runs
through the application's DataSource, which applies a scope at connection
checkout, and with none set that scope is "nobody". A subquery under RLS does not
fail; it returns nothing.

### Loading a schedule

```bash
# 202, with a batch to watch. The rows are written down before this returns;
# the load runs behind it.
curl -s -XPOST localhost:8080/v1/sponsors/$SPONSOR/schedules \
  -H "Authorization: Bearer $PREPARER" -H 'Content-Type: application/json' \
  -d @schedule.json
# {"cycleId":"…","batchId":"…","rowCount":50000}

curl -s localhost:8080/v1/sponsors/$SPONSOR/schedules/$BATCH \
  -H "Authorization: Bearer $PREPARER"
# {"state":"complete","stagedCount":50000,"matchedCount":40000,"loadedCount":40000}
```

A row that matches no member is **rejected with its line number and a reason**,
not dropped — "line 4,412: no member with service number 8812441" is what an
officer needs to fix the file. The first 500 rejections are kept on the batch;
the full list stays in `schedule_rows`.

`csp.schedule.chunk-size` (default 10,000) is the rows per transaction. The
tests set it to 2, because every bug this job has had was at a chunk boundary
and none of them is visible on a file that fits in one chunk.

---

## Testing

```bash
# API — needs Postgres and Redis up
cd api && mvn verify

# Frontends
npm test            # smoke, rail branching, accessibility
npm run test:rails  # the four collection rails
npm run a11y

# Helm chart, without installing Helm
python3 deploy/helm/check-templates.py
```

The API tests use `csp_test`, which compose creates alongside `csp`. They wipe
their schema on every run, so they will not touch the database you are
developing against.

**Why the tests need a real database.** Every rule worth testing here lives in
Postgres: the ledger's append-only triggers, row-level security by rail, the
deferred share-sum constraint, the audit hash chain. H2 would test none of it and
would pass.

---

## Configuration

Read once at startup and validated there, so a missing value stops the process
with a readable message instead of surfacing as a confusing 500 on the first
request that needs it.

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `jdbc:postgresql://127.0.0.1:5432/csp` | |
| `DATABASE_USER` / `DATABASE_PASSWORD` | `csp` / `csp` | From Vault in every deployed environment |
| `SPRING_DATA_REDIS_HOST` / `_PORT` | `127.0.0.1` / `6379` | OTP challenges, rate limits |
| `HSM_ENABLED` / `HSM_CONFIG` / `HSM_PIN` | `false` | The in-country HSM. Off locally; the `prod` profile refuses to start without it. |
| `INTEGRATIONS_MODE` | `stub` | `stub` or `http`. Also refused under `prod`. |
| `JWT_SECRET` | **none** | ≥32 chars. No default on purpose — a fallback secret is a production incident waiting for the one deploy that forgets it |
| `CSP_TOKEN_ISSUER` | `https://member-auth.csp.local` | Must be a URL; Spring converts the `iss` claim to one while decoding |
| `CSP_KEYCLOAK_ISSUER_URI` | *(empty)* | Empty means console sign-in is off and only member tokens are accepted |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL` | `20m` / `8h` | |
| `CORS_ORIGINS` | `http://localhost:[*],http://127.0.0.1:[*]` | Comma-separated origin *patterns*. The default is loopback on any port, so `npm run dev` (5173), `npm run preview` (4173) and the browser tests all work. Deployment sets the real hostnames. |
| `OTP_ECHO` | `false` | Returns the code in the response |
| `OTP_FIXED_CODE` | *(unset)* | Pins the code |
| `LOG_LEVEL` | `info` | |

⚠️ **`OTP_ECHO` and `OTP_FIXED_CODE` are refused under the `prod` profile** — the
context will not start. They hand every account to anyone who knows a phone
number, and a warning in a log nobody reads is how that ends up live.

---

## Architecture

```
api/                    Java 25 · Spring Boot 4.1.1 · JdbcClient · Flyway
  src/main/java/ng/csp/api/
    auth/               roles, permissions, tokens, the maker-checker aspect
    member/             member-side services and endpoints
    sponsor/            the console: schedules, reconciliation, cycles
    claim/              claims and the assessor's queue
    domain/             rails, pricing, NIN protection, the offline card
    config/             configuration, security, the RLS scope plumbing
  src/main/resources/db/migration/   V1–V5

src/                    React · TypeScript · Vite — the three frontends
deploy/
  helm/csp/             the chart; workloads only, never a database
  argocd/               app-of-apps, one Application per environment
  environments/         per-environment values; CI writes image digests here
  local/                the Keycloak realm and the test-database init
infra/terraform/        cluster-adjacent: Postgres HA, object storage, Vault
docs/
  build-spec.md         cloud, sovereignty, data classification, stack
  spec-source.ts        screens, API contracts, copy keys, validation
```

### Things that will surprise you

**Spring Boot 4 split autoconfiguration into per-technology modules.**
`flyway-core` on the classpath does nothing without `spring-boot-flyway`; the app
starts against an empty schema and fails on the first query. Same shape for JDBC
and Redis. Also: Jackson 3, so the package is `tools.jackson.*`, and
`spring-boot-starter-aop` no longer exists.

**Row-level security needs the application to say who it is.** The connection
pool is wrapped so every checkout sets `csp.member_id` / `csp.sponsor_id`, and
the default scope sees *nothing* — a bug that loses the scope returns no rows
rather than everyone's. Background work calls `RlsScope.runUnscoped`. The
sign-in endpoints run unscoped because the row that says which member you are is
the row being looked up.

**Flyway's schema is pinned to `public`.** Postgres resolves an unqualified
schema through `search_path`, which is `"$user", public`. The application user is
`csp` and so is the schema the migrations create for helper functions — left to
default, Flyway adopts it on the second run, finds it non-empty with no history
table, and refuses to start.

**Money never touches a float.** Minor units (kobo) as `bigint`, end to end.
₦2,500 is `250000`. Formatting is the client's job, because only the client knows
the member's language.

**The ledger cannot be edited.** `UPDATE` and `DELETE` on `contributions`,
`claim_stages` and `audit_log` are rejected by a trigger. A correction is a new
row with a reversal reference. If you are reaching for an `UPDATE`, the model is
wrong, not the trigger.

---

## Deployment

Nothing here deploys from a laptop, and CI never touches a cluster. GitLab CI
builds and signs images and writes the **digest** into an environment's values
file; ArgoCD notices the commit and rolls it out. Promotion is a reviewed commit,
which is also why images are pinned by digest rather than tag — a tag can be
moved after review.

| | Sync | Trigger |
|---|---|---|
| dev | automatic, self-healing | every commit to `main` |
| uat | automatic | a commit to the uat values file |
| **prod** | **manual** | a human, after UAT sign-off |
| dr | automatic, follows prod | Lagos, one revision behind by design |

Prod is not auto-synced on purpose. A federal payroll deduction is not something
to roll out because a pipeline went green on a Friday.

```bash
# What Argo will apply, before it applies it
helm template csp deploy/helm/csp \
  --values deploy/helm/csp/values.yaml \
  --values deploy/environments/prod.values.yaml
```

Migrations run as a Helm `pre-upgrade` hook from the **same image** as the API,
so the migrations that run are exactly the ones the new code expects, and a
failure stops the rollout instead of half-applying it.

### Sovereignty

L3 and L4 data stays in Nigeria — see [docs/build-spec.md](./docs/build-spec.md).
That is a deployment constraint, so the code carries it as configuration rather
than assumption:

- **NIN is never stored in the clear.** HMAC for matching, AES-GCM for the rare
  re-transmit to NIMC. One class (`domain/Nin.java`) holds both, and nothing else
  in the codebase touches a NIN — so moving the keys into the HSM is that one
  file. **The keys are currently derived from configuration**, which is fine for
  local work and CI and is not fine for a pilot.
- **Terraform state lives in-country.** It names every host in the estate.
- **The chart never creates a database.** Terraform owns Postgres; the chart owns
  workloads. A chart that can create a database will eventually delete one.

---

## Known gaps

Real, and deliberately not papered over.

1. **The phone app is React Native in the spec and a web app here.** `/m` is
   mobile-first React that shares the i18n table and design tokens, which is most
   of the shared code the spec describes, but it is not an APK and there is no
   Hermes build, no MMKV offline card, no `react-native-biometrics`.
2. **The member web app is Vite, not Next.js.** The spec asks for SSR so it works
   on slow links and old browsers. This is a client-rendered SPA.
3. **Some screens still read fixtures.** Sign-in, and the money and people
   screens on all three surfaces, read the API when `VITE_API_URL` is set —
   contributions, the protection card, beneficiaries and their annual
   confirmation, claim tracking, and the console's dashboard, reconciliation
   queue with its maker–checker pair, member roster, claims and schedule
   upload.

   Still on fixtures: the console's direct-debit run, remittances, reports and
   settings; the member's family cover and cover-detail screens; and the whole
   enrolment run, which has no endpoints behind it yet.

   A screen that has not been wired says the same numbers it always did — the
   fixtures and the seed agree — so the difference is where the figure comes
   from, not what it says.

4. **Spring Batch, but no Kafka.** Schedule upload stages the rows and hands
   off to a chunked, restartable job; the endpoint answers **202** with a batch
   reference and the console polls
   `GET /v1/sponsors/{id}/schedules/{batchId}`. Measured here: 50,000 rows
   staged and acknowledged in **2.2 seconds**, matched and loaded in **4.8**.

   What is missing is Kafka between the stages, which is what would let matching
   and loading scale independently across workers. The stage boundaries are in
   the same places, so moving them onto a topic is a deployment change rather
   than a rewrite — but it is one process today.
5. **The integration adapters are stubbed, not absent.** `nimc`, `comms`,
   `payout` and the SFTP poller each have an interface, a circuit breaker with
   settings chosen for that system, and a stub that answers locally. Sign-in
   really calls the comms adapter and an approved claim really calls the payout
   one; what is missing is an implementation that speaks to NIMC's SOAP
   endpoint, an SMS aggregator's REST API, NIBSS, and a payroll SFTP host.
   `INTEGRATIONS_MODE=http` selects those, and the `prod` profile refuses to
   start without it.

   The stubs are not test mocks: they go through the same replay log and the
   same breakers, so the recorded behaviour is the real behaviour. They also
   refuse where the real systems refuse — an 11-digit check on a NIN, a
   ten-digit one on a NUBAN — so the failure branches are reachable in a demo.

   They also *deliberately do not deliver*. `csp.integrations.mode=stub` is
   logged as a warning at startup, because a scheme that silently stops telling
   its members anything is worse than one that is plainly down.
6. **Keys are derived from configuration unless an HSM is configured.**
   `KeyVault` exposes operations and never key bytes, which is the shape that
   lets a PKCS#11 implementation exist at all — an interface with
   `byte[] key()` on it can only be implemented by extracting the key, which is
   the one thing an HSM is for not doing. `Pkcs11KeyVault` is written;
   `HSM_ENABLED=true` with a config file and PIN selects it, and the `prod`
   profile refuses to start without it.

   One finding worth stating plainly: **HS256 member tokens cannot be signed
   inside an HSM.** The signer needs the key bytes, so hardware custody and
   symmetric signing are incompatible here. Moving member tokens to ES256 is
   the fix and has not been done — it is a token-format change with a rollover,
   not a config flag.
7. **Translations are machine-drafted** and have had no native-speaker pass. Ten
   of them were drafted in this session rather than carried from the design
   bundle — see the README.
8. **Benefit figures are illustrative**, pending actuarial, legal and
   underwriting sign-off.
