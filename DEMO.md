# Demo script

```bash
npm install
npm run dev     # http://localhost:5173
```

Everything below is a URL. Nothing needs clicking through to reach, so you can
open tabs ahead of time and never fumble a live demo.

There is no backend. The member's rail and language come from the query string
(`?rail=`, `?lang=`) and the scenario states from `?demo=` — see *Switches* at
the bottom.

---

## 1. The member app (2 min)

Open at phone width — dev tools device toolbar, 390px, or an actual handset on
your network via `npm run dev -- --host`.

| | |
|---|---|
| http://localhost:5173/m/home | What a member sees each month |
| http://localhost:5173/m/id | The protection card — who collects, and the CSP-ID |
| http://localhost:5173/m/contrib | **The trust artefact.** 14 months, and what is not yet confirmed |
| http://localhost:5173/m/benes | Who gets paid — **press "Add a beneficiary"** |
| http://localhost:5173/m/accident | Report an accident — works offline, four taps |
| http://localhost:5173/m/track | A claim trail that is time-stamped and append-only |

**The beat worth pausing on:** on `/m/benes`, adding the third name puts Emeka
on the record holding 0%. The app says so instead of accepting it quietly —
which is the entire reason the annual re-confirmation screen
(http://localhost:5173/m/beneconf) exists.

**The line to say on `/m/contrib`:** the current month is grey and says so.
Nothing here claims a payment nobody has seen yet. That is the whole product.

## 2. The same member, on a desk browser (1 min)

| | |
|---|---|
| http://localhost:5173/dashboard | Nav rail, session timeout note for shared machines |
| http://localhost:5173/contributions | Same ledger, printable |
| http://localhost:5173/card | A4 protection card |

Narrow the window below 1024 to show the rail collapse to a tab row — cyber-cafe
and office machines are not all widescreen.

Same CSP-ID, same beneficiaries, same shares as the phone. That is worth saying
out loud if you have just shown `/m/benes`: it is one record, not two demos.

## 3. The sponsor console (3 min)

| | |
|---|---|
| http://localhost:5173/console | An HR officer's month: 8,440 members, 57 exceptions |
| http://localhost:5173/console/schedule | The schedule that goes out |
| http://localhost:5173/console/reconciliation | The return file that comes back |
| http://localhost:5173/console/reconciliation/exceptions/CSP-114-88214 | One unmatched deduction, and the audit note |

**The line to say:** "Close the cycle" is blocked while any exception is
undecided. The officer cannot make 57 problems disappear quietly.

---

## 4. The rail — the thing worth demoing (3 min)

This is the idea everything else hangs off, and it is one query param.

```
?rail=federal    IPPIS — the federal payroll
?rail=state      Lagos State payroll
?rail=employer   a private employer's own payroll
?rail=self       no sponsor — NIBSS direct debit
```

Show the **same screen** on two rails, back to back:

| Payroll | Self-pay |
|---|---|
| http://localhost:5173/m/pay?rail=federal | http://localhost:5173/m/pay?rail=self |
| http://localhost:5173/m/contrib?rail=federal | http://localhost:5173/m/contrib?rail=self |
| http://localhost:5173/console/reconciliation?rail=federal | http://localhost:5173/console/reconciliation?rail=self |

What changes: the collection method, the backup, the grace timeline, the ledger
labels, *and the prose*. The federal member is waiting on a remittance file that
sits on someone's desk for most of a month. The self-paying member is waiting on
a bank, which answers the same day. Neither screen mentions the other's process.

The console's reconciliation is the sharpest version: a payroll rail reconciles a
**return file**, self-pay reconciles **debit results**, and the exception detail
is a name mismatch on one and a bank refusal on the other.

## 5. Five languages (1 min)

```
?lang=en  ?lang=ha  ?lang=yo  ?lang=ig  ?lang=pcm
```

http://localhost:5173/m/home?lang=ha · http://localhost:5173/m/contrib?lang=yo

In the web app it is a real account setting in the header, because it is one.

⚠️ **Say this out loud if anyone asks:** the translations are machine-drafted and
have not had a native-speaker pass. They are there to prove the layout survives
Yorùbá and Igbo strings running ~20% longer than English — not to be read as
finished copy.

## 6. Scenario states (1 min)

```
?demo=late      the deduction has not arrived
?demo=offline   no network
?demo=sun       bright-sunlight contrast
```

http://localhost:5173/m/home?demo=late · http://localhost:5173/m/home?demo=offline

`?demo=late` on both rails is a good closer — the app names what actually failed,
which decides whether the member walks to an HR office or fixes it themselves:

- http://localhost:5173/m/home?demo=late&rail=federal → "August deduction has not arrived"
- http://localhost:5173/m/home?demo=late&rail=self → "August direct debit did not go through"

---

## Switches

Combine freely: `/m/contrib?rail=self&lang=ha&demo=late`

| Param | Values |
|---|---|
| `rail` | `federal` `state` `employer` `self` |
| `lang` | `en` `ha` `yo` `ig` `pcm` |
| `demo` | `late` `offline` `sun` (comma-separated) |

## If someone asks what is not real

No backend, no auth, no persistence — refreshing resets. Nothing is wired to
IPPIS, NIMC, NIBSS or an underwriter, and the benefit figures are illustrative
pending actuarial and legal sign-off. Every screen is driveable end to end
against fixtures. `docs/spec-source.ts` has the integration shapes; README has
the full list of known gaps.
