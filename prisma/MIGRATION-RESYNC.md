# Migration history resync (Defect 8)

**What is wrong:** three migrations after 17 Sep were applied to `omerp` by `db push`, which records nothing.
Run `migrate deploy` on another machine (or after a restore) and MySQL fails "column already exists".

| Migration folder | What it does | In live omerp? | Remedy |
|---|---|---|---|
| `20260918090000_udhaar_interest_emi` | 7 nullable `Udhaar` columns (interestRate, interestType, interestStartDate, interestEndDate, interestConvention, emiIntervalDays, emiOccurrences) + new table `UdhaarPayment` | Yes (worklog: `db push`, Add Stock task) | `resolve --applied` |
| `20260923124943_stock_item_add_stock_cells` | 15 nullable `StockItem` columns (details, finalFineWeight, markUp, otherInfo, stone*: Clarity, ColorGrade, GrossWeightCt, Id, Name, OtherInfo, Qty, RateCt, SellRateCt, Shape, Size) | Yes (same `db push`: 22 columns = 7 + 15) | `resolve --applied` |
| `20260928103550_invoice_item_stones` | `InvoiceItem.stones TEXT NULL` | **NO - missing** | `migrate deploy` (really runs it) |

Never edit those migration files (Prisma stores a checksum of each).
Command names verified with `npx prisma migrate resolve --help` (Prisma CLI 6.19.3): `--applied <name>` is the documented
"reconcile changes done manually" flag. Nothing here was run against `omerp`.

## Steps (open a terminal in `E:\omjwellery\omjwellery`; one command each)

1. **Stop the dev server** (Ctrl+C in its window). Check `.env` says `.../omerp` in **lowercase**
   (worklog Task 46: capital letters make Prisma blind to every foreign key). Do not retype the URL.
2. **Back up:** `mysqldump -uroot -p --routines omerp > omerp_backup_before_resync.sql`
   Good: password prompt, no error, file is several MB. **STOP** if the file is empty or an error shows.
3. **Prove the columns exist** (the whole remedy depends on it):
   `mysql -uroot -p omerp -e "SHOW COLUMNS FROM Udhaar LIKE 'emiOccurrences'; SHOW COLUMNS FROM StockItem LIKE 'finalFineWeight'; SHOW TABLES LIKE 'UdhaarPayment'; SHOW COLUMNS FROM InvoiceItem LIKE 'stones';"`
   Good: first three return a row; the fourth (`stones`) returns nothing. **STOP** if any of the first three is empty:
   do NOT resolve that one, call me.
4. **See the current state:** `npx prisma migrate status`
   Good: "Following migrations have not yet been applied:" listing exactly the three names above.
   **STOP** if it says "failed" or lists others, or "Drift detected"/asks to reset. Never answer yes to a reset.
5. `npx prisma migrate resolve --applied 20260918090000_udhaar_interest_emi`
   Good: `Migration 20260918090000_udhaar_interest_emi marked as applied.`
6. `npx prisma migrate resolve --applied 20260923124943_stock_item_add_stock_cells`
   Good: `Migration 20260923124943_stock_item_add_stock_cells marked as applied.`
7. `npx prisma migrate deploy`
   Good: "1 migration found", "Applying migration `20260928103550_invoice_item_stones`", "All migrations have been successfully applied."
   Do NOT run `resolve --applied` for this one: that would record DDL that never ran and skip it forever, and the Sell form
   would fail. If this errors "Duplicate column name 'stones'", someone applied it meanwhile: only then run
   `npx prisma migrate resolve --applied 20260928103550_invoice_item_stones`. Any other error: **STOP**, do not retry.
8. **Verify:** `npx prisma migrate status` -> "Database schema is up to date!" and
   `mysql -uroot -p omerp -e "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at;"`
   Good: the last three rows are the names above, all with a `finished_at`. (`resolve --applied` stamps the time you ran it.)
   **STOP** if any row has NULL `finished_at`.
9. Restart the dev server.

**Undo:** restore the dump: `mysql -uroot -p omerp < omerp_backup_before_resync.sql` (the database name stays lowercase `omerp`).
Do NOT use `db:push`, `db:migrate` or `db:reset` for any of this (guard script refuses them on `omerp`, correctly).


---

# PART 2 - NOT PART OF THE MIGRATION RESYNC ABOVE

