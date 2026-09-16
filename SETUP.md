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
```

`VITE_API_URL` is the only switch. Unset, the screens read `src/data` exactly as
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
phone number. All four have password `password`:

| Username | Role | Can |
|---|---|---|
| `amina` | Preparer | upload a schedule, propose how an exception is resolved |
| `musa` | Approver | commit what a preparer proposed, close a cycle |
| `ngozi` | Viewer | read the month, change nothing |
| `ibrahim` | Admin | manage the roster and roles — **not** approve money |
| `assessor` | Claims assessor | read and assess any claim |

To get a console token without the browser:

```bash
curl -s -XPOST 'http://localhost:8081/realms/csp/protocol/openid-connect/token' \
  -d 'client_id=csp-console' -d 'grant_type=password' \
  -d 'username=musa' -d 'password=password' | jq -r .access_token
```

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
| `JWT_SECRET` | **none** | ≥32 chars. No default on purpose — a fallback secret is a production incident waiting for the one deploy that forgets it |
| `CSP_TOKEN_ISSUER` | `https://member-auth.csp.local` | Must be a URL; Spring converts the `iss` claim to one while decoding |
| `CSP_KEYCLOAK_ISSUER_URI` | *(empty)* | Empty means console sign-in is off and only member tokens are accepted |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL` | `20m` / `8h` | |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated |
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
3. **The frontends still read fixtures, not the API.** Both exist and agree on
   the same figures; nothing wires them together yet. That is loading states,
   error states and the auth flow — real work, not configuration.
4. **No Spring Batch or Kafka.** Schedule upload is synchronous and capped at
   20,000 rows. The spec's 1m-row path needs chunked restartable jobs with Kafka
   between stages; `uploadSchedule` is the seam that job would call.
5. **No integration adapters.** `nimc-adapter`, `comms`, `payout` and the SFTP
   poller are named in the spec and not written. Sign-in logs where the SMS
   provider would be called.
6. **Keys are not in an HSM**, as above.
7. **Translations are machine-drafted** and have had no native-speaker pass. Ten
   of them were drafted in this session rather than carried from the design
   bundle — see the README.
8. **Benefit figures are illustrative**, pending actuarial, legal and
   underwriting sign-off.
