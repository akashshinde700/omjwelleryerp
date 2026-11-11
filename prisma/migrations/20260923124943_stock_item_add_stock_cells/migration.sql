-- Additive only: 15 new nullable StockItem columns for the oMunim Add Stock layout
-- (row B "OTHER INFO", row C "DETAILS"/"MARK UP"/"FFN WT", and the stone sub-grid).
-- No existing column is renamed, retyped or dropped, and nothing is backfilled — every
-- new column is optional and defaults to NULL for all existing rows.
--
-- NOTE: `prisma migrate dev --create-only` against a fresh scratch database also proposed
-- `ALTER TABLE customer DROP COLUMN masterPassword` here. That is pre-existing drift between
-- schema.prisma (which already has no masterPassword field) and the migration history (whose
-- 0_init still creates the column) — unrelated to this task and not something this migration
-- ships. Left for whoever owns that change to migrate deliberately, with its own backfill/
-- deprecation review, not folded silently into a stock-form migration.
-- AlterTable
ALTER TABLE `StockItem` ADD COLUMN `details` VARCHAR(191) NULL,
    ADD COLUMN `finalFineWeight` DOUBLE NULL,
    ADD COLUMN `markUp` DOUBLE NULL,
    ADD COLUMN `otherInfo` VARCHAR(191) NULL,
    ADD COLUMN `stoneClarity` VARCHAR(191) NULL,
    ADD COLUMN `stoneColorGrade` VARCHAR(191) NULL,
    ADD COLUMN `stoneGrossWeightCt` DOUBLE NULL,
    ADD COLUMN `stoneId` VARCHAR(191) NULL,
    ADD COLUMN `stoneName` VARCHAR(191) NULL,
    ADD COLUMN `stoneOtherInfo` VARCHAR(191) NULL,
    ADD COLUMN `stoneQty` DOUBLE NULL,
    ADD COLUMN `stoneRateCt` DOUBLE NULL,
    ADD COLUMN `stoneSellRateCt` DOUBLE NULL,
    ADD COLUMN `stoneShape` VARCHAR(191) NULL,
    ADD COLUMN `stoneSize` VARCHAR(191) NULL;
