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
| Postgres | 5432 | app role `csp` / `csp`, databases `csp` and `csp_test`; bootstrap superuser is `postgres` |
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

That claim is now backed by rows: the seed creates **16,272 members** across the
four rails with fourteen months of contributions, beneficiaries for all but the
few hundred the chase list is about, and this month's collection part-paid. It
takes about eight seconds. Before that it asserted 8,412 members on a cycle and
created four, which nothing noticed until a screen counted the money from the
ledger and read "₦0 received of ₦21,030,000".

Check it:

```bash
curl -s localhost:8080/actuator/health
# {"groups":["liveness","readiness"],"status":"UP"}
```

**Drop `seed` after the first run** unless you want the database rewritten. It
truncates and re-inserts every time.

**The application must not connect as a superuser.** Postgres does not apply
row-level security to a superuser or to a role with `BYPASSRLS` — the policies
are not consulted at all, so every protection in this schema stops applying
without an error anywhere. `postgres` bootstraps the cluster and `csp` is an
ordinary role that owns its databases (`deploy/local/init-db.sql`, which compose
mounts and CI runs). `SeparationOfDutiesTest` asserts it, first, because a suite
connected as a superuser proves nothing while reporting that it proved
something — which is how five of its tests came to fail only on CI.

If you brought the stack up before this change, the init script will not re-run
against an existing volume: `docker compose down -v && docker compose up -d`.

API docs are at http://localhost:8080/swagger-ui.html.

## 3. Run the frontends

```bash
npm install
npm run dev                  # against the API on localhost:8080
VITE_API_URL= npm run dev    # fixtures, no backend needed

# The console additionally needs Keycloak, or its sign-in button has nothing
# to go to:
VITE_API_URL=http://localhost:8080 \
VITE_OIDC_ISSUER=http://localhost:8081/realms/csp \
npm run dev
```

`VITE_API_URL` is the only switch, and **`.env.development` sets it**, so
`npm run dev` talks to the API. That default is deliberate: it used to be the
other way round, and somebody reviewing the product opened it, saw the figures
the design bundle has always shown, and concluded that nothing was integrated.
They were right about what they were looking at — with the variable unset, not
one screen calls the backend.

Fixtures are still one command away and are still how the design gets reviewed
and how the rail-branching tests run, neither of which should need Postgres.
When the apps are running on them, **every screen carries a "Demo data · no API
configured" badge** in the corner, so the two can never be mistaken again.

A production build takes the variable from the environment; `.env.development`
applies to `npm run dev` only.

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

### A claim's evidence

Documents do not come through the API. The client asks where to put a file, PUTs
it there itself, and then confirms — the same three steps whether the store is a
bucket in Abuja or a directory on your laptop, because the client follows the URL
it is handed and never learns which one it got.

```bash
# 1. Where does this go?
curl -s -XPOST localhost:8080/v1/claims/CLM-2026-0092/documents/upload \
  -H "Authorization: Bearer $MEMBER" -H 'Content-Type: application/json' \
  -d '{"docKey":"death_certificate","filename":"cert.pdf",
       "contentType":"application/pdf","byteSize":24}'
# {"key":"claims/22c87e01-…/death_certificate/fc366227-….pdf",
#  "url":"http://localhost:8080/v1/evidence/claims/22c87e01-…",
#  "method":"PUT","headers":{"Content-Type":"application/pdf"},
#  "expiresAt":"2026-09-17T04:14:09Z"}

# 2. Send the bytes to that URL, with exactly the headers it returned. Against a
#    bucket they are part of the signature, and a fifth header is a 403.
curl -s -XPUT "$URL" -H 'Content-Type: application/pdf' --data-binary @cert.pdf

# 3. Confirm. The server looks in the store rather than taking your word for it.
curl -s -XPOST localhost:8080/v1/claims/CLM-2026-0092/documents \
  -H "Authorization: Bearer $MEMBER" -H 'Content-Type: application/json' \
  -d '{"docKey":"death_certificate"}'
# {"docKey":"death_certificate","outstanding":3}
```

When the last one lands, `outstanding` reaches 0 and the claim moves to
`assessing` by itself. Step 3 against a file that never arrived is a 400 and the
claim stays where it was — a claim reaching an assessor with nothing behind it
means a bereaved family being asked for the certificate a second time.

