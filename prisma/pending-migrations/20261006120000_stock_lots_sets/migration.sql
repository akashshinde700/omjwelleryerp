-- Stock lots, pieces and sets. ADDITIVE ONLY: six new columns on StockItem, two indexes, one
-- self-referencing foreign key. No existing column is altered, dropped or rewritten.
--   lotShape / lotPieceCount / lotId : a wholesale lot (uniform or mixed, count optional) and the
--                                      lineage of each piece taken out of it
--   piecesPerUnit                    : physical pieces in one saleable unit (pair = 2); every
--                                      existing row becomes 1, which is what it always meant
--   orphanedAt                       : a single was sold out of a set; this row is the leftover
--   taggedAt                         : label printed (NULL = never; nothing reads it yet)
-- Remaining weight/pieces/cost of a lot are NOT stored: they are derived from its pieces
-- (see the comment on StockItem.stockType in schema.prisma).
-- AlterTable
ALTER TABLE `StockItem` ADD COLUMN `lotId` VARCHAR(191) NULL,
    ADD COLUMN `lotPieceCount` INTEGER NULL,
    ADD COLUMN `lotShape` VARCHAR(191) NULL,
    ADD COLUMN `orphanedAt` DATETIME(3) NULL,
    ADD COLUMN `piecesPerUnit` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `taggedAt` DATETIME(3) NULL;
-- CreateIndex
CREATE INDEX `StockItem_firmId_stockType_category_status_idx` ON `StockItem`(`firmId`, `stockType`, `category`, `status`);
-- CreateIndex
CREATE INDEX `StockItem_lotId_status_idx` ON `StockItem`(`lotId`, `status`);
-- AddForeignKey
ALTER TABLE `StockItem` ADD CONSTRAINT `StockItem_lotId_fkey` FOREIGN KEY (`lotId`) REFERENCES `StockItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: a wholesale row that predates lots was handled by proportional split, which is exactly
-- the "uniform" behaviour. Zero rows in the live omerp; keeps other databases consistent.
UPDATE `StockItem` SET `lotShape` = 'uniform' WHERE `stockType` = 'wholesale';
