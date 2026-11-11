-- The interest convention that priced a loan, as JSON (src/lib/interest.ts).
-- NULL means the default convention, so every existing loan keeps the exact figures it had.
ALTER TABLE `Loan` ADD COLUMN `interestConvention` TEXT NULL;