Two separate owner-run SQL actions against the live `omerp`. They do not depend on Part 1 and Part 1 does not depend on
them; do them in any order, on their own day if you like. Nothing here was run by anyone. Replace `omerp` only if your
database really is named otherwise (it must stay lowercase). Commands are for a terminal; the password prompt is `-p`.

## A. Mask plaintext bank account numbers in old `SystemLog` rows (a WRITE, on `SystemLog` only)

Why: before today's fix `PUT /api/bank/accounts` wrote every changed value into the log, e.g.
`accountNumber: 50100123456789, name: HDFC Main`. `GET /api/logs` shows these rows to every firm member. The route now writes
field names only, so no NEW row leaks; the OLD rows still do.

Why an UPDATE is acceptable here: `SystemLog` is an audit trail, not the ledger. The ledger (`LedgerEntry`) is never edited,
because money must tie. This UPDATE changes only the free-text `details`; `userId`, `firmId`, `action`, `entity`, `entityId`
and `createdAt` are untouched, so who did what, to which account, and when is fully preserved. Only the leaked value goes.

The route writes `entity = 'bank_account'` (with an underscore) and `action = 'update'`. Old rows are `key: value` pairs joined
by `, ` in the order of the fields sent.

1. **Back up:** `mysqldump -uroot -p omerp SystemLog > systemlog_backup_before_mask.sql`
   Good: no error, file is non-empty. **STOP** if it is empty.
2. **Find the affected rows (read-only):**
   `mysql -uroot -p omerp -e "SELECT id, firmId, userId, entityId, createdAt, details FROM SystemLog WHERE entity='bank_account' AND action='update' AND details LIKE '%accountNumber:%' ORDER BY createdAt;"`
   Good: zero or more rows, each showing a number after `accountNumber:`. Note the count. If zero, you are done: skip to 6.
   **STOP** and call me if any row appears that is NOT a bank-account edit, or if `entity` values look different (then the
   filter is wrong; do not widen it yourself).
3. **Count only:** `mysql -uroot -p omerp -e "SELECT COUNT(*) FROM SystemLog WHERE entity='bank_account' AND action='update' AND details LIKE '%accountNumber:%';"`
   Good: the same number as step 2.
4. **Mask them.** The exact list of fields cannot be recovered safely in SQL (values may contain commas), so the whole `details`
   text of these rows is replaced with the same field-name style the fixed route uses, minus the field list:
   `mysql -uroot -p omerp -e "UPDATE SystemLog SET details='changed bank account fields (account number removed from this old log line)' WHERE entity='bank_account' AND action='update' AND details LIKE '%accountNumber:%';"`
   Good: `mysql` prints nothing and exits normally. **STOP** if it prints an error.
5. **Prove it:** re-run the step 3 query. Good: `0`. Then check nothing else moved:
   `mysql -uroot -p omerp -e "SELECT COUNT(*) FROM SystemLog WHERE details='changed bank account fields (account number removed from this old log line)';"`
   Good: equals the step 2 count.
6. Old `bank_account` rows with `action='create'` never held the account number (they log name, bank, opening balance): no action.

**Undo:** the step 1 dump holds the old rows. Restoring it would put the plaintext numbers back, so only do it if you
masked the wrong rows.

## B. Do any loans, udhaar or ledger rows point at ANOTHER firm's customer? (READ-ONLY, no UPDATE)

Why: `POST`/`PUT /api/loans` accepted a `customerId` belonging to a different firm until today, when `foreignCustomer()` started
refusing it on both write paths (Udhaar was fixed earlier). Anything saved before that may be mis-attributed.

These queries only SELECT. **There is deliberately no UPDATE for this one.** A row that shows up is a business question
(re-point it to the right customer of that firm, or blank the party) that only you can answer, row by row. The job of these
queries is to tell you whether there are any at all. Expected result on a clean database: 0 rows each.

1. **Loans:**
   `mysql -uroot -p omerp -e "SELECT l.id, l.loanNo, l.firmId AS loanFirm, c.id AS customerId, c.firmId AS customerFirm, c.firstName, l.principalAmount FROM Loan l JOIN Customer c ON c.id=l.customerId WHERE c.firmId <> l.firmId;"`
2. **Udhaar:**
   `mysql -uroot -p omerp -e "SELECT u.id, u.firmId AS udhaarFirm, c.id AS customerId, c.firmId AS customerFirm, c.firstName FROM Udhaar u JOIN Customer c ON c.id=u.customerId WHERE c.firmId <> u.firmId;"`
