-- Scheme subscriptions: frozen enrolment terms + installment identity.
-- Additive only. No existing column is touched, no data is moved.

-- AlterTable
ALTER TABLE `SchemeEntry` ADD COLUMN `bonusAmount` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `closedDate` DATETIME(3) NULL,
    ADD COLUMN `earlyExitDeduction` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `invoiceId` VARCHAR(191) NULL,
    ADD COLUMN `maturityDate` DATETIME(3) NULL,
    ADD COLUMN `totalInstallments` INTEGER NOT NULL DEFAULT 11;

-- AlterTable
ALTER TABLE `SchemeInstallment` ADD COLUMN `voucherId` VARCHAR(191) NULL;

-- CreateIndex: one row per (entry, installmentNo) - the receipt endpoint relies on this to reject
-- a duplicate installment number instead of silently renumbering it.
CREATE UNIQUE INDEX `SchemeInstallment_entryId_installmentNo_key` ON `SchemeInstallment`(`entryId`, `installmentNo`);
