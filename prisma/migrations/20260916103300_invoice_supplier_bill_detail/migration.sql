-- AlterTable
ALTER TABLE `Invoice` ADD COLUMN `billingName` VARCHAR(191) NULL,
    ADD COLUMN `paymentTerms` VARCHAR(191) NULL,
    ADD COLUMN `supplierBillDate` DATETIME(3) NULL,
    ADD COLUMN `supplierBillNo` VARCHAR(191) NULL,
    ADD COLUMN `supplierDueDate` DATETIME(3) NULL;