3. **Ledger:**
   `mysql -uroot -p omerp -e "SELECT e.id, e.firmId AS entryFirm, c.id AS customerId, c.firmId AS customerFirm, e.type, e.debit, e.credit, e.date FROM LedgerEntry e JOIN Customer c ON c.id=e.customerId WHERE c.firmId <> e.firmId;"`
   Good for all three: an empty result (no rows, just the shell prompt). **Do not edit `LedgerEntry` in any case** - if step 3
   returns rows, send them to me; a ledger correction is made by a reversing voucher, never an UPDATE.
   **STOP** on any rows: copy the output to me and change nothing.
   (Rows with a NULL `customerId` are skipped by the JOIN, correctly: no party, nothing to mis-attribute.)

## C. Do any customer rows hold a photo or KYC link the new rules would now refuse? (READ-ONLY)

Why: `photoUrl`/`photoUrl2-4` on a customer are now accepted only as an embedded `data:image/...` (png/jpeg/webp), and
`kycDocUrl` only as `https://`. Before today both were free text, so they accepted `javascript:`, an off-site
`http://` link and an unbounded string — and the customer card renders `photoUrl` in an `<img>`, which fetches on open
without a click. The new rule is NOT retroactive: an old row keeps whatever it holds.

The one practical consequence: a customer whose stored `kycDocUrl` is an old `http://` link can no longer be SAVED from
the edit dialog (the form sends the field back unchanged and the boundary refuses it). Clean or clear the value and the
row edits normally again. The newest committed dump has these columns NULL on every row, so this may well return nothing.

1. **Find them (read-only):**
   `mysql -uroot -p omerp -e "SELECT id, code, firstName, LEFT(photoUrl,40) AS photo, LEFT(kycDocUrl,60) AS kycLink FROM Customer WHERE (photoUrl IS NOT NULL AND photoUrl NOT LIKE 'data:image/%') OR (kycDocUrl IS NOT NULL AND kycDocUrl NOT LIKE 'https://%');"`
   Good: an empty result — nothing to do, and no customer will hit the save problem above.
   **STOP** and send me the output if any row appears, especially an off-site `http://` photo: that one is fetched every
   time the card is opened, so it tells a third party who is looking at which customer and when.
2. There is deliberately no UPDATE here. Clearing a customer's photo or KYC link is a records decision, not a cleanup:
   you may want to re-take the photo or re-paste an https link rather than blank the column.


---

# PART 3 - REQUIRED BEFORE THE "OTHER" METAL FEATURE WORKS (owner-run, a schema WRITE on live `omerp`)

**Until you run this, any screen that reads `StockItem` or `InvoiceItem` will fail with "Unknown column 'metalName'".**
This is not an optional nice-to-have: it has to be run before the Other-metal feature (platinum / panchdhatu / brass) is
usable, and the code that reads the new column is already in the tree. Run it **together with** the
`20260928103550_invoice_item_stones` migration that is already waiting in Part 1 of this file: `migrate deploy` applies every
pending migration in order, so one run does both. If you have not done Part 1 steps 1-6 yet (the two `resolve --applied`
lines), do those first, or `migrate deploy` will try to re-run migrations whose columns already exist.

What it does: `20261001103000_other_metal_name` adds one nullable column, `metalName`, to `StockItem` and to `InvoiceItem`.
Nothing is dropped, changed or backfilled; every existing row simply has NULL there. Nothing here was run by anyone.
Open a terminal in `E:\omjwellery\omjwellery`; one command each.

1. **Stop the dev server** (Ctrl+C in its window).
   Good: the window returns to a prompt. **STOP** if you cannot stop it: do not continue while the app is writing.
2. **Check the database name:** open `.env` and read `DATABASE_URL`. Do not retype it.
   Good: it ends in `/omerp` in **lowercase** (worklog Task 46: capital letters make Prisma blind to every foreign key).
   **STOP** if any letter is a capital.
3. **Back up:** `mysqldump -uroot -p --routines omerp > omerp_backup_before_other_metal.sql`
   Good: password prompt, no error, file is several MB. **STOP** if the file is empty or an error shows.
4. **See the current state:** `npx prisma migrate status`
   Good: "Following migrations have not yet been applied:" listing `20260928103550_invoice_item_stones`,
   `20260930120000_invoice_old_metal_rows` (unless you already applied it) and `20261001103000_other_metal_name`.
   **STOP** if it says "failed", "Drift detected", or asks to reset. Never answer yes to a reset.
