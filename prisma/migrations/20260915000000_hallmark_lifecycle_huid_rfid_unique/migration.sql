-- be-inventory audit remediation, items 2 & 3.
-- Verified before writing this migration (mysql -u root omerp):
--   SELECT COUNT(*) FROM StockItem                                          -> 10 rows
--   duplicate (firmId, hallmarkUid) groups where hallmarkUid NOT NULL/''    -> 0
--   duplicate (firmId, rfidNo) groups where rfidNo NOT NULL/''              -> 0
--   rows with hallmarkUid = '' or rfidNo = ''                               -> 0
-- No duplicates existed, so the unique indexes below are safe to add without any renumber/delete.
-- MySQL null-safety verified directly: a UNIQUE KEY(a,b) table accepted two rows with the same a
-- and b = NULL without violation — NULLs do not collide, so items with no HUID/RFID (the common
-- case) are unaffected.
-- mysqldump taken immediately before this migration:
--   scratchpad/omerp_backup_20260914233611.sql (from the mysqldump run right before this file)

-- CreateTable
CREATE TABLE `HallmarkBatch` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `lotNumber` VARCHAR(191) NOT NULL,
    `centreName` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'sent',
    `note` TEXT NULL,
    `sentBy` VARCHAR(191) NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `HallmarkBatch_firmId_status_idx`(`firmId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HallmarkBatchItem` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'sent',
    `hallmarkUid` VARCHAR(191) NULL,
    `hallmarkingFee` DOUBLE NULL,
    `receivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `HallmarkBatchItem_batchId_idx`(`batchId`),
    INDEX `HallmarkBatchItem_itemId_idx`(`itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex (nullable-safe — see verification note above)
CREATE UNIQUE INDEX `StockItem_firmId_hallmarkUid_key` ON `StockItem`(`firmId`, `hallmarkUid`);

-- CreateIndex (nullable-safe — see verification note above)
CREATE UNIQUE INDEX `StockItem_firmId_rfidNo_key` ON `StockItem`(`firmId`, `rfidNo`);

-- AddForeignKey
ALTER TABLE `HallmarkBatch` ADD CONSTRAINT `HallmarkBatch_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HallmarkBatchItem` ADD CONSTRAINT `HallmarkBatchItem_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `HallmarkBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HallmarkBatchItem` ADD CONSTRAINT `HallmarkBatchItem_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `StockItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
