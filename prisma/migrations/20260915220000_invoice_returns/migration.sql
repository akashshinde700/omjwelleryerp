-- be-sales-gst: sale/purchase returns as a first-class document series (credit note, s.34 CGST
-- Act) instead of the dead `Invoice.status = 'returned'` marker. See
-- src/app/api/invoices/return/route.ts.
--
-- Purely additive, all nullable, no backfill and no data loss: an invoice created before this
-- migration simply has NULL in these columns, which is exactly correct — it was never returned.
--
-- NOT YET APPLIED to `omerp` (or any other live database) as of this commit: this sandbox's
-- safety controls refuse both `prisma migrate`/`db push` against a non-disposable database name
-- and the `ALLOW_DESTRUCTIVE_DB=1` override, and also refuse a raw DB connection to introspect or
-- alter it directly. A human with real database credentials must run
--   npx prisma migrate deploy
-- (or `npm run db:push` with the guard's override) before src/app/api/invoices/return/route.ts is
-- usable — until then it will fail at the Prisma Client layer with "Unknown argument
-- returnOfInvoiceId/returnOfItemId", not silently misbehave. The generated Prisma Client in this
-- checkout was deliberately left NOT regenerated against these fields (see worklog) so the shared
-- dev server at :3002 keeps working against the live, unmigrated schema in the meantime.
ALTER TABLE `Invoice` ADD COLUMN `returnOfInvoiceId` VARCHAR(191) NULL;
ALTER TABLE `Invoice` ADD COLUMN `returnReason` TEXT NULL;
CREATE INDEX `Invoice_returnOfInvoiceId_idx` ON `Invoice`(`returnOfInvoiceId`);

ALTER TABLE `InvoiceItem` ADD COLUMN `returnOfItemId` VARCHAR(191) NULL;
CREATE INDEX `InvoiceItem_returnOfItemId_idx` ON `InvoiceItem`(`returnOfItemId`);
