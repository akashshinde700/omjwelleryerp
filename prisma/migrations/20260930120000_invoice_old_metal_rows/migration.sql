-- Additive only: one new nullable column so an Invoice can snapshot a repeating set of old-metal
-- receive rows (gold/silver/alloy/stone). JSON text, not a child table — same reasoning as
-- InvoiceItem.stones; see the comment on Invoice.oldMetalRows in schema.prisma for the row shape.
-- No existing column is touched and nothing is backfilled: NULL on every pre-existing invoice.
-- AlterTable
ALTER TABLE `Invoice` ADD COLUMN `oldMetalRows` TEXT NULL;
