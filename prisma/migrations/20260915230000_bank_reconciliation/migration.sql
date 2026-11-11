-- be-platform-data: bank reconciliation — named bank accounts, cheque clearing distinct from
-- transaction date, and an unmutated CSV-statement reconciliation record. See prisma/schema.prisma
-- for the full design note above the BankAccount/BankTransaction/BankStatementLine models.
--
-- Purely additive: three new tables, no existing table touched, no backfill (there is no prior
-- data for something that didn't exist). accountId/toBankAccountId/matchedVoucherId are bare
-- VARCHAR pointers with no FK constraint, matching LedgerEntry.accountId/invoiceId/loanId's own
-- existing convention — see the schema file header for why.
--
-- mysqldump taken immediately before this migration:
--   scratchpad/omerp_backup_20260915124807.sql

-- CreateTable
CREATE TABLE `BankAccount` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `bankName` VARCHAR(191) NULL,
    `accountNumber` VARCHAR(191) NULL,
    `ifsc` VARCHAR(191) NULL,
    `branch` VARCHAR(191) NULL,
    `openingBalance` DOUBLE NOT NULL DEFAULT 0,
    `openingDate` DATETIME(3) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BankAccount_firmId_idx`(`firmId`),
    UNIQUE INDEX `BankAccount_firmId_name_key`(`firmId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BankTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `bankAccountId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `counterAccountName` VARCHAR(191) NULL,
    `toBankAccountId` VARCHAR(191) NULL,
    `amount` DOUBLE NOT NULL,
    `transactionDate` DATETIME(3) NOT NULL,
    `clearingDate` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'cleared',
    `chequeNumber` VARCHAR(191) NULL,
    `narration` TEXT NULL,
    `voucherId` VARCHAR(191) NULL,
    `clearVoucherId` VARCHAR(191) NULL,
    `reversalVoucherId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BankTransaction_firmId_bankAccountId_idx`(`firmId`, `bankAccountId`),
    INDEX `BankTransaction_firmId_status_idx`(`firmId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BankStatementLine` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `bankAccountId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `description` TEXT NOT NULL,
    `debit` DOUBLE NOT NULL DEFAULT 0,
    `credit` DOUBLE NOT NULL DEFAULT 0,
    `reference` VARCHAR(191) NULL,
    `matchedVoucherId` VARCHAR(191) NULL,
    `matchedAt` DATETIME(3) NULL,
    `matchedBy` VARCHAR(191) NULL,
    `importBatch` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BankStatementLine_firmId_bankAccountId_date_idx`(`firmId`, `bankAccountId`, `date`),
    INDEX `BankStatementLine_firmId_matchedVoucherId_idx`(`firmId`, `matchedVoucherId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `BankAccount` ADD CONSTRAINT `BankAccount_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankTransaction` ADD CONSTRAINT `BankTransaction_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankTransaction` ADD CONSTRAINT `BankTransaction_bankAccountId_fkey` FOREIGN KEY (`bankAccountId`) REFERENCES `BankAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankStatementLine` ADD CONSTRAINT `BankStatementLine_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankStatementLine` ADD CONSTRAINT `BankStatementLine_bankAccountId_fkey` FOREIGN KEY (`bankAccountId`) REFERENCES `BankAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