The storage key is the server's. It is never accepted from the caller, and a
second upload of the same document gets a new key rather than overwriting the
first — which is what retention needs, and what stops different bytes appearing
behind a key an assessor has already read.

Reading one back, as the assessor does:

```bash
curl -s localhost:8080/v1/claims/CLM-2026-0092/documents/death_certificate/file \
  -H "Authorization: Bearer $ASSESSOR" -o cert.pdf
```

That stream goes through the API rather than out as a presigned GET: a signed
link to a death certificate works for whoever ends up holding it, and these are
the reads that belong in an audit trail.

**Locally this writes to a directory** (`csp.evidence.root`, default
`./var/evidence`) and the upload URL is this service's own — no encryption at
rest, no object lock, one machine. Enough to work the claim path with nothing
installed; refused outright under the `prod` profile.

**For the real thing**, any S3-compatible store:

```bash
docker compose --profile s3 up -d           # MinIO, plus a bucket with CORS set
EVIDENCE_MODE=s3 EVIDENCE_ENDPOINT=http://localhost:9000 \
EVIDENCE_BUCKET=csp-evidence EVIDENCE_ACCESS_KEY=csp EVIDENCE_SECRET_KEY=csp-secret \
  mvn spring-boot:run
```

Uploads then go straight to the bucket on a presigned PUT with SSE-S3, and the
API never sees the bytes. Worth switching to before anything ships: presigned
URLs, bucket CORS and server-side encryption all work on a directory and then do
not work on a bucket. The startup log says which one you are on:

```
Claim evidence: local directory /home/you/repo/api/var/evidence
Claim evidence: s3 http://localhost:9000/csp-evidence
```

### The signed roll file

Every schedule load ends by writing down what the payroll sent and what the
scheme took, as one plain text file in the same bucket, with a detached OpenPGP
signature beside it. It is the answer to "show me what the Ministry of Education
sent in August" that does not depend on trusting a query somebody ran.

```bash
# Is there one, and what is it? (No bytes — just the digest and the signing time.)
curl -s localhost:8080/v1/sponsors/$SPONSOR/schedules/$BATCH/roll-file \
  -H "Authorization: Bearer $PREPARER" | jq

# The file and its signature.
curl -s localhost:8080/v1/sponsors/$SPONSOR/schedules/$BATCH/roll-file/download \
  -H "Authorization: Bearer $PREPARER" -o roll.txt
curl -s localhost:8080/v1/sponsors/$SPONSOR/schedules/$BATCH/roll-file/signature \
  -H "Authorization: Bearer $PREPARER" -o roll.txt.asc

# The public key is public — no token, by design.
curl -s localhost:8080/v1/roll-files/public-key -o public.asc

gpg --import public.asc && gpg --verify roll.txt.asc roll.txt
#  gpg: Good signature from "Civil Servant Protect roll files …"
```

**Without a configured key the signing key is generated at startup and lost when
the process exits**, so signatures from an earlier run stop verifying after a
restart. That is fine on a laptop and is refused under the `prod` profile. The
startup log always says which you are on:

```
Roll files signed by ephemeral PGP key 2BF4BCCDEF965C97
Roll files signed by PGP key 9C41A0E7B5D3F210
```

To make a real one — this belongs in Vault, not in a values file:

```bash
gpg --batch --quick-generate-key "Civil Servant Protect roll files" rsa4096 sign never
gpg --armor --export-secret-keys "Civil Servant Protect roll files" > signing-key.asc

ROLL_FILE_SIGNING_KEY="$(cat signing-key.asc)" \
ROLL_FILE_PASSPHRASE=… mvn spring-boot:run
```

A keyring whose primary key is certification-only is fine: the first key that
can actually sign is used, and the whole public ring is published so `gpg
--import` accepts it. A bare signing subkey has no user id and no self
signature, and gpg refuses those.

If the bucket is unreachable the load still succeeds — the deductions are real
money and are not rolled back to punish a storage outage — and the reason is
recorded on the batch, which the console shows. A batch with neither a key nor
an error is one where nothing was attempted, which is not the same thing.

### Paying a claim

The money path is two decisions by two people, like everything else here:

| | Who | Permission |
|---|---|---|
| Assess the claim | Claims assessor | `CLAIM_ASSESS` |
| Send the money | CSP operations | `CLAIM_PAY` |

