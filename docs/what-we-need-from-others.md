# What we need from somebody else

Everything left before a pilot is waiting on a decision, a credential or a
person outside this repository. The code estimates are in
[plan.md](./plan.md), §4 — this is the list that actually sets the calendar,
because no number of build days substitutes for a WSDL that has not been issued.

Each section below is written to be forwarded on its own. It says what to ask
for, what it unblocks, what happens meanwhile, and where it plugs in when it
arrives.

**Nothing here is a lead time.** Where a body has a published turnaround we do
not know it, and inventing one would put a date in a plan that nobody promised.
Ask each of them what theirs is; that answer is the schedule.

---

## At a glance

| # | Who | What we need | Blocks |
|---|---|---|---|
| 1 | NIMC | WSDL, IPsec tunnel, integrator credentials | Enrolment verifying a NIN at all |
| 2 | An SMS aggregator | Account, bearer token, sender ID | Every sign-in, every notification |
| 3 | NIBSS | Institution code, signing certificate, sandbox | Paying a claim |
| 4 | Each payroll sponsor | SFTP host, host key, credentials, file naming | Return files arriving by themselves |
| 5 | OAGF / Head of Service | Hosting decision, then capacity | Every environment past this laptop |
| 6 | NITDA | Data-classification ruling | Where the data may legally sit |
| 7 | Data protection officer | NDPA DPIA | Processing lawfully at all |
| 8 | A CREST-equivalent tester | Penetration test | Sign-off before live members |
| 9 | Whoever owns the HSM | PKCS#11 config, PIN, a key ceremony | L3 keys leaving a config file |
| 10 | Whoever owns identity | Keycloak realm, or OAGF SSO | Console accounts that are not ours |
| 11 | Actuary, legal, underwriting | Sign-off on the figures | Quoting a real price |
| 12 | Native speakers | Hausa, Yorùbá, Igbo, Pidgin | Four of five languages being true |
| 13 | Whoever publishes the app | Signing keystore, Play and Apple accounts | Anyone installing it |
| 14 | A telco aggregator | Shortcode, session endpoint | Members without a smartphone |

Items 1–4 and 9–13 are credentials or artefacts. Items 5–8 are decisions and
paperwork with their own clocks, and are the ones to start first for that reason
alone.

---

## 1. NIMC — verifying a NIN

**Ask for:** the WSDL for the verification service, an IPsec tunnel endpoint and
its parameters, integrator credentials, and access to whatever test environment
exists.

**Why it cannot be guessed:** the WSDL is not public and credentials are issued
per integrator. A SOAP client written against an assumed contract compiles,
passes its own tests, and has never spoken to NIMC — which is the worst of both
worlds, because it looks finished. `HttpIntegrations` says so in as many words
and refuses rather than pretending.

**What it unblocks:** enrolment checking that a NIN, a name and a date of birth
belong together. Today `StubIntegrations` answers locally: it validates the
shape of a NIN and returns a plausible verification, and no NIN has ever left
the machine.

**Where it plugs in:** `NIMC_URL`, with `INTEGRATIONS_MODE=http`. The interface
is `Nimc.verify(nin, fullName, dateOfBirth, subject)` returning
`(found, nameScore, dobMatches, reference)` — a fuzzy name score rather than a
boolean, because "Adaeze Okonkwo" and "Adaeze N. Okonkwo" are the same person
and a strict comparison rejects half a payroll.

**Handling note:** a NIN is L3. It is stored as an HMAC for matching and AES-GCM
ciphertext for re-transmission, never in the clear, and never returned by the
API or written to a log. Anything NIMC sends back is subject to the same rule,
and the replay log redacts it (`Redacted`).

## 2. An SMS aggregator — sign-in codes and notifications

**Ask for:** an account, the endpoint, a bearer token, and a registered sender
ID. Confirm delivery to all four major networks and what happens to a message
sent to a number that has ported.

**What it unblocks:** the member's only door. There is no password anywhere in
the member app — a civil servant has a phone number, and that is the credential.
Without this nobody signs in and nobody is told anything.

**Where it plugs in:** `COMMS_URL`, `COMMS_SENDER`. **This adapter is written**
— a JSON POST with a bearer token, which is the shape every Nigerian aggregator
offers. If yours differs it is a small change in `HttpIntegrations.httpComms`
rather than new work.

**Ask them specifically:** the per-message cost and any volume commitment. At
16,272 seeded members one sign-in each is 16,272 messages, and the scheme's real
size is larger; that is a line in somebody's budget and it should not be a
surprise.

## 3. NIBSS — paying a claim

