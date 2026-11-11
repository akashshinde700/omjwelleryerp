-- Udhaar interest and installment-plan support, plus the payments ledger against an udhaar.
-- Every new Udhaar column is NULLABLE with no default, so every existing row reads back exactly
-- as it does today: `interestRate IS NULL` means "no interest, ever" - it does not start accruing
-- because a column appeared. UdhaarPayment is a brand new, empty table, so it changes nothing for
-- existing data either.

-- Interest terms. NULL rate = no interest (every row written before today, forever).
ALTER TABLE `Udhaar` ADD COLUMN `interestRate` DOUBLE NULL;
ALTER TABLE `Udhaar` ADD COLUMN `interestType` VARCHAR(191) NULL;
ALTER TABLE `Udhaar` ADD COLUMN `interestStartDate` DATETIME(3) NULL;
ALTER TABLE `Udhaar` ADD COLUMN `interestEndDate` DATETIME(3) NULL;
ALTER TABLE `Udhaar` ADD COLUMN `interestConvention` TEXT NULL;

-- Installment plan. Both set together or both NULL.
ALTER TABLE `Udhaar` ADD COLUMN `emiIntervalDays` INTEGER NULL;
ALTER TABLE `Udhaar` ADD COLUMN `emiOccurrences` INTEGER NULL;

-- Dated receipts against an Udhaar. Mirrors LoanTransaction's shape so deriveLoan() can replay
-- these rows with no adapter. No `discount` column: udhaar receipts take no rebate in v1.
CREATE TABLE `UdhaarPayment` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `udhaarId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `amount` DOUBLE NOT NULL DEFAULT 0,
    `type` VARCHAR(191) NOT NULL DEFAULT 'part_payment',
    -- The split THAT WAS POSTED, kept because it is history, not a balance: these are the exact
    -- figures that became this receipt's two credit legs. Defaulted, so the column is additive.
    `interestComponent` DOUBLE NOT NULL DEFAULT 0,
    `principalComponent` DOUBLE NOT NULL DEFAULT 0,
    `paymentMode` VARCHAR(191) NOT NULL DEFAULT 'cash',
    `note` TEXT NULL,
    `voucherId` VARCHAR(191) NULL,
    `reversalOfId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UdhaarPayment_udhaarId_date_idx`(`udhaarId`, `date`),
    INDEX `UdhaarPayment_firmId_date_idx`(`firmId`, `date`),
    INDEX `UdhaarPayment_firmId_voucherId_idx`(`firmId`, `voucherId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `UdhaarPayment` ADD CONSTRAINT `UdhaarPayment_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `UdhaarPayment` ADD CONSTRAINT `UdhaarPayment_udhaarId_fkey` FOREIGN KEY (`udhaarId`) REFERENCES `Udhaar`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
