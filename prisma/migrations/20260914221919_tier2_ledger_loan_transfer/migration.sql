-- Tier 2: LedgerEntry vouchers/reversals, LoanTransaction real columns, StockTransfer FK to StockItem.
-- All columns additive: nullable, or NOT NULL with a DEFAULT / verified-empty table.
-- Verified before writing this migration:
--   SELECT COUNT(*) FROM LedgerEntry     -> 492 rows (voucherId/reversalOfId/userId added nullable, no backfill)
--   SELECT COUNT(*) FROM LoanTransaction -> 0 rows   (firmId added NOT NULL, safe on empty table)
--   SELECT COUNT(*) FROM StockTransfer   -> 0 rows   (itemId FK added, safe on empty table)

-- AlterTable: LedgerEntry — n-legged vouchers and reversals
ALTER TABLE `LedgerEntry`
  ADD COLUMN `voucherId` VARCHAR(191) NULL,
  ADD COLUMN `reversalOfId` VARCHAR(191) NULL,
  ADD COLUMN `userId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `LedgerEntry_firmId_voucherId_idx` ON `LedgerEntry`(`firmId`, `voucherId`);

-- AlterTable: LoanTransaction — real columns for gold-loan part payments (table verified empty)
ALTER TABLE `LoanTransaction`
  ADD COLUMN `firmId` VARCHAR(191) NOT NULL,
  ADD COLUMN `userId` VARCHAR(191) NULL,
  ADD COLUMN `principalComponent` DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `interestComponent` DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `discount` DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `paymentMode` VARCHAR(191) NOT NULL DEFAULT 'cash',
  ADD COLUMN `reversalOfId` VARCHAR(191) NULL,
  ADD COLUMN `voucherId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `LoanTransaction_firmId_idx` ON `LoanTransaction`(`firmId`);

-- AlterTable: StockTransfer — real FK to StockItem, approval trail, source firm (table verified empty)
ALTER TABLE `StockTransfer`
  ADD COLUMN `itemId` VARCHAR(191) NULL,
  ADD COLUMN `userId` VARCHAR(191) NULL,
  ADD COLUMN `approvedBy` VARCHAR(191) NULL,
  ADD COLUMN `approvedAt` DATETIME(3) NULL,
  ADD COLUMN `fromFirmId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `StockTransfer_firmId_status_idx` ON `StockTransfer`(`firmId`, `status`);

-- CreateIndex
CREATE INDEX `StockTransfer_itemId_idx` ON `StockTransfer`(`itemId`);

-- AddForeignKey
ALTER TABLE `StockTransfer` ADD CONSTRAINT `StockTransfer_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `StockItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
