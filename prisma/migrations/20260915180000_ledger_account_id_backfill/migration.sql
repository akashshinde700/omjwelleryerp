-- be-accounting: populate LedgerEntry.accountId, and repair the chart-of-accounts drift that made
-- the name-based join miss.
--
-- LedgerEntry.accountId has existed as a column since the schema was written and was NEVER once
-- populated: every leg addressed its account by the accountName STRING. The statement layer had to
-- re-match on that string, so a seeded account whose name had drifted from the name the posting
-- layer writes showed Dr 0 / Cr 0 while its money appeared on a second, phantom row. Concretely on
-- omerp: seeded `5001 Purchase` vs posted `Purchases`.
--
-- Three drifted seed rows are corrected by NAME/CODE only. No ledger row's debit, credit, date or
-- accountName is rewritten anywhere in this file — posted legs stay immutable.
--   `Purchase`      -> `Purchases`   (name the posting layer has always written)
--   `Loans Given`   2001 -> 1005     (2001 is the liability block; Loans Given is an asset)
--   `Rent Expense`  5002 -> 5101     (5002 is Old Gold Purchases; expense categories start 5101)
--   `Salary Expense`5003 -> 5102
--
-- Verified against the live database before writing this file:
--   SELECT COUNT(*) FROM LedgerEntry                       -> 6 rows
--   SELECT COUNT(*) FROM LedgerEntry WHERE accountId IS NOT NULL -> 0 rows
--   SELECT COUNT(*) FROM Account                           -> 9 rows (all on firm JBS)
-- Take a mysqldump immediately before `prisma migrate deploy`. Never `migrate dev` / `db push`
-- against omerp. Re-runnable: every statement is guarded and idempotent.

-- 1. Rename/recode, each guarded by a self-join so it can never collide with an account the firm
--    already has under the target name/code.
UPDATE `Account` a
  LEFT JOIN `Account` b ON b.`firmId` = a.`firmId` AND b.`name` = 'Purchases'
  SET a.`name` = 'Purchases', a.`code` = '5001'
  WHERE a.`name` = 'Purchase' AND b.`id` IS NULL;

UPDATE `Account` a
  LEFT JOIN `Account` b ON b.`firmId` = a.`firmId` AND b.`code` = '1005'
  SET a.`code` = '1005'
  WHERE a.`name` = 'Loans Given' AND a.`code` = '2001' AND b.`id` IS NULL;

UPDATE `Account` a
  LEFT JOIN `Account` b ON b.`firmId` = a.`firmId` AND b.`code` = '5101'
  SET a.`code` = '5101'
  WHERE a.`name` = 'Rent Expense' AND a.`code` = '5002' AND b.`id` IS NULL;

UPDATE `Account` a
  LEFT JOIN `Account` b ON b.`firmId` = a.`firmId` AND b.`code` = '5102'
  SET a.`code` = '5102'
  WHERE a.`name` = 'Salary Expense' AND a.`code` = '5003' AND b.`id` IS NULL;

-- 2. Backfill accountId by (firmId, accountName). firmId is in the join, so a leg can never be
--    pointed at another firm's account. Legs whose name has no Account row stay NULL — that is the
--    documented fallback (src/lib/accounting.ts resolves those against CHART_OF_ACCOUNTS by name).
UPDATE `LedgerEntry` e
  JOIN `Account` a ON a.`firmId` = e.`firmId` AND a.`name` = e.`accountName`
  SET e.`accountId` = a.`id`
  WHERE e.`accountId` IS NULL;