Neither role holds the other's permission, and the database says the same thing
again with `payer_is_not_assessor` — so an account that could approve a payout
and then make it does not exist, whatever the service layer is asked to do.

In the console this is **Assess claims**, which only appears for an account
holding `CLAIM_READ_ANY` — an employer's finance officer has no business knowing
the queue exists. It is not the **Claims** screen beside it: that one is a
sponsor looking at their own staff with the amount, the cause and the documents
all withheld.

```bash
# What is waiting, oldest first — every sponsor's claims, not one rail's.
curl -s localhost:8080/v1/claims -H "Authorization: Bearer $ASSESSOR" | jq

# The evidence itself, streamed under the assessor's own token.
curl -s localhost:8080/v1/claims/CLM-2026-0091/documents/death_certificate/file \
  -H "Authorization: Bearer $ASSESSOR" -o certificate.pdf

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

### Enrolling somebody

Enrolment is back-office work. The sponsor already holds these people's records
— name, service number, grade, NIN — so an HR officer enrols them and the member
finds out by SMS. There is **no self-service enrolment endpoint**, deliberately:
membership follows payroll, so a public one would add no members and one attack,
where somebody who has read a civil servant's details attaches a phone number
they control to that person's cover.

Everything is under the sponsor, needs `MEMBERS_MANAGE`, and is scoped by RLS:

```bash
# Check a staff record against NIMC without creating anything. 200 with
# verified:false for a mismatch — that is an answer, not a bad request.
curl -s -XPOST localhost:8080/v1/sponsors/$SPONSOR/enrolment/verify \
  -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"nin":"22233344455","fullName":"Ngozi Chidinma Bello","dateOfBirth":"1990-04-12"}'

# 201. Creates the member, the account they sign in with, and their cover.
curl -s -XPOST localhost:8080/v1/sponsors/$SPONSOR/members \
  -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"nin":"22233344455","fullName":"Ngozi Chidinma Bello",
       "dateOfBirth":"1990-04-12","msisdn":"+2348031234567",
       "serviceNo":"5512340","grade":"GL 12","tier":"standard"}'
# {"cspId":"CSP-114-88215","tier":"standard","inForceSince":"2026-10-01", …}

# A list of new starters, capped at 1,000.
curl -s -XPOST localhost:8080/v1/sponsors/$SPONSOR/members/batch \
  -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"members":[ … ]}'
# {"submitted":5,"enrolled":3,"rejected":[{"row":3,"name":"…","reason":"No record at NIMC"}]}
```

Three things are worth knowing:

- **Cover starts on the first of next month**, not today. The first deduction
  comes off the next payroll run, and cover that began before anybody paid for
  it is a claim window the record cannot account for.
- **The list does not fail wholesale.** Each row is its own transaction, so a
  file of two hundred with three bad NINs enrols a hundred and ninety-seven
  people and names the three by line number. One transaction would roll the lot
  back and send an officer to a spreadsheet to find the problem themselves.
- **The NIN is never stored in the clear and never comes back.** A hash to match
  on, a ciphertext to re-send with, and nothing in a log or an error message —
  the console reports a bad row by its line number for the same reason.

The console screen is **Members → Add members**. It parses the staff list in the
browser and shows what it read — which header each field came from, how many
rows, which lines it will not send — before anybody is created by it.

### Exports

```bash
curl -s "localhost:8080/v1/sponsors/$SPONSOR/reports/remittances?period=2026-08-01" \
  -H "Authorization: Bearer $VIEWER"
# "period","rail_ref","state","scheduled_count","scheduled","credited","received","variance",…
# "2026-08-01","CSP-114/08","closed","8412","21030000.00","8412","21030000.00","0.00","0"
```

Five of them: `schedule`, `remittances`, `movement`, `claims`, `lapse-risk`.
CSV rather than a formatted document, because every one ends up in a spreadsheet
— an auditor reconciles it against their own figures, a payroll officer sorts
it — and a PDF of a table is a table nobody can use.

Each is a query over the same rows the screens count, so an export and the
console cannot disagree about a number somebody will quote back six months
later. The claims export reads the sponsor's projection, which has no amount,
cause or document on it: an export is the likeliest place for a column to appear
that nobody meant to disclose, because it is written once and read by whoever is
sent the file.

`lapse-risk` is the one nobody asks for until a family has been refused —
everybody whose grace period is running and who has not paid this month, with
the phone number to ring.

### Somebody leaving

```bash
# Comes off the payroll. Nothing is deleted.
curl -s -XPOST localhost:8080/v1/sponsors/$SPONSOR/members/$MEMBER/leave \
  -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"reason":"retired","lastDay":"2026-09-30"}'
