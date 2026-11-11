-- be-lending: gold-loan lifecycle completion — auction/write-off settlement and topup advances.
--
-- Additive only: four NULLable columns on Loan. No data is rewritten, no column is dropped, no
-- index changes. LoanTransaction needs NO change — `type` is already a free string, so 'topup'
-- and 'auction' rows are storable as they stand.
--
-- Verified against the live database before writing this file (mysql -u root omerp):
--   SELECT COUNT(*) FROM Loan                                     -> 5 rows (A101..A105)
--   SELECT COUNT(*) FROM LoanTransaction                          -> 0 rows
--   SHOW COLUMNS FROM Loan LIKE 'auction%'                        -> Empty set
-- Take a mysqldump immediately before `prisma migrate deploy`. Never `migrate dev` / `db push`
-- against omerp.

ALTER TABLE `Loan`
  ADD COLUMN `auctionDate`    DATETIME(3) NULL,
  ADD COLUMN `auctionAmount`  DOUBLE NULL,
  ADD COLUMN `auctionCharges` DOUBLE NULL,
  ADD COLUMN `auctionSurplus` DOUBLE NULL;
