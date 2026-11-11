-- Monotonic per-(firm,type) invoice-number counter — replaces deriving the next invoice
-- number from Invoice.count(), which races under concurrent POSTs and reissues numbers
-- after a soft-delete. Allocated with an atomic INSERT ... ON DUPLICATE KEY UPDATE
-- seq = seq + 1, in its own short transaction ahead of the main invoice write
-- (src/app/api/invoices/route.ts, allocateInvoiceNo()). Additive: new table, no data touched.
CREATE TABLE `InvoiceSequence` (
    `firmId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `seq` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`firmId`, `type`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