# {"cspId":"CSP-114-88224","leftOn":"2026-09-30","graceUntil":"2026-11-29",
#  "outcome":"Cover continues to 2026-11-29. A retiree keeps their CSP-ID, …"}

curl -s localhost:8080/v1/sponsors/$SPONSOR/leavers -H "Authorization: Bearer $VIEWER"
```

A `POST` to `.../leave` rather than a `DELETE` of the member, and the verb is
the argument. **Coming off the schedule stops the deduction. It does not cancel
the cover.** A member who retires on the 30th is covered on the 1st, and their
family is owed the same money they were owed a week earlier. What changes is who
collects the contribution — sixty days of grace from the last payday, which is
time to set up a direct debit and time for somebody to deal with it if the first
attempt fails.

Three consequences worth knowing:

- **A death is not a reason.** It is a claim, and `deceased` is refused with a
  message saying so. An officer closing a payroll record is the wrong person, in
  the wrong screen, with no assessor anywhere near it.
- **Leaving twice is refused.** The second call would move the grace date, which
  is how cover ends earlier than the member was told it would.
- **A leaver stops counting as a failed collection.** They stay on the roster,
  marked, with the date their cover runs to — but out of the "not deducted"
  number, which is a to-do list an officer works through.

### Family cover

```bash
curl -s localhost:8080/v1/members/me/dependants -H "Authorization: Bearer $MEMBER"

curl -s -XPOST localhost:8080/v1/members/me/dependants \
  -H "Authorization: Bearer $MEMBER" -H 'Content-Type: application/json' \
  -d '{"name":"Uche Okafor","relation":"Mother","dob":"1958-02-11"}'
# {"band":"senior","sumAssuredMinor":100000000,"premiumMinor":240000,
#  "newPremiumMinor":420000,"effectiveFrom":"2026-10-01"}

curl -s -XDELETE localhost:8080/v1/members/me/dependants/$ID -H "Authorization: Bearer $MEMBER"
# {"name":"Uche Okafor","newPremiumMinor":180000,"coveredUntil":"2026-09-30", …}
```

**The server quotes the price.** Banded by age — child, adult, senior — so a
member can check it against a printed table; a rate that moves with a birthday
is impossible to argue with at a service desk, which makes it impossible to
trust. No screen multiplies anything: the response carries the band, the cover,
the premium and the whole new family total.

**Removing somebody deactivates their row.** It is not deleted, because the row
is what says this person was covered from March to September and a claim in that
window is assessed against it. Cover runs to the end of the month that has been
paid for, and the premium drops from the next one.

### The direct-debit run

```bash
curl -s localhost:8080/v1/sponsors/$SPONSOR/collection/direct-debit \
  -H "Authorization: Bearer $VIEWER"
# {"period":"2026-09-01","counts":{"presented":1240,"settled":1189,…},
#  "failures":[{"kind":"no_funds","count":41,"memberMustAct":false},…],
#  "timeline":{"presented":"2026-09-28","retried":"2026-10-05",…},
#  "grace":[{"cspId":"CSP-114-88220","daysLeft":44,…}]}
```

Every number is counted from the ledger rather than reported by the rail: a
presentment is a contribution row, a settlement is that row confirmed, a failure
is an exception raised against the cycle. A screen fed by NIBSS's own summary
would agree with NIBSS and disagree with the ledger — and the ledger is what
pays a claim, so that disagreement surfaces at the worst possible moment.

`memberMustAct` is the distinction that makes the screen worth opening. An empty
account on the 28th is often a full one on the 4th, so `no_funds` is retried and
needs nobody. A revoked mandate is the bank being told to stop, and only the
member can tell it otherwise — a console offering "retry" there teaches an
officer to press a button for a fortnight.

**It answers for payroll sponsors too, and should.** They still run debits, for
the people the file missed and the ones who left service with cover in force.
`grace` is that list: leavers whose sixty days are running and who have not paid
this month. Nobody is watching them, precisely because the main collection looks
fine.

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
npm test             # CSV, smoke, rails, layout, accessibility
npm run test:rails   # the four collection rails
npm run test:layout  # every route at five widths
npm run a11y

# Helm chart, without installing Helm
python3 deploy/helm/check-templates.py
```

