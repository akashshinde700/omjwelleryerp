-- Additive only: one new nullable column on each of StockItem and InvoiceItem to hold the free-text
-- name of a metal that is neither gold nor silver (platinum / panchdhatu / brass), used only when
-- metalType = 'other'. InvoiceItem.metalName is a snapshot at the moment of sale, like huid.
-- No existing column is touched and nothing is backfilled: NULL on every pre-existing row.
-- AlterTable
ALTER TABLE `StockItem` ADD COLUMN `metalName` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `InvoiceItem` ADD COLUMN `metalName` VARCHAR(191) NULL;
