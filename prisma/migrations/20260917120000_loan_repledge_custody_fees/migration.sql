-- Re-pledge to a financier, physical custody, joint-loan reference and the two loan fees.
-- Every column is NULLABLE or carries a default, so every existing loan and every existing
-- LoanTransaction reads back exactly as it did: `stream` defaults to 'in' (the customer leg) and
-- `charges` to 0, which is what every row written before today means.

-- The financier leg's BASIS. The customer's loan stays our asset; this is the liability beside it.
ALTER TABLE `Loan` ADD COLUMN `transferDate` DATETIME(3) NULL;
ALTER TABLE `Loan` ADD COLUMN `transferPrincipal` DOUBLE NULL;
ALTER TABLE `Loan` ADD COLUMN `transferRate` DOUBLE NULL;
ALTER TABLE `Loan` ADD COLUMN `transferConvention` TEXT NULL;
ALTER TABLE `Loan` ADD COLUMN `transferStatus` VARCHAR(191) NULL;
ALTER TABLE `Loan` ADD COLUMN `transferRedeemedDate` DATETIME(3) NULL;
ALTER TABLE `Loan` ADD COLUMN `transferVoucherId` VARCHAR(191) NULL;

-- Physical custody of the ornaments.
ALTER TABLE `Loan` ADD COLUMN `packetNo` VARCHAR(191) NULL;
ALTER TABLE `Loan` ADD COLUMN `boxNo` VARCHAR(191) NULL;
ALTER TABLE `Loan` ADD COLUMN `lockerNo` VARCHAR(191) NULL;

-- Joint-loan register serial, and the processing fee deducted at disbursal.
ALTER TABLE `Loan` ADD COLUMN `jointLoanNo` VARCHAR(191) NULL;
ALTER TABLE `Loan` ADD COLUMN `processingFee` DOUBLE NULL;

CREATE INDEX `Loan_firmId_transferStatus_idx` ON `Loan`(`firmId`, `transferStatus`);

-- Which leg a transaction belongs to, and the custody charge collected with a receipt.
ALTER TABLE `LoanTransaction` ADD COLUMN `stream` VARCHAR(191) NOT NULL DEFAULT 'in';
ALTER TABLE `LoanTransaction` ADD COLUMN `charges` DOUBLE NOT NULL DEFAULT 0;