**Ask for:** an onboarded institution code, the signing certificate, the API
specification for name enquiry and transfer, and sandbox access.

**Why this one is different:** it is the adapter where a plausible-looking wrong
implementation moves real money to the wrong account. Every other integration
fails visibly; this one can succeed at the wrong thing.

**What it unblocks:** the last step of a claim. A death benefit is assessed,
approved and then sits there — the console can mark it paid, but nothing reaches
a bank.

**Where it plugs in:** `PAYOUT_URL`. Two calls, deliberately separate:

- `resolveAccountName(bankCode, accountNumber)` — cheap, and catches the
  transposed digit that would otherwise pay a stranger. The name comes back and
  comparing it to the claimant's is our job.
- `transfer(account, amountMinor, narration, claimRef)` — `claimRef` is the
  idempotency key, so two instructions carrying the same reference are one
  instruction. Confirm NIBSS honours it on their side too; ours does not help if
  theirs does not.

The `sessionId` NIBSS returns is what a family's "where is our money" question
resolves to, so confirm it is the reference a bank will actually accept as proof.

## 4. Each payroll sponsor — return files

**Ask each sponsor for:** SFTP host and port, the host key fingerprint,
credentials, the directory, and the file naming convention they use.

**Why per sponsor:** every MDA has its own host and its own conventions. This is
not one credential but one per rail, and it is the item most likely to arrive
piecemeal — which is fine, because each sponsor can be switched on alone.

**What it unblocks:** return files arriving on their own. Reconciliation works
today; somebody uploads the file by hand.

**Where it plugs in:** `ReturnFiles.list(sponsorRef)` and `fetch(sponsorRef,
path)`, keyed per sponsor. The adapter is not written — it needs Apache MINA and
the per-sponsor host keys above. Files are fetched and never deleted: the remote
directory is somebody else's record and we do not get to edit it.

## 5. OAGF / Head of Service — where this runs

**Decide:** GBB sovereign cloud, or a NITDA-registered private provider through
the GBB marketplace. Then: does Defence need a separately segmented tenancy, and
is DR in a second Nigerian site required or is a foreign region exemptable?

**Why it is first among the decisions:** it is upstream of items 6, 7 and 9, and
of the HA/DR work in the plan. Terraform provisions one database today because
provisioning two in an unnamed place is a guess.

**What we can say to help the decision:** the stack is Kubernetes, Terraform,
Helm and ArgoCD precisely so that it runs identically on GBB, on a registered
provider, or on a hyperscaler if policy ever allows. Object storage is
S3-compatible rather than a vendor SDK for the same reason. Sovereignty means
being able to move, and nothing here is written against one provider's API.

## 6. NITDA — the data-classification ruling

**Ask for:** a formal ruling on the roll data and the claim data.

**Why:** the build spec assigns levels L1–L4 already, and the schema enforces
them — Defence nominal rolls are L4 with their own key and no export. But our
assignment is a reading, not a ruling, and the difference decides whether a
foreign DR region is available at all.

**Start it now.** It has its own clock and nothing we write changes it.

## 7. Data protection officer — the NDPA DPIA

**Ask for:** a Data Protection Impact Assessment under the Nigeria Data
Protection Act.

**What to hand them:** the data map is already written down — `docs/build-spec.md`
has the classification table, and the schema has the row-level policies that
enforce it. The processing is: a payroll sends names, service numbers and
amounts; we hold a NIN as an HMAC and ciphertext; a claim carries a death
certificate and a bank account.

**Worth flagging to them:** next of kin. A relative who is not a member signs in
with the deceased's CSP-ID and their own phone number, and sees a name and a
CSP-ID — that is a deliberate minimum, and it is the kind of thing a DPIA should
be told about rather than discover.

## 8. A penetration test

**Ask for:** an external test before live members exist, against a UAT
environment with realistic but non-real data.

**Where to point them:** the two sign-in doors, the row-level security by
sponsor, the presigned upload path, and the next-of-kin door. Those are where
the trust boundaries are.

## 9. Whoever owns the HSM — the keys

**Ask for:** the device, a SunPKCS11 configuration file naming the vendor
library and slot, the PIN, and a **witnessed key ceremony** to generate the keys
under the labels in `KeyVault.Purpose` (`nin-hmac`, `nin-enc`, `token-signing`).

**Why a ceremony and not a first-boot step:** keys generated by a pod on first
boot are keys nobody witnessed being created. The application deliberately
cannot generate them — it expects them to exist in the token already.