The API tests use `csp_test`, which compose creates alongside `csp`. They wipe
their schema on every run, so they will not touch the database you are
developing against.

`test:layout` opens every route at 390, 768, 1024, 1440 and 2000 pixels and
fails on two things: anything that makes the page scroll sideways, and a page
that uses less than two thirds of the window it was given. Both have happened —
two pills in a row that could not wrap pushed a button 68px off a handset, and
the member web app was capped at 830px, so on a secretariat monitor the content
sat in a third of the screen with the rest empty.

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

Real, and deliberately not papered over. [docs/plan.md](docs/plan.md) carries the
same list sequenced — what blocks what, and what needs somebody else's decision.

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
   upload, and the console's **Add and remove members** screen, which enrols
   people for real — one at a time or from a staff list.

   Both halves of that screen are live now: adding people, and taking them off
   the schedule when they retire or transfer.

   The console's direct-debit run is live too — including the list of leavers
   whose grace is running and who have not set up a mandate.

   The member's family cover is live on both surfaces — the web app adds and
   removes people at the server's quoted price; the phone lists them.

   The console's **settings** screen is live: who can act for this sponsor, what
   each role may actually do, when each last signed in, and the sponsor's own
   audit trail.

   The console's **remittances** screen is live too, derived from the ledger
   rather than a table of its own: the cycle says what was asked for, the
   contributions say what arrived, and the difference is the variance somebody
   has to explain.

   The console's **reports** take real CSV exports — five of them, each counted
   from the same rows the screens show. PDF is offered as a disabled button with
   the reason, rather than a control that does nothing.

   The member's **cover detail** reads the benefit schedule now, on both
   surfaces, so the phone and the web app cannot quote different figures for the
   same cover — and neither can the plan chooser underneath them, which was
   still promising ₦3m of death cover two inches below a table saying ₦2m.

   Every member and console screen is wired. What remains fixtures is the
   illustrative content around them: the leaver examples on the enrolment page,
   the contacts on the settings page, the recent-exports list.

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

   Member tokens are **HS256 under the config vault and ES256 under the HSM**,
   because the algorithm is the vault's decision and only ES256 can be signed by
   a key that stays inside the device. Two consequences worth knowing:

   - The public half is published at `GET /v1/auth/jwks`. Under HS256 that set
     is empty — a shared secret has no public half, which is why every service
     wanting to check a member's session today has to be trusted to mint one
     too. The USSD gateway and the claims service should not be.
   - Cutting over changes the algorithm, so set `csp.crypto.previous-hmac-secret`
     for one deploy. Without it, every token minted a minute before the switch
     stops working — an eight-hour refresh token worthless at the moment of
     cutover, including for a member halfway through a claim.

   **What is not tested:** the PKCS#11 provider wiring. The ES256 path is
   covered against a software EC key, which is the same code except where the
   signature is computed; the hardware itself cannot be exercised here.

7. **Translations are machine-drafted** and have had no native-speaker pass. Ten
   of them were drafted in this session rather than carried from the design
   bundle — see the README.
8. **Benefit figures are illustrative**, pending actuarial, legal and
   underwriting sign-off. They now come from one place: `Pricing.SCHEDULE`,
   served at `GET /v1/products/schedule` and read by every screen that shows
   what a tier pays out.

   The design and the API used to disagree — the web app sold seven benefits
   where the API sells six, and five figures differed, with basic death cover
   reading ₦3,000,000 against the API's ₦2,000,000. **The API won**, on the
   product owner's decision, and the screens read it now.

   Two loose ends that decision leaves, both for whoever owns the wording:

   - `hospital_cash` is labelled "Accident medical bills" in English. The other
     four languages already say "accident hospital money", which is the key's
     meaning, so no translation was invented — but the English string is worth a
     second look.
   - "Children's education" is still in the translation table and no longer
     appears anywhere, because the API does not sell it. It was left in rather
     than deleted from five languages: removing a translated string to add it
     back later is how one gets lost.
