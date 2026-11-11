# Test harness

Two runners, one rule: **nothing here ever touches `omerp`.**

| | Runner | What it covers |
|---|---|---|
| `tests/unit/**.test.ts` | **Vitest** | Pure money maths — GST/old gold/discount/round-off (`src/lib/gst.ts`), interest, purity, formatting. Milliseconds, no DB, no server. |
| `tests/api/**.spec.ts` | **Playwright** (`request`) | Route-handler contracts: invoice/GST/ledger/stock behaviour, numbering, concurrency, tenant isolation. |
| `tests/e2e/**.spec.ts` | **Playwright** (browser) | Customer panel, the action launcher, the sale/purchase/URD form. |
| `tests/books/**.spec.ts` | **Playwright** (`request`) | **The books gate** — every posting path, then the seven things that must be true of a set of books. See below. |

## Test-database isolation

The suite runs against **its own MySQL schema, never `omerp`** — that holds live customers,
invoices, loans and ledger entries.

### Concurrent runs are safe

Every run **claims a slot** (`tests/slot.ts`) and owns everything about it until it exits:

| Slot | Schema | Port | Build dir | Sessions | Artifacts |
|---|---|---|---|---|---|
| 1 | `omerp_test_1` | 3111 | `.next-test-1` | `tests/.auth/slot-1` | `test-results/slot-1` |
| 2 | `omerp_test_2` | 3112 | `.next-test-2` | `tests/.auth/slot-2` | `test-results/slot-2` |
| … | up to `OMERP_TEST_SLOTS` (4) | | | | |

The claim is an exclusive lock file in `tests/.locks/` holding the owner's pid, released on exit.
A lock whose process is gone is stale and gets stolen, so a killed run does not wedge a slot. A slot
is only taken if **its port is free too**, so a stray leftover server costs one slot instead of
blocking every run. If all slots are busy a run waits (up to 10 minutes) instead of corrupting
another run's data. Playwright re-evaluates the config in each worker; workers inherit
`OMERP_TEST_SLOT` and reuse the claim rather than taking a second one.

So: two agents, or CI and a developer, can run `npm run test:api` at the same time. What you no
longer need is the old rule that only one person may run tests at a time.

Inside a run, `workers: 1` still holds — the specs share that run's one schema, so parallel workers
would race on invoice numbering and stock status. Concurrency is exercised inside a test instead.

### Why it cannot reach `omerp`