**What it unblocks:** L3 key material leaving a config file. Today the NIN keys
are derived from `csp.jwt-secret`, so one leaked environment variable is both.
The prod profile refuses to start that way.

**Where it plugs in:** `HSM_ENABLED=true`, `HSM_CONFIG`, `HSM_PIN`. Note that
member tokens move from HS256 to ES256 with that switch — symmetric signing and
hardware custody are incompatible, so the algorithm is the vault's choice.
`csp.crypto.previous-hmac-secret` keeps tokens already in people's hands working
for one deploy.

## 10. Whoever owns identity — console accounts

**Decide:** do we run Keycloak, or federate to OAGF SSO?

**What it unblocks:** console accounts belonging to the organisation rather than
to us. The eight roles exist as realm roles and the realm imports locally; what
is missing is whose directory is authoritative, and who administers it at three
in the morning.

**Where it plugs in:** `csp.keycloak.issuer-uri`. Unset, the API logs a warning
and accepts member tokens only — fine for local work on the member apps, not for
a console.

## 11. Actuary, legal, underwriting — the figures

**Ask for:** sign-off on the benefit schedule and the premiums, or replacement
figures.

**Say plainly:** every number in `Pricing` is illustrative. It is one class so
that replacing it is one file and a migration rather than a hunt through
handlers, and the API is now the single source of it — screens read it rather
than carrying their own copy, which is what let an app and an API disagree about
what a family was owed.

**Two wording items ride along** (plan §2c.17): `hospital_cash` reads "Accident
medical bills" in English and "accident hospital money" in the other four, and
"Children's education" is a string nothing sells.

## 12. Native speakers — Hausa, Yorùbá, Igbo, Nigerian Pidgin

**Ask for:** a review pass over the whole string table by a speaker of each,
ideally one who has worked on insurance or pensions.

**Why it cannot be done here:** the current strings are machine-drafted. They
fail hardest exactly where it matters — *beneficiary*, *sum assured*, *grace
period*, *mandate* — and a plausible wrong word in a death-benefit app is worse
than English.

**Also needs their eyes:** the newest screens (enrolment, leavers, the debit run,
remittances, settings, reports, the next-of-kin door) are English-only and have
had no pass at all. And Yorùbá and Igbo diacritics are untested on a low-end
Android at small sizes, which is a rendering question a speaker will spot
instantly and we will not.

**Book it when the newest screens stop changing**, not after everything else —
it runs in parallel with every other item here and a pilot cannot start without
it.

## 13. Whoever publishes the app — signing and distribution

**Ask for:** an Android upload keystore held somewhere durable, a Play Console
account if we are distributing that way, an Apple Developer team ID and
provisioning profile, and **one cheap Android handset in somebody's hand**.

**The one to act on first:** `mobile/android/app/build.gradle` signs the release
build with the **debug keystore**. That is React Native's default and it is
still wrong — an APK signed with the debug key cannot go on Play, and anything
sideloaded with it cannot later be updated by a build signed properly. It needs
a real keystore before a single install happens, not before the first release.

**iOS builds the simulator target only.** A signed archive needs a team and a
profile, which is a decision rather than work.

**And a device.** CI proves the app compiles and produces an APK; nothing short
of a handset proves it runs. Nobody has installed it on either platform.

**The size decision comes with it** (plan §2c.21): the APK is 12.2 MB for the
architecture a low-end handset installs, against a spec budget of 8 MB. No
configuration closes that gap — code and resource shrinking together moved it by
0.1 MB. The options are an app bundle through Play, accepting the figure, or
changing the target, and that is a decision rather than a defect.

## 14. A telco aggregator — the USSD twin

**Ask for:** a shortcode, a session endpoint specification, and the commercial
terms.

**Why it is worth more than it looks:** it reaches the members who will never
open an app, which in this scheme is not a small minority. The menu service is
stateless by design and reads the same string table as the apps, so the
translation pass in item 12 covers it too.

---

## What we are not waiting on

So the list above is not read as "nothing works". Against a running API, in a
browser and over HTTP: a member reports a death, attaches four documents, an
assessor reads the certificate and approves, operations pays, and the claim
leaves the queue. A payroll schedule loads a million rows through a restartable
batch job and leaves a signed roll file. Enrolment, leavers, the debit run,
remittances and reconciliation all work against real rows.

Every integration above has an interface, a circuit breaker tuned for that
system, a replay log and a stub that answers locally — so the shape is settled
and what is missing is the endpoint, not the design. `INTEGRATIONS_MODE=http`
selects implementations that construct and then refuse with a named reason,
which is why a deploy missing one of these says which one rather than failing
somewhere unrelated.