5. **Apply:** `npx prisma migrate deploy`
   Good: "Applying migration ..." for each pending name, then "All migrations have been successfully applied."
   **STOP** on any error, especially "Duplicate column name": do not retry, send me the full output.
6. **Verify StockItem:** `mysql -uroot -p omerp -e "SHOW COLUMNS FROM StockItem LIKE 'metalName';"`
   Good: one row, `metalName`, `varchar(191)`, `YES` under Null. **STOP** if it returns nothing.
7. **Verify InvoiceItem:** `mysql -uroot -p omerp -e "SHOW COLUMNS FROM InvoiceItem LIKE 'metalName';"`
   Good: one row, `metalName`, `varchar(191)`, `YES` under Null. **STOP** if it returns nothing.
8. **Rebuild the Prisma client:** `npx prisma generate`
   Good: "Generated Prisma Client ... in Xms". This touches no database — it only rewrites files under `node_modules`.
   It has to happen **here**, with the dev server stopped (step 1): while the server runs it holds
   `query_engine-windows.dll.node` open and the command fails with `EPERM ... rename`, leaving the client
   HALF-updated (the TypeScript types know `metalName`, the engine's own copy of the schema does not).
   **STOP** if it still says `EPERM`: something else is holding the file — close any other terminal, editor
   task or Electron window running this app, then run it again.
9. **Restart the dev server** (`npm run dev`) and open Stock and a Sell form.
   Good: both load with no "Unknown column" error.

**Undo:** restore the dump: `mysql -uroot -p omerp < omerp_backup_before_other_metal.sql` (the database name stays lowercase
`omerp`). Any stock or invoice saved with an Other-metal name after step 5 is lost by the restore. Do NOT use `db:push`,
`db:migrate` or `db:reset` for any of this (the guard script refuses them on `omerp`, correctly).


---

# PART 4 - STOCK TALLY TABLES (owner-run, a schema WRITE on live `omerp`)

**Until you run this, the Stock Tally screen is the ONLY thing that fails** (its API answers with a clear message). Nothing else
in the app is affected: `20261019120000_stock_tally` adds two NEW tables (`StockTally`, `StockTallyScan`) and no column to any
existing table, so no existing read can break (the Part 3 failure came from a new *column*; a new table cannot do that).
Nothing here was run by anyone. Open a terminal in `E:\omjwellery\omjwellery`.

1. **Back up first:** the `mysqldump` command in Part 1 step 2 (use a new file name, e.g. `omerp_backup_before_tally.sql`).
   Good: no error, file is several MB. **STOP** if it is empty.
2. **Apply it with the SQL directly. This is the only path that works today** - two commands:
   - `mysql -uroot -p omerp < prisma/migrations/20261019120000_stock_tally/migration.sql`
   - then `npx prisma migrate resolve --applied 20261019120000_stock_tally`
   Good: no output from `mysql`; then `Migration 20261019120000_stock_tally marked as applied.`

   **`npx prisma migrate deploy` will NOT work and is not an alternative here.** Checked against live `omerp` on
   19 Oct 2026: THREE migrations are recorded as *failed* in `_prisma_migrations` - `20260914230000_scheme_subscriptions`,
   `20260918090000_udhaar_interest_emi` and `20260928103550_invoice_item_stones` - so `deploy` refuses to run anything at
   all until they are resolved. The history is mis-marked, not the data: `InvoiceItem.stones` exists as a column in the
   database, which is one of the three. That drift is what Parts 1-3 are about and it is a separate job from this one.
   Once (and only once) Parts 1-3 are genuinely finished, `deploy` becomes usable again for FUTURE migrations - but by then
   this one is already applied and marked, so never run `deploy` for this name. Do not mix the two routes.
3. **Verify:** `mysql -uroot -p omerp -e "SHOW TABLES LIKE 'StockTally%';"`
   Good: two rows, `StockTally` and `StockTallyScan`. **STOP** if it errors "already exists" - do not retry, send me the output.
4. `npx prisma generate` with the dev server stopped (same EPERM caveat as Part 3 step 8), then restart the server.

**Undo:** `mysql -uroot -p omerp -e "DROP TABLE StockTallyScan; DROP TABLE StockTally;"` - safe only because nothing else
references them; any tally data is lost. Or restore the step 1 dump.
