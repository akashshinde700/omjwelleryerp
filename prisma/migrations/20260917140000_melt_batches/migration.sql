-- be-inventory: melting/refining workflow (owner brief item 2). Purely additive — two new tables,
-- no column changes on StockItem (its `status` column already accepts any string; 'in_melt' /
-- 'melted' are new documented values, not a schema change).
-- mysqldump taken immediately before this migration:
--   scratchpad/omerp_backup_20260917110730.sql
-- Generated with `prisma migrate diff --from-url <omerp> --to-schema-datamodel prisma/schema.prisma
-- --script` against the live schema, then applied with `migrate deploy` (never migrate dev/reset).

-- CreateTable
CREATE TABLE `MeltBatch` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `lotNumber` VARCHAR(191) NOT NULL,
    `metal` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'assigned',
    `fineWeightIn` DOUBLE NOT NULL DEFAULT 0,
    `grossWeightIn` DOUBLE NOT NULL DEFAULT 0,
    `recoveredGrossWeight` DOUBLE NULL,
    `recoveredPurity` DOUBLE NULL,
    `recoveredFineWeight` DOUBLE NULL,
    `lossFineWeight` DOUBLE NULL,
    `metalRate` DOUBLE NULL,
    `lossValue` DOUBLE NULL,
    `resultItemId` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `assignedBy` VARCHAR(191) NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MeltBatch_resultItemId_key`(`resultItemId`),
    INDEX `MeltBatch_firmId_status_idx`(`firmId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MeltBatchItem` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `fineWeight` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MeltBatchItem_batchId_idx`(`batchId`),
    INDEX `MeltBatchItem_itemId_idx`(`itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MeltBatch` ADD CONSTRAINT `MeltBatch_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MeltBatch` ADD CONSTRAINT `MeltBatch_resultItemId_fkey` FOREIGN KEY (`resultItemId`) REFERENCES `StockItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MeltBatchItem` ADD CONSTRAINT `MeltBatchItem_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `MeltBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MeltBatchItem` ADD CONSTRAINT `MeltBatchItem_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `StockItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
