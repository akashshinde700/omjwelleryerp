-- Two index changes on LedgerEntry, both measured on omerp_perf_test (50,000 legs, one firm,
-- three years of dates). Neither changes a query, a result or a row.
--
-- 1. [firmId, voucherId] -> [voucherId].
--    Two indexes sharing the `firmId` prefix are indistinguishable to the optimizer once one firm
--    owns most of the table, and it was picking firmId_voucherId for the statement and day-book
--    queries - an index that serves neither their date range nor their GROUP BY:
--      statements period GROUP BY   190ms -> 60ms   (plan was `Using where; Using temporary`)
--      statements opening GROUP BY  240ms -> 90ms
--      day book page, 200 legs      170ms -> 80ms   (plan was `Using filesort`)
--    The voucher lookup that index existed for is `WHERE firmId = ? AND voucherId = ?`; a voucherId
--    is a cuid with two to six legs behind it, so voucherId alone still answers it in `ref`, rows=2,
--    0ms. With the decoy gone a small tenant's statement query takes `range` on [firmId, date]
--    (verified on a second firm) - the optimizer can finally choose per tenant.
--
-- 2. New index on reversalOfId. "Has this voucher already been reversed?" runs on every reversal,
--    invoice delete and expense delete (src/lib/ledger.ts:195) and had no index at all - it scanned
--    the firm's entire ledger: 300ms at 50,000 legs, 0ms with the index.
DROP INDEX `LedgerEntry_firmId_voucherId_idx` ON `LedgerEntry`;
CREATE INDEX `LedgerEntry_voucherId_idx` ON `LedgerEntry`(`voucherId`);
CREATE INDEX `LedgerEntry_reversalOfId_idx` ON `LedgerEntry`(`reversalOfId`);
