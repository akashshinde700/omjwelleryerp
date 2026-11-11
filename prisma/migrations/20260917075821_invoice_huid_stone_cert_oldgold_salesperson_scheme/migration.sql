-- AlterTable
ALTER TABLE `Invoice` ADD COLUMN `counterName` VARCHAR(191) NULL,
    ADD COLUMN `oldGoldPurity` VARCHAR(191) NULL,
    ADD COLUMN `oldGoldRate` DOUBLE NULL,
    ADD COLUMN `salesPersonId` VARCHAR(191) NULL,
    ADD COLUMN `salesPersonName` VARCHAR(191) NULL,
    ADD COLUMN `schemeEntryId` VARCHAR(191) NULL,
    ADD COLUMN `staffCode` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `InvoiceItem` ADD COLUMN `huid` VARCHAR(191) NULL,
    ADD COLUMN `stoneCertNo` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Invoice_salesPersonId_idx` ON `Invoice`(`salesPersonId`);

-- CreateIndex
CREATE INDEX `Invoice_schemeEntryId_idx` ON `Invoice`(`schemeEntryId`);

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_salesPersonId_fkey` FOREIGN KEY (`salesPersonId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

