-- Additive only: one new nullable column so an InvoiceItem line can snapshot the stones/diamonds
-- sold on it (the Sell form's stone sub-grid, mirroring stock-add.tsx's). JSON text, not a child
-- table — same reasoning as InvoiceItem.huid and Loan.interestConvention; see the comment on
-- InvoiceItem.stones in schema.prisma. No existing column is touched and nothing is backfilled.
-- AlterTable
ALTER TABLE `InvoiceItem` ADD COLUMN `stones` TEXT NULL;
