-- Links a Repair job to the tax Invoice produced by POST /api/repairs/bill (SAC 9987 service
-- line). Nullable, additive column + unique index — no data touched. The unique index is also
-- the "billable only once" guard: the bill route claims a repair with an atomic
-- `UPDATE Repair SET invoiceId=? WHERE id=? AND invoiceId IS NULL` before creating the invoice.
ALTER TABLE `Repair` ADD COLUMN `invoiceId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Repair_invoiceId_key` ON `Repair`(`invoiceId`);