1. `tests/db-guard.ts` reads `.env.test` (never the app's `.env`) and **throws unless the database
   name is a lowercase `*_test` or `*_test_<n>`** (worklog Task 46 — an uppercase name makes Prisma
   blind to foreign keys). It runs before anything else: the Playwright config, the seeder and
   `databaseUrlFor()` all go through it, so the derived slot URL is vetted as well as the base one.
   A `.env.test` pointing at `omerp` aborts the run at config load, before a connection is opened.
2. The slot schema is only ever `CREATE DATABASE IF NOT EXISTS`-ed. Nothing in the harness drops a
   database, and `wipe()` truncates only the tables in the schema the guard approved.
3. The Playwright `webServer` starts its **own** Next server on the slot's port with
   `reuseExistingServer: false`, its own `NEXT_DIST_DIR`, and `DATABASE_URL` set to the slot schema.
   It will never adopt the dev server on 3002 (that one is wired to `omerp`).
4. **The canary.** URL checks only prove what the test process read. After login,
   `tests/global-setup.ts` calls `GET /api/firms` and `assertFixtureFirmIds()` aborts the whole run
   unless every firm id starts `tst-`. Only `tests/seed.ts` produces those ids — so a server someone
   started by hand with the live `DATABASE_URL` is caught before a single spec writes to it.
   (This is the check that would have stopped the 126 live invoices written in September.)
5. `scripts/guard-live-db.mjs` fronts `db:push`, `db:migrate` and `db:reset`; they refuse any
   database not named `*_test` / `*_dev` / `*_scratch`. Escape hatch: `ALLOW_DESTRUCTIVE_DB=1`.

Per-run data isolation is a **full reset-and-seed** of that slot's schema: `tests/seed.ts` truncates
every table and rebuilds a fixed fixture (`FIX`) — two firms, three users, the C5497/C1673
regression pair with loans A105/A102, stock, and an out-of-state customer for the IGST case.

## The books gate (`tests/books/`)

`npm run test:books`

### What it guarantees

A read-only survey of **oMunim** — the incumbent this shop is migrating off — found its accounting
structurally broken, with numbers:

* its balance sheet is **97% plug**: one unlabelled `Diff. in Balances 68,417,032.96` against a
  `Total 70,757,680.11`, alongside negative liabilities (`SECURED LOANS -254,221.00`), negative
  assets (`CASH IN HAND -854,641.55`), negative stock, and an income account (`MAKING CHARGES`)
  sitting under liabilities;
* its **trial balance does not balance**: debits `12,302,917.16` vs credits `15,191,605.95`, out by
  `2,888,688.79` — and it prints the statements anyway;
* its **balance sheet and trial balance disagree on the same accounts in the same period**:
  `CASH IN HAND` 879,641.55 CR vs −854,641.55, `SUNDRY CREDITORS` 563,492.00 vs 588,492.00 — each
  out by exactly ₹25,000 in opposite directions, because one voucher reaches one statement and not
  the other;
* it prints **three different net profits in one run**: Trading `1,870,539.87`, P&L `1,691,909.41`,
  Balance Sheet `1,661,673.99` — and prints `Discount Paid 32,346.00` twice in the same P&L;
* **every invoice prints two totals**: IS21/96 shows `TOTAL AMOUNT 5,918.00` in the summary block and
  `5,917.00` in the HSN block (one truncates 86.175, the other rounds it), and the receivable it
  auto-creates is 5,917 — the shop chases a figure its own invoice contradicts.

**oMunim fails all seven checks below.** Ours passes them, and that is the clearest advantage this
product has over the thing it replaces. It is also the advantage that rots silently the first time
someone adds a posting path that skips `postVoucher`. This gate is what makes that loud.

| # | Check | The oMunim defect it pins |
|---|---|---|
| 1 | `Σ debits == Σ credits` across the whole ledger **and inside every single voucher** | TB out by 2,888,688.79 |
| 2 | Balance sheet balances with **no suspense, difference or plug line** — if a plug would be needed, fail rather than render it | `Diff. in Balances 68,417,032.96` |
| 3 | **Trading profit == P&L net profit == balance-sheet net profit**, with every nominal account landing in exactly one bucket and appearing exactly once | three net profits; `Discount Paid` printed twice |
| 4 | Trial balance and balance sheet **agree account by account**, plus the named `omunim-25000` regression fixture | the ₹25,000 split |
| 5 | Every invoice reconciles with **itself** — line block, tax/HSN block, header total, round-off, and the receivable the ledger actually raised | IS21/96's two totals |
| 6 | **No account on the wrong statement**, checked against a chart written here by the auditor rather than read from the application's own | `MAKING CHARGES` under liabilities |
| 7 | **No negative asset or liability passes silently** — the sign is right, or the statement reclassifies (a credit cash balance is an overdraft under liabilities) and the test asserts which. Credit-balance *inventory* is never acceptable | `SECURED LOANS -254,221.00`, negative stock |

They are **identities, not fixtures**: not one of them hard-codes a total. They hold over an empty
set of books and over ten years of them, and each is asserted over **two views** — the default
current-financial-year screen and an all-time range. A statement that only balances when you look at
it from the right angle is not balanced.

### How it works

`01-postings.spec.ts` drives every sanctioned posting path once: opening capital, purchase, URD,
sale against costed stock, invoice delete (reversal), expense, expense delete (reversal), loan
disbursal, top-up, part payment, release with a rebate, auction with a surplus, auction with a
shortfall, scheme instalments, scheme redemption, scheme early close, customer receipt — plus the
awkward invoice arithmetic that does not land on a whole rupee. `02-reconciliation.spec.ts` then
audits the result. The two files run in filename order under the config's `workers: 1`.

Two extra tests sit outside the seven. They prove the books are **complete**, not merely consistent:
a module that moves money without posting a voucher leaves books that tie perfectly and are still
wrong. Each names its own module, so a red one is actionable.

### Why it audits firm MAD

The gate posts into **MAD**, the fixture's second tenant, not JBS. Every other API spec writes to
JBS, and some of them legitimately post to throwaway account names (`COGS Spec Suspense` in
`tests/api/inventory-cogs.spec.ts`) which resolve to type `unclassified` and therefore land on no
statement — so a balance sheet over JBS can never balance, for a reason that is a fixture artefact
and not a product defect. A gate that cries wolf gets deleted. Check 1 (`Σ debits == Σ credits`, per
voucher) is still run over **every** firm in the database, because that one holds regardless of who
wrote the data.

### Failure messages

Every assertion names the **account and the difference**, and prints the statement it is complaining
about. `expected true, received false` is not a diagnosis, and a gate nobody can debug is a gate
somebody deletes. The shape to keep:

```
Error: A jewellery bill almost never totals a whole rupee. This one prints a total of ₹42,833.00
including a round-off of ₹0.25, and the customer pays it to the rupee. A 400 UNBALANCED here means
the round-off the invoice PRINTS (Invoice.rofAmount, stored on the row) has no ledger leg in
buildLedgerEntries() — so debits and credits differ by exactly that round-off and postVoucher
refuses the entire sale. Server said: {"error":"Invoice could not be posted to the ledger: Voucher
does not balance: debits ₹42883.00 vs credits ₹42882.75, difference ₹0.25","code":"UNBALANCED"}
```

### Known red — real defects, do not weaken

Four tests fail today. All four are defects in the application, found by this gate on its first run.
They are left failing on purpose: **a red gate that tells the truth is the entire point.** Do not
skip, quarantine or soften an assertion to make the count green.

| Test | Defect | Owner |
|---|---|---|
| `…a previous balance, loyalty AND a round-off` | `Invoice.rofAmount` has no ledger leg. Debits exceed credits by exactly the round-off, so **any sale whose raw total is not a whole rupee is rejected outright** (400 `UNBALANCED`). | `be-sales-gst` |
| `…tendered for MORE than it asks for` | An over-tender has no leg (`balance > 0 ? balance : 0` in `buildLedgerEntries`). The excess is a customer advance; instead the voucher is out by the overpayment and the invoice cannot be raised at all. | `be-sales-gst` |
| `POST /api/stock must reach the books` | Direct stock intake writes a `StockItem` with a `costPrice` and posts nothing. Inventory is perpetual, so that stock is relieved to COGS on sale against a debit that was never made. | `be-inventory` |
| `POST /api/udhaar must reach the books` | The entire udhaar module posts no vouchers. Cash lent informally is invisible to the cash book, the debtors balance and the balance sheet. | `be-lending` |

## Running it

```bash
npm run test:db:setup   # once: create the base omerp_test, apply migrations, sync schema, seed
npm test                # unit + API + E2E + books (claims one slot)
npm run test:unit       # Vitest only — pure functions, no DB, no server, always safe to run
npm run test:api        # Playwright API project only
npm run test:e2e        # Playwright browser project only
npm run test:books      # the books gate only
npm run test:ui         # Playwright UI mode
npm run test:seed       # re-seed the BASE omerp_test by hand (slots are seeded per run)
npm run test:isolation  # prove two runs cannot clobber each other (run two copies at once)
```

Two of these can run at once. The first line of a run tells you which slot it took:

```
[slot 2] omerp_test_2 on http://localhost:3112
```

Slot schemas are created on first use and then reused, so only the first run on a slot pays for
`prisma db push`. `OMERP_TEST_SLOTS=8` raises the ceiling; `OMERP_TEST_PORT_BASE` moves the ports.
Stale `tests/.locks/*.lock` files are self-healing — delete one only if you know its process is gone.

Proving the isolation rather than trusting it:

```bash
npm run test:isolation & npm run test:isolation & wait   # two seeders, two slots, stable reads
npm run test:api       & npm run test:api       & wait   # the real thing, twice, at once
```

The schema sync before each run is `prisma db push` **only** — not `migrate deploy` first. A slot
schema is reused between runs, so a new migration file hits `Table 'x' already exists` (P3018 /
MySQL 1050) on a schema `db push` has already built. Whether the migrations themselves apply
cleanly is a separate check against a blank database; it is not this harness's job.

### Known red

`tests/api/numbering-concurrency.spec.ts:75` fails on purpose. Simultaneous invoice POSTs exhaust
the handler's retries and one comes back 409 instead of a number. It is a real defect owned by
`be-sales-gst`, not a flake: **do not skip, quarantine or weaken it.**

Four more in `tests/books/` — see [the books gate](#known-red--real-defects-do-not-weaken) above.

### Known cross-project interference (pre-dates the books gate)

`npx playwright test` with more than one project in the same run leaves four `tests/e2e/sell-form`
tests red that pass when `--project=e2e` is run on its own; `tests/e2e/customer-panel` and
`tests/api/customer-panel` join them intermittently. The projects share one slot schema and the API
project's writes reach the browser project's fixtures. Reproduce:

```bash
npx playwright test --project=e2e              # 24 passed
npx playwright test --project=api --project=e2e # 6 failed, 143 passed
```

Not caused by, and not fixable by, the books gate — it appears with `--project=api --project=e2e`
alone. Owner: `qa-e2e-web`.

## Adding a test

- A new money formula → a Vitest file next to `tests/unit/gst.test.ts`. Prefer this: it is the
  cheapest place to pin an arithmetic rule.
- A new endpoint → copy `tests/api/tenancy.spec.ts` for the 401/403 pair, then assert the contract.
- A new screen → `tests/e2e/`, using `gotoView` / `openCustomer` from `tests/e2e/app.ts`.
  There is no page-object layer and there should not be one.
- **A new posting path** → `tests/books/01-postings.spec.ts`, and add its account names to
  `EXPECTED_TYPE` in `tests/books/books.ts`. The seven checks then cover it for free; skipping this
  step is how the books start drifting.

Auth comes from saved sessions, created once in `tests/global-setup.ts` by driving the real login
screen: `test.use({ storageState: STATE.admin })` (firm JBS) or `STATE.outsider` (firm MAD, used to
prove cross-tenant refusal, and the firm the books gate audits).
