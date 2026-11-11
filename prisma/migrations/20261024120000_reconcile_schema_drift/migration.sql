-- Ensure the WHOLE schema (idempotent, additive only).
--
-- Why: the live database history did not come purely from `migrate deploy` (it was synced by other
-- means), so ANY table may lack ANY column, index or foreign key - including ones from migrations
-- that are recorded as applied. This migration makes the database match prisma/schema.prisma.
-- Generated from `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`.
--
-- Every statement is guarded (information_schema), so it is a no-op for whatever already exists.
-- Nothing is dropped, renamed or retyped. Customer.masterPassword (not in schema.prisma) is left alone.
-- Table names are PascalCase (case-sensitive MySQL on Linux); lookups use LOWER() for case-insensitive hosts.
--
-- Safety rules so that `migrate deploy` cannot fail on data:
--  1. ADD COLUMN of a NOT NULL column that has no schema default gets a safe DEFAULT (0, false, empty string,
--     or CURRENT_TIMESTAMP(3)) so it succeeds on a non-empty table under STRICT/NO_ZERO_DATE. Prisma
--     always supplies these values on write, so the extra DEFAULT is invisible at runtime. Tables created
--     by CREATE TABLE here keep the exact schema definition.
--  2. A UNIQUE index is created only if the table has no duplicate keys; otherwise it is skipped and the
--     statement result set shows a WARNING row (index not created, fix the duplicates, then re-run).
--  3. A foreign key is added only if the child table has no orphan rows; otherwise it is skipped with a
--     WARNING row.
-- Order: tables, columns, indexes, foreign keys.

-- ===== 1. Tables (40) =====

CREATE TABLE IF NOT EXISTS `User` (
    `id` VARCHAR(191) NOT NULL,
    `loginId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'staff',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `avatarUrl` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `biometricHash` VARCHAR(191) NULL,
    `permissions` TEXT NULL,
    `lastLoginAt` DATETIME(3) NULL,

    UNIQUE INDEX `User_loginId_key`(`loginId`),
    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Firm` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `legalName` VARCHAR(191) NULL,
    `gstin` VARCHAR(191) NULL,
    `pan` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `address` TEXT NULL,
    `city` VARCHAR(191) NULL,
    `state` VARCHAR(191) NULL,
    `pincode` VARCHAR(191) NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'INR',
    `gstEnabled` BOOLEAN NOT NULL DEFAULT true,
    `cgstRate` DOUBLE NOT NULL DEFAULT 1.5,
    `sgstRate` DOUBLE NOT NULL DEFAULT 1.5,
    `igstRate` DOUBLE NOT NULL DEFAULT 3.0,
    `hallmarking` BOOLEAN NOT NULL DEFAULT true,
    `logoUrl` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `razorpayKeyId` VARCHAR(191) NULL,
    `razorpayKeySecret` VARCHAR(191) NULL,
    `paytmMerchantId` VARCHAR(191) NULL,
    `paytmMerchantKey` VARCHAR(191) NULL,
    `phonepeMerchantId` VARCHAR(191) NULL,
    `phonepeSaltKey` VARCHAR(191) NULL,
    `weighingScalePort` VARCHAR(191) NULL,
    `weighingScaleBaud` INTEGER NOT NULL DEFAULT 9600,
    `biometricEnabled` BOOLEAN NOT NULL DEFAULT false,
    `loyaltyRate` DOUBLE NOT NULL DEFAULT 1.0,
    `eInvoiceEnabled` BOOLEAN NOT NULL DEFAULT false,
    `whatsappEnabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Firm_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `UserFirm` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'staff',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserFirm_firmId_idx`(`firmId`),
    UNIQUE INDEX `UserFirm_userId_firmId_key`(`userId`, `firmId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Customer` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'customer',
    `supplierType` VARCHAR(191) NULL,
    `title` VARCHAR(191) NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NULL,
    `fatherSpouse` VARCHAR(191) NULL,
    `fatherSpouseRel` VARCHAR(191) NULL,
    `motherName` VARCHAR(191) NULL,
    `spouseName` VARCHAR(191) NULL,
    `spouseDob` DATETIME(3) NULL,
    `gender` VARCHAR(191) NULL,
    `dob` DATETIME(3) NULL,
    `maritalStatus` VARCHAR(191) NULL,
    `anniversaryDate` DATETIME(3) NULL,
    `caste` VARCHAR(191) NULL,
    `qualification` VARCHAR(191) NULL,
    `pan` VARCHAR(191) NULL,
    `gstin` VARCHAR(191) NULL,
    `taxNo` VARCHAR(191) NULL,
    `aadhaar` VARCHAR(191) NULL,
    `aadhaarVerified` BOOLEAN NOT NULL DEFAULT false,
    `bankName` VARCHAR(191) NULL,
    `bankAccName` VARCHAR(191) NULL,
    `bankAccNumber` VARCHAR(191) NULL,
    `bankIfscCode` VARCHAR(191) NULL,
    `accountHeadId` VARCHAR(191) NULL,
    `occupation` VARCHAR(191) NULL,
    `monthlyIncome` VARCHAR(191) NULL,
    `creditLimit` DOUBLE NOT NULL DEFAULT 0,
    `openingBalance` DOUBLE NOT NULL DEFAULT 0,
    `balanceType` VARCHAR(191) NOT NULL DEFAULT 'debit',
    `cashBalance` DOUBLE NOT NULL DEFAULT 0,
    `cashBalanceType` VARCHAR(191) NULL,
    `goldWeightBal` DOUBLE NOT NULL DEFAULT 0,
    `goldWeightType` VARCHAR(191) NULL,
    `goldBalanceType` VARCHAR(191) NULL,
    `silverWeightBal` DOUBLE NOT NULL DEFAULT 0,
    `silverWeightType` VARCHAR(191) NULL,
    `silverBalanceType` VARCHAR(191) NULL,
    `nomineeName` VARCHAR(191) NULL,
    `nomineeRelation` VARCHAR(191) NULL,
    `designation` VARCHAR(191) NULL,
    `loginId` VARCHAR(191) NULL,
    `password` VARCHAR(191) NULL,
    `mobile` VARCHAR(191) NULL,
    `altMobile` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `wastagePercent` DOUBLE NULL,
    `wastageDays` INTEGER NULL,
    `wastageOccasion` VARCHAR(191) NULL,
    `reference` VARCHAR(191) NULL,
    `userGroup` VARCHAR(191) NULL,
    `shopName` VARCHAR(191) NULL,
    `shipFirstName` VARCHAR(191) NULL,
    `shipLastName` VARCHAR(191) NULL,
    `shipAddress` TEXT NULL,
    `shipGstin` VARCHAR(191) NULL,
    `shipPan` VARCHAR(191) NULL,
    `shipMobile` VARCHAR(191) NULL,
    `shipCity` VARCHAR(191) NULL,
    `shipState` VARCHAR(191) NULL,
    `country` VARCHAR(191) NULL DEFAULT 'India',
    `state` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `village` VARCHAR(191) NULL,
    `wardNo` VARCHAR(191) NULL,
    `tehsil` VARCHAR(191) NULL,
    `officeAddress` TEXT NULL,
    `address` TEXT NULL,
    `currAddress` TEXT NULL,
    `pincode` VARCHAR(191) NULL,
    `otherInfo` VARCHAR(191) NULL,
    `photoUrl` TEXT NULL,
    `photoUrl2` TEXT NULL,
    `photoUrl3` TEXT NULL,
    `photoUrl4` TEXT NULL,
    `fingerScanId` VARCHAR(191) NULL,
    `loyaltyPoints` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `kycDocType` VARCHAR(191) NULL,
    `kycDocNo` VARCHAR(191) NULL,
    `kycDocUrl` TEXT NULL,

    INDEX `Customer_firmId_type_idx`(`firmId`, `type`),
    INDEX `Customer_firmId_createdAt_idx`(`firmId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `StockItem` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `itemCode` VARCHAR(191) NULL,
    `barcode` VARCHAR(191) NULL,
    `hallmarkUid` VARCHAR(191) NULL,
    `category` VARCHAR(191) NOT NULL DEFAULT 'fine',
    `subType` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `metalType` VARCHAR(191) NULL,
    `metalName` VARCHAR(191) NULL,
    `metalRate` DOUBLE NULL,
    `gender` VARCHAR(191) NULL,
    `hsnCode` VARCHAR(191) NULL,
    `brand` VARCHAR(191) NULL,
    `seller` VARCHAR(191) NULL,
    `counter` VARCHAR(191) NULL,
    `bis` VARCHAR(191) NULL,
    `itemCategory` VARCHAR(191) NULL,
    `purity` VARCHAR(191) NULL,
    `purityPercent` DOUBLE NULL,
    `qty` INTEGER NOT NULL DEFAULT 1,
    `grossWeight` DOUBLE NOT NULL DEFAULT 0,
    `grossWeightUnit` VARCHAR(191) NULL,
    `lessWeight` DOUBLE NOT NULL DEFAULT 0,
    `lessWeightUnit` VARCHAR(191) NULL,
    `packetWeight` DOUBLE NOT NULL DEFAULT 0,
    `packetWeightUnit` VARCHAR(191) NULL,
    `netWeight` DOUBLE NOT NULL DEFAULT 0,
    `netWeightUnit` VARCHAR(191) NULL,
    `tagWeight` DOUBLE NOT NULL DEFAULT 0,
    `finalPurity` DOUBLE NULL,
    `finalWeight` DOUBLE NULL,
    `finalFineWeight` DOUBLE NULL,
    `labourCharge` DOUBLE NOT NULL DEFAULT 0,
    `makingCharge` DOUBLE NOT NULL DEFAULT 0,
    `makingType` VARCHAR(191) NULL,
    `wastagePercent` DOUBLE NULL,
    `stoneWeight` DOUBLE NULL,
    `stoneAmount` DOUBLE NULL,
    `mrp` DOUBLE NULL,
    `costPrice` DOUBLE NULL,
    `sellPrice` DOUBLE NULL,
    `photoUrl` TEXT NULL,
    `photoUrl2` TEXT NULL,
    `photoUrl3` TEXT NULL,
    `photoUrl4` TEXT NULL,
    `rfidNo` VARCHAR(191) NULL,
    `location` VARCHAR(191) NULL,
    `modelNo` VARCHAR(191) NULL,
    `length` VARCHAR(191) NULL,
    `color` VARCHAR(191) NULL,
    `size` VARCHAR(191) NULL,
    `shape` VARCHAR(191) NULL,
    `width` VARCHAR(191) NULL,
    `polish` VARCHAR(191) NULL,
    `spCode` VARCHAR(191) NULL,
    `salesPackage` VARCHAR(191) NULL,
    `expDate` DATETIME(3) NULL,
    `otherInfo` VARCHAR(191) NULL,
    `totalHallmarkCharges` DOUBLE NULL,
    `otherCharges` DOUBLE NULL,
    `otherChargesType` VARCHAR(191) NULL,
    `totalOtherCharges` DOUBLE NULL,
    `stockType` VARCHAR(191) NULL,
    `ecommStatus` VARCHAR(191) NULL,
    `jewellersAppStatus` VARCHAR(191) NULL,
    `totalTax` DOUBLE NULL,
    `details` VARCHAR(191) NULL,
    `markUp` DOUBLE NULL,
    `finalValuation` DOUBLE NULL,
    `fixedPriceStatus` VARCHAR(191) NULL,
    `customerWastage` DOUBLE NULL,
    `customerWastageWt` DOUBLE NULL,
    `valueAdded` DOUBLE NULL,
    `valuation` DOUBLE NULL,
    `makingCgstPercent` DOUBLE NULL,
    `makingCgstAmount` DOUBLE NULL,
    `makingSgstPercent` DOUBLE NULL,
    `makingSgstAmount` DOUBLE NULL,
    `makingIgstPercent` DOUBLE NULL,
    `makingIgstAmount` DOUBLE NULL,
    `priceCgstPercent` DOUBLE NULL,
    `priceCgstAmount` DOUBLE NULL,
    `priceSgstPercent` DOUBLE NULL,
    `priceSgstAmount` DOUBLE NULL,
    `priceIgstPercent` DOUBLE NULL,
    `priceIgstAmount` DOUBLE NULL,
    `packetDesc1` TEXT NULL,
    `packetQty1` DOUBLE NULL,
    `packetWt1` DOUBLE NULL,
    `packetTotalWt1` DOUBLE NULL,
    `packetDesc2` TEXT NULL,
    `packetQty2` DOUBLE NULL,
    `packetWt2` DOUBLE NULL,
    `packetTotalWt2` DOUBLE NULL,
    `packetDesc3` TEXT NULL,
    `packetQty3` DOUBLE NULL,
    `packetWt3` DOUBLE NULL,
    `packetTotalWt3` DOUBLE NULL,
    `packetDesc4` TEXT NULL,
    `packetQty4` DOUBLE NULL,
    `packetWt4` DOUBLE NULL,
    `packetTotalWt4` DOUBLE NULL,
    `packetDesc5` TEXT NULL,
    `packetQty5` DOUBLE NULL,
    `packetWt5` DOUBLE NULL,
    `packetTotalWt5` DOUBLE NULL,
    `labourQty1` DOUBLE NULL,
    `labourChrg1` DOUBLE NULL,
    `labourType1` VARCHAR(191) NULL,
    `labourTotal1` DOUBLE NULL,
    `labourQty2` DOUBLE NULL,
    `labourChrg2` DOUBLE NULL,
    `labourType2` VARCHAR(191) NULL,
    `labourTotal2` DOUBLE NULL,
    `labourQty3` DOUBLE NULL,
    `labourChrg3` DOUBLE NULL,
    `labourType3` VARCHAR(191) NULL,
    `labourTotal3` DOUBLE NULL,
    `labourQty4` DOUBLE NULL,
    `labourChrg4` DOUBLE NULL,
    `labourType4` VARCHAR(191) NULL,
    `labourTotal4` DOUBLE NULL,
    `labourQty5` DOUBLE NULL,
    `labourChrg5` DOUBLE NULL,
    `labourType5` VARCHAR(191) NULL,
    `labourTotal5` DOUBLE NULL,
    `totalLabourCharges` DOUBLE NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'available',
    `billDate` DATETIME(3) NULL,
    `mfgDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `diamondCertNo` VARCHAR(191) NULL,
    `diamondCertLab` VARCHAR(191) NULL,
    `diamondCertUrl` TEXT NULL,
    `stoneId` VARCHAR(191) NULL,
    `stoneName` VARCHAR(191) NULL,
    `stoneClarity` VARCHAR(191) NULL,
    `stoneColorGrade` VARCHAR(191) NULL,
    `stoneSize` VARCHAR(191) NULL,
    `stoneShape` VARCHAR(191) NULL,
    `stoneOtherInfo` VARCHAR(191) NULL,
    `stoneQty` DOUBLE NULL,
    `stoneGrossWeightCt` DOUBLE NULL,
    `stoneRateCt` DOUBLE NULL,
    `stoneSellRateCt` DOUBLE NULL,

    INDEX `StockItem_firmId_category_idx`(`firmId`, `category`),
    INDEX `StockItem_firmId_status_idx`(`firmId`, `status`),
    INDEX `StockItem_firmId_createdAt_idx`(`firmId`, `createdAt`),
    UNIQUE INDEX `StockItem_firmId_itemCode_key`(`firmId`, `itemCode`),
    UNIQUE INDEX `StockItem_firmId_hallmarkUid_key`(`firmId`, `hallmarkUid`),
    UNIQUE INDEX `StockItem_firmId_rfidNo_key`(`firmId`, `rfidNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Stone` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `stockItemId` VARCHAR(191) NOT NULL,
    `seq` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(191) NULL,
    `clarity` VARCHAR(191) NULL,
    `colorGrade` VARCHAR(191) NULL,
    `shape` VARCHAR(191) NULL,
    `size` VARCHAR(191) NULL,
    `certNo` VARCHAR(191) NULL,
    `certLab` VARCHAR(191) NULL,
    `otherInfo` VARCHAR(191) NULL,
    `qty` DOUBLE NULL,
    `caratWeight` DOUBLE NULL,
    `weightUnit` VARCHAR(191) NULL DEFAULT 'CT',
    `weightGrams` DOUBLE NULL,
    `rateCt` DOUBLE NULL,
    `rateUnit` VARCHAR(191) NULL DEFAULT 'CT',
    `sellRateCt` DOUBLE NULL,
    `amount` DOUBLE NULL,
    `deductFromGross` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Stone_firmId_idx`(`firmId`),
    INDEX `Stone_stockItemId_seq_idx`(`stockItemId`, `seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `HallmarkBatch` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `lotNumber` VARCHAR(191) NOT NULL,
    `centreName` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'sent',
    `note` TEXT NULL,
    `sentBy` VARCHAR(191) NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `HallmarkBatch_firmId_status_idx`(`firmId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `HallmarkBatchItem` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'sent',
    `hallmarkUid` VARCHAR(191) NULL,
    `hallmarkingFee` DOUBLE NULL,
    `receivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `HallmarkBatchItem_batchId_idx`(`batchId`),
    INDEX `HallmarkBatchItem_itemId_idx`(`itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `MeltBatch` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `lotNumber` VARCHAR(191) NOT NULL,
    `metal` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'assigned',
    `fineWeightIn` DOUBLE NOT NULL DEFAULT 0,
    `grossWeightIn` DOUBLE NOT NULL DEFAULT 0,
    `recoveredGrossWeight` DOUBLE NULL,
    `recoveredPurity` DOUBLE NULL,
    `recoveredFineWeight` DOUBLE NULL,
    `lossFineWeight` DOUBLE NULL,
    `metalRate` DOUBLE NULL,
    `lossValue` DOUBLE NULL,
    `resultItemId` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `assignedBy` VARCHAR(191) NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MeltBatch_resultItemId_key`(`resultItemId`),
    INDEX `MeltBatch_firmId_status_idx`(`firmId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `MeltBatchItem` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `fineWeight` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MeltBatchItem_batchId_idx`(`batchId`),
    INDEX `MeltBatchItem_itemId_idx`(`itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `StockTransfer` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `itemCode` VARCHAR(191) NULL,
    `itemId` VARCHAR(191) NULL,
    `fromCounter` VARCHAR(191) NULL,
    `toCounter` VARCHAR(191) NULL,
    `fromFirmId` VARCHAR(191) NULL,
    `toFirmId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `userId` VARCHAR(191) NULL,
    `approvedBy` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StockTransfer_firmId_status_idx`(`firmId`, `status`),
    INDEX `StockTransfer_itemId_idx`(`itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `StockTally` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `counter` VARCHAR(191) NULL,
    `location` VARCHAR(191) NULL,
    `category` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'open',
    `userId` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `expectedQty` INTEGER NULL,
    `expectedNetWeight` DOUBLE NULL,
    `countedQty` INTEGER NULL,
    `countedNetWeight` DOUBLE NULL,
    `missingQty` INTEGER NULL,
    `missingNetWeight` DOUBLE NULL,
    `extraCount` INTEGER NULL,
    `expectedPieces` INTEGER NULL,
    `countedPieces` INTEGER NULL,
    `missingPieces` INTEGER NULL,
    `expectedValue` DOUBLE NULL,
    `countedValue` DOUBLE NULL,
    `missingValue` DOUBLE NULL,
    `missingItemIds` TEXT NULL,

    INDEX `StockTally_firmId_status_idx`(`firmId`, `status`),
    INDEX `StockTally_firmId_startedAt_idx`(`firmId`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `StockTallyScan` (
    `id` VARCHAR(191) NOT NULL,
    `tallyId` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `stockItemId` VARCHAR(191) NULL,
    `scannedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `source` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,

    INDEX `StockTallyScan_firmId_scannedAt_idx`(`firmId`, `scannedAt`),
    UNIQUE INDEX `StockTallyScan_tallyId_code_key`(`tallyId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `InvoiceSequence` (
    `firmId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `seq` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`firmId`, `type`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Invoice` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'sale',
    `invoiceNo` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `customerMobile` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `invoiceDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `previousAmount` DOUBLE NOT NULL DEFAULT 0,
    `goldRate` DOUBLE NULL,
    `subtotal` DOUBLE NOT NULL DEFAULT 0,
    `discount` DOUBLE NOT NULL DEFAULT 0,
    `taxableValue` DOUBLE NOT NULL DEFAULT 0,
    `rofAmount` DOUBLE NOT NULL DEFAULT 0,
    `cgst` DOUBLE NOT NULL DEFAULT 0,
    `sgst` DOUBLE NOT NULL DEFAULT 0,
    `igst` DOUBLE NOT NULL DEFAULT 0,
    `totalAmount` DOUBLE NOT NULL DEFAULT 0,
    `metalAmount` DOUBLE NOT NULL DEFAULT 0,
    `amountByCash` DOUBLE NOT NULL DEFAULT 0,
    `amountByCard` DOUBLE NOT NULL DEFAULT 0,
    `amountByUPI` DOUBLE NOT NULL DEFAULT 0,
    `amountByCheque` DOUBLE NOT NULL DEFAULT 0,
    `amountByGold` DOUBLE NOT NULL DEFAULT 0,
    `paymentMode` VARCHAR(191) NOT NULL DEFAULT 'cash',
    `updateInventory` BOOLEAN NOT NULL DEFAULT true,
    `taxInclusive` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(191) NOT NULL DEFAULT 'completed',
    `note` TEXT NULL,
    `supplierBillNo` VARCHAR(191) NULL,
    `supplierBillDate` DATETIME(3) NULL,
    `supplierDueDate` DATETIME(3) NULL,
    `paymentTerms` VARCHAR(191) NULL,
    `billingName` VARCHAR(191) NULL,
    `oldGoldWeight` DOUBLE NOT NULL DEFAULT 0,
    `oldGoldValue` DOUBLE NOT NULL DEFAULT 0,
    `oldGoldPurity` VARCHAR(191) NULL,
    `oldGoldRate` DOUBLE NULL,
    `bhavCut` DOUBLE NOT NULL DEFAULT 0,
    `oldMetalRows` TEXT NULL,
    `loyaltyRedeemed` DOUBLE NOT NULL DEFAULT 0,
    `loyaltyEarned` INTEGER NOT NULL DEFAULT 0,
    `salesPersonId` VARCHAR(191) NULL,
    `salesPersonName` VARCHAR(191) NULL,
    `staffCode` VARCHAR(191) NULL,
    `counterName` VARCHAR(191) NULL,
    `schemeEntryId` VARCHAR(191) NULL,
    `irn` VARCHAR(191) NULL,
    `ackNo` VARCHAR(191) NULL,
    `ackDate` DATETIME(3) NULL,
    `qrUrl` TEXT NULL,
    `eInvoiceStatus` VARCHAR(191) NULL,
    `whatsappSent` BOOLEAN NOT NULL DEFAULT false,
    `returnOfInvoiceId` VARCHAR(191) NULL,
    `returnReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Invoice_firmId_invoiceDate_idx`(`firmId`, `invoiceDate`),
    INDEX `Invoice_firmId_type_invoiceDate_idx`(`firmId`, `type`, `invoiceDate`),
    INDEX `Invoice_customerId_idx`(`customerId`),
    INDEX `Invoice_userId_idx`(`userId`),
    INDEX `Invoice_returnOfInvoiceId_idx`(`returnOfInvoiceId`),
    INDEX `Invoice_salesPersonId_idx`(`salesPersonId`),
    INDEX `Invoice_schemeEntryId_idx`(`schemeEntryId`),
    UNIQUE INDEX `Invoice_firmId_invoiceNo_key`(`firmId`, `invoiceNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `InvoiceItem` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `stockItemId` VARCHAR(191) NULL,
    `itemCode` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `hsnCode` VARCHAR(191) NULL,
    `purity` VARCHAR(191) NULL,
    `huid` VARCHAR(191) NULL,
    `grossWeight` DOUBLE NOT NULL DEFAULT 0,
    `netWeight` DOUBLE NOT NULL DEFAULT 0,
    `stoneWeight` DOUBLE NULL,
    `stoneAmount` DOUBLE NULL,
    `stoneCertNo` VARCHAR(191) NULL,
    `stones` TEXT NULL,
    `makingCharge` DOUBLE NOT NULL DEFAULT 0,
    `wastagePercent` DOUBLE NULL,
    `rate` DOUBLE NOT NULL DEFAULT 0,
    `amount` DOUBLE NOT NULL DEFAULT 0,
    `metalType` VARCHAR(191) NULL,
    `metalName` VARCHAR(191) NULL,
    `itemCategory` VARCHAR(191) NULL,
    `size` VARCHAR(191) NULL,
    `qty` INTEGER NOT NULL DEFAULT 1,
    `lessWeight` DOUBLE NULL,
    `packetWeight` DOUBLE NULL,
    `tagWeight` DOUBLE NULL,
    `cwWeight` DOUBLE NULL,
    `valueAddPct` DOUBLE NULL,
    `valueAddAmount` DOUBLE NULL,
    `discountPct` DOUBLE NULL,
    `discountAmount` DOUBLE NULL,
    `otherCharges` DOUBLE NULL,
    `markUp` DOUBLE NULL,
    `counterNo` VARCHAR(191) NULL,
    `length` VARCHAR(191) NULL,
    `modelNo` VARCHAR(191) NULL,
    `otherInfo` VARCHAR(191) NULL,
    `cgst` DOUBLE NOT NULL DEFAULT 0,
    `sgst` DOUBLE NOT NULL DEFAULT 0,
    `igst` DOUBLE NOT NULL DEFAULT 0,
    `total` DOUBLE NOT NULL DEFAULT 0,
    `returnOfItemId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InvoiceItem_invoiceId_idx`(`invoiceId`),
    INDEX `InvoiceItem_stockItemId_idx`(`stockItemId`),
    INDEX `InvoiceItem_returnOfItemId_idx`(`returnOfItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Loan` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `loanNo` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `customerMobile` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `loanDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `loanType` VARCHAR(191) NOT NULL DEFAULT 'secured',
    `principalAmount` DOUBLE NOT NULL DEFAULT 0,
    `interestRate` DOUBLE NOT NULL DEFAULT 2,
    `interestType` VARCHAR(191) NOT NULL DEFAULT 'monthly',
    `interestConvention` TEXT NULL,
    `timePeriod` INTEGER NULL,
    `dueDate` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `wardNo` VARCHAR(191) NULL,
    `village` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `exFirmId` VARCHAR(191) NULL,
    `trFirmId` VARCHAR(191) NULL,
    `mlFirmId` VARCHAR(191) NULL,
    `pledgePlace` VARCHAR(191) NULL,
    `packetNo` VARCHAR(191) NULL,
    `boxNo` VARCHAR(191) NULL,
    `lockerNo` VARCHAR(191) NULL,
    `jointLoanNo` VARCHAR(191) NULL,
    `processingFee` DOUBLE NULL,
    `transferDate` DATETIME(3) NULL,
    `transferPrincipal` DOUBLE NULL,
    `transferRate` DOUBLE NULL,
    `transferConvention` TEXT NULL,
    `transferStatus` VARCHAR(191) NULL,
    `transferRedeemedDate` DATETIME(3) NULL,
    `transferVoucherId` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `releasedDate` DATETIME(3) NULL,
    `releasedAmount` DOUBLE NULL,
    `totalInterest` DOUBLE NULL,
    `totalAmount` DOUBLE NULL,
    `auctionDate` DATETIME(3) NULL,
    `auctionAmount` DOUBLE NULL,
    `auctionCharges` DOUBLE NULL,
    `auctionSurplus` DOUBLE NULL,
    `photoUrl` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Loan_firmId_status_idx`(`firmId`, `status`),
    INDEX `Loan_firmId_loanDate_idx`(`firmId`, `loanDate`),
    INDEX `Loan_customerId_idx`(`customerId`),
    INDEX `Loan_userId_idx`(`userId`),
    INDEX `Loan_firmId_transferStatus_idx`(`firmId`, `transferStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `LoanItem` (
    `id` VARCHAR(191) NOT NULL,
    `loanId` VARCHAR(191) NOT NULL,
    `stockItemId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `purity` VARCHAR(191) NULL,
    `grossWeight` DOUBLE NOT NULL DEFAULT 0,
    `netWeight` DOUBLE NOT NULL DEFAULT 0,
    `stoneWeight` DOUBLE NULL,
    `estimatedValue` DOUBLE NOT NULL DEFAULT 0,
    `photoUrl` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LoanItem_loanId_idx`(`loanId`),
    INDEX `LoanItem_stockItemId_idx`(`stockItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `LoanTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `loanId` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `stream` VARCHAR(191) NOT NULL DEFAULT 'in',
    `amount` DOUBLE NOT NULL,
    `principalComponent` DOUBLE NOT NULL DEFAULT 0,
    `interestComponent` DOUBLE NOT NULL DEFAULT 0,
    `discount` DOUBLE NOT NULL DEFAULT 0,
    `charges` DOUBLE NOT NULL DEFAULT 0,
    `paymentMode` VARCHAR(191) NOT NULL DEFAULT 'cash',
    `reversalOfId` VARCHAR(191) NULL,
    `voucherId` VARCHAR(191) NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LoanTransaction_loanId_idx`(`loanId`),
    INDEX `LoanTransaction_firmId_idx`(`firmId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Udhaar` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `customerMobile` VARCHAR(191) NULL,
    `village` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'credit',
    `transactionType` VARCHAR(191) NOT NULL DEFAULT 'cash',
    `amount` DOUBLE NOT NULL DEFAULT 0,
    `description` TEXT NULL,
    `dueDate` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `settledAmount` DOUBLE NOT NULL DEFAULT 0,
    `metal` VARCHAR(191) NULL,
    `grams` DOUBLE NOT NULL DEFAULT 0,
    `settledGrams` DOUBLE NOT NULL DEFAULT 0,
    `interestRate` DOUBLE NULL,
    `interestType` VARCHAR(191) NULL,
    `interestStartDate` DATETIME(3) NULL,
    `interestEndDate` DATETIME(3) NULL,
    `interestConvention` TEXT NULL,
    `emiIntervalDays` INTEGER NULL,
    `emiOccurrences` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Udhaar_firmId_idx`(`firmId`),
    INDEX `Udhaar_customerId_idx`(`customerId`),
    INDEX `Udhaar_firmId_createdAt_idx`(`firmId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `UdhaarPayment` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `udhaarId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `amount` DOUBLE NOT NULL DEFAULT 0,
    `type` VARCHAR(191) NOT NULL DEFAULT 'part_payment',
    `interestComponent` DOUBLE NOT NULL DEFAULT 0,
    `principalComponent` DOUBLE NOT NULL DEFAULT 0,
    `paymentMode` VARCHAR(191) NOT NULL DEFAULT 'cash',
    `note` TEXT NULL,
    `voucherId` VARCHAR(191) NULL,
    `reversalOfId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UdhaarPayment_udhaarId_date_idx`(`udhaarId`, `date`),
    INDEX `UdhaarPayment_firmId_date_idx`(`firmId`, `date`),
    INDEX `UdhaarPayment_firmId_voucherId_idx`(`firmId`, `voucherId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Scheme` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'cash',
    `groupName` VARCHAR(191) NULL,
    `emiAmount` DOUBLE NOT NULL DEFAULT 0,
    `durationMonths` INTEGER NOT NULL DEFAULT 11,
    `totalInstallments` INTEGER NOT NULL DEFAULT 11,
    `bonusMonths` INTEGER NOT NULL DEFAULT 1,
    `minAmount` DOUBLE NULL,
    `maxAmount` DOUBLE NULL,
    `interestRate` DOUBLE NULL,
    `description` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Scheme_firmId_idx`(`firmId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `SchemeEntry` (
    `id` VARCHAR(191) NOT NULL,
    `schemeId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `customerMobile` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `startDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `emiAmount` DOUBLE NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'cash',
    `totalInstallments` INTEGER NOT NULL DEFAULT 11,
    `bonusAmount` DOUBLE NOT NULL DEFAULT 0,
    `bonusGrams` DOUBLE NOT NULL DEFAULT 0,
    `bonusRate` DOUBLE NULL,
    `maturityDate` DATETIME(3) NULL,
    `earlyExitDeduction` DOUBLE NOT NULL DEFAULT 0,
    `closedDate` DATETIME(3) NULL,
    `invoiceId` VARCHAR(191) NULL,
    `paidInstallments` INTEGER NOT NULL DEFAULT 0,
    `totalPaid` DOUBLE NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `nomineeName` VARCHAR(191) NULL,
    `nomineeRelation` VARCHAR(191) NULL,
    `otherInfo` VARCHAR(191) NULL,
    `payInfo` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SchemeEntry_schemeId_idx`(`schemeId`),
    INDEX `SchemeEntry_customerId_idx`(`customerId`),
    INDEX `SchemeEntry_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `SchemeInstallment` (
    `id` VARCHAR(191) NOT NULL,
    `entryId` VARCHAR(191) NOT NULL,
    `installmentNo` INTEGER NOT NULL,
    `amount` DOUBLE NOT NULL,
    `metalRate` DOUBLE NULL,
    `grams` DOUBLE NULL,
    `paidDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `paymentMode` VARCHAR(191) NOT NULL DEFAULT 'cash',
    `note` TEXT NULL,
    `voucherId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SchemeInstallment_entryId_idx`(`entryId`),
    UNIQUE INDEX `SchemeInstallment_entryId_installmentNo_key`(`entryId`, `installmentNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Expense` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `category` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `amount` DOUBLE NOT NULL,
    `paymentMode` VARCHAR(191) NOT NULL DEFAULT 'cash',
    `expenseDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Expense_firmId_expenseDate_idx`(`firmId`, `expenseDate`),
    INDEX `Expense_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Account` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `group` VARCHAR(191) NULL,
    `openingBalance` DOUBLE NOT NULL DEFAULT 0,
    `balanceType` VARCHAR(191) NOT NULL DEFAULT 'debit',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Account_firmId_idx`(`firmId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `LedgerEntry` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NULL,
    `accountName` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `invoiceId` VARCHAR(191) NULL,
    `loanId` VARCHAR(191) NULL,
    `voucherId` VARCHAR(191) NULL,
    `reversalOfId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `particulars` VARCHAR(191) NULL,
    `debit` DOUBLE NOT NULL DEFAULT 0,
    `credit` DOUBLE NOT NULL DEFAULT 0,
    `balance` DOUBLE NOT NULL DEFAULT 0,
    `type` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LedgerEntry_firmId_date_idx`(`firmId`, `date`),
    INDEX `LedgerEntry_customerId_idx`(`customerId`),
    INDEX `LedgerEntry_voucherId_idx`(`voucherId`),
    INDEX `LedgerEntry_reversalOfId_idx`(`reversalOfId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `GoldRate` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `metal` VARCHAR(191) NOT NULL,
    `purity` VARCHAR(191) NOT NULL,
    `rate` DOUBLE NOT NULL,
    `unit` VARCHAR(191) NOT NULL DEFAULT 'per_10_gram',
    `rateDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GoldRate_firmId_rateDate_idx`(`firmId`, `rateDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Setting` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Setting_firmId_idx`(`firmId`),
    UNIQUE INDEX `Setting_firmId_key_key`(`firmId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `SmsLog` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `mobile` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `template` TEXT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'transactional',
    `status` VARCHAR(191) NOT NULL DEFAULT 'sent',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SmsLog_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `SystemLog` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `entity` VARCHAR(191) NULL,
    `entityId` VARCHAR(191) NULL,
    `details` TEXT NULL,
    `ipAddress` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SystemLog_firmId_idx`(`firmId`),
    INDEX `SystemLog_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Task` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `customerId` VARCHAR(191) NULL,
    `subject` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL DEFAULT 'general',
    `priority` VARCHAR(191) NOT NULL DEFAULT 'medium',
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `dueDate` DATETIME(3) NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Task_firmId_idx`(`firmId`),
    INDEX `Task_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Order` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `orderNo` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `customerMobile` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `orderDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deliveryDate` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `totalAmount` DOUBLE NOT NULL DEFAULT 0,
    `advanceAmount` DOUBLE NOT NULL DEFAULT 0,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Order_firmId_idx`(`firmId`),
    INDEX `Order_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Quotation` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `quoteNo` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `customerMobile` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `quoteDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `validTill` DATETIME(3) NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'quotation',
    `status` VARCHAR(191) NOT NULL DEFAULT 'open',
    `goldRate` DOUBLE NOT NULL DEFAULT 0,
    `subtotal` DOUBLE NOT NULL DEFAULT 0,
    `discount` DOUBLE NOT NULL DEFAULT 0,
    `cgst` DOUBLE NOT NULL DEFAULT 0,
    `sgst` DOUBLE NOT NULL DEFAULT 0,
    `igst` DOUBLE NOT NULL DEFAULT 0,
    `totalAmount` DOUBLE NOT NULL DEFAULT 0,
    `note` TEXT NULL,
    `convertedInvoiceId` VARCHAR(191) NULL,
    `whatsappSent` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Quotation_firmId_idx`(`firmId`),
    INDEX `Quotation_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `QuotationItem` (
    `id` VARCHAR(191) NOT NULL,
    `quotationId` VARCHAR(191) NOT NULL,
    `stockItemId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `purity` VARCHAR(191) NULL,
    `netWeight` DOUBLE NOT NULL DEFAULT 0,
    `rate` DOUBLE NOT NULL DEFAULT 0,
    `makingCharge` DOUBLE NOT NULL DEFAULT 0,
    `amount` DOUBLE NOT NULL DEFAULT 0,
    `total` DOUBLE NOT NULL DEFAULT 0,

    INDEX `QuotationItem_quotationId_idx`(`quotationId`),
    INDEX `QuotationItem_stockItemId_idx`(`stockItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Repair` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `repairNo` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `customerMobile` VARCHAR(191) NULL,
    `karigarId` VARCHAR(191) NULL,
    `karigarName` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `intakeDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deliveryDate` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'received',
    `itemName` VARCHAR(191) NOT NULL,
    `itemDesc` TEXT NULL,
    `problem` VARCHAR(191) NULL,
    `estimatedCost` DOUBLE NOT NULL DEFAULT 0,
    `finalCost` DOUBLE NOT NULL DEFAULT 0,
    `advancePaid` DOUBLE NOT NULL DEFAULT 0,
    `smsSent` BOOLEAN NOT NULL DEFAULT false,
    `note` TEXT NULL,
    `invoiceId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Repair_invoiceId_key`(`invoiceId`),
    INDEX `Repair_firmId_idx`(`firmId`),
    INDEX `Repair_customerId_idx`(`customerId`),
    INDEX `Repair_karigarId_idx`(`karigarId`),
    INDEX `Repair_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `LoyaltyPoint` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `points` INTEGER NOT NULL DEFAULT 0,
    `type` VARCHAR(191) NOT NULL,
    `refInvoiceId` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LoyaltyPoint_firmId_idx`(`firmId`),
    INDEX `LoyaltyPoint_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `BankAccount` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `bankName` VARCHAR(191) NULL,
    `accountNumber` VARCHAR(191) NULL,
    `ifsc` VARCHAR(191) NULL,
    `branch` VARCHAR(191) NULL,
    `openingBalance` DOUBLE NOT NULL DEFAULT 0,
    `openingDate` DATETIME(3) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BankAccount_firmId_idx`(`firmId`),
    UNIQUE INDEX `BankAccount_firmId_name_key`(`firmId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `BankTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `bankAccountId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `counterAccountName` VARCHAR(191) NULL,
    `toBankAccountId` VARCHAR(191) NULL,
    `amount` DOUBLE NOT NULL,
    `transactionDate` DATETIME(3) NOT NULL,
    `clearingDate` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'cleared',
    `chequeNumber` VARCHAR(191) NULL,
    `narration` TEXT NULL,
    `voucherId` VARCHAR(191) NULL,
    `clearVoucherId` VARCHAR(191) NULL,
    `reversalVoucherId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BankTransaction_firmId_bankAccountId_idx`(`firmId`, `bankAccountId`),
    INDEX `BankTransaction_firmId_status_idx`(`firmId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `BankStatementLine` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `bankAccountId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `description` TEXT NOT NULL,
    `debit` DOUBLE NOT NULL DEFAULT 0,
    `credit` DOUBLE NOT NULL DEFAULT 0,
    `reference` VARCHAR(191) NULL,
    `matchedVoucherId` VARCHAR(191) NULL,
    `matchedAt` DATETIME(3) NULL,
    `matchedBy` VARCHAR(191) NULL,
    `importBatch` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BankStatementLine_firmId_bankAccountId_date_idx`(`firmId`, `bankAccountId`, `date`),
    INDEX `BankStatementLine_firmId_matchedVoucherId_idx`(`firmId`, `matchedVoucherId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ===== 2. Columns (873) =====

-- User
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `User` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('User') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `User` ADD COLUMN `loginId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('User') AND column_name = 'loginId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `User` ADD COLUMN `email` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('User') AND column_name = 'email');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `User` ADD COLUMN `passwordHash` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('User') AND column_name = 'passwordHash');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `User` ADD COLUMN `name` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('User') AND column_name = 'name');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `User` ADD COLUMN `phone` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('User') AND column_name = 'phone');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `User` ADD COLUMN `role` VARCHAR(191) NOT NULL DEFAULT ''staff''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('User') AND column_name = 'role');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `User` ADD COLUMN `active` BOOLEAN NOT NULL DEFAULT true', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('User') AND column_name = 'active');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `User` ADD COLUMN `avatarUrl` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('User') AND column_name = 'avatarUrl');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `User` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('User') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `User` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('User') AND column_name = 'updatedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `User` ADD COLUMN `biometricHash` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('User') AND column_name = 'biometricHash');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `User` ADD COLUMN `permissions` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('User') AND column_name = 'permissions');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `User` ADD COLUMN `lastLoginAt` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('User') AND column_name = 'lastLoginAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Firm
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `code` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'code');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `name` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'name');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `legalName` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'legalName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `gstin` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'gstin');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `pan` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'pan');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `phone` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'phone');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `email` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'email');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `address` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'address');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `city` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'city');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `state` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'state');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `pincode` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'pincode');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `currency` VARCHAR(191) NOT NULL DEFAULT ''INR''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'currency');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `gstEnabled` BOOLEAN NOT NULL DEFAULT true', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'gstEnabled');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `cgstRate` DOUBLE NOT NULL DEFAULT 1.5', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'cgstRate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `sgstRate` DOUBLE NOT NULL DEFAULT 1.5', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'sgstRate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `igstRate` DOUBLE NOT NULL DEFAULT 3.0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'igstRate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `hallmarking` BOOLEAN NOT NULL DEFAULT true', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'hallmarking');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `logoUrl` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'logoUrl');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `active` BOOLEAN NOT NULL DEFAULT true', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'active');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `razorpayKeyId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'razorpayKeyId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `razorpayKeySecret` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'razorpayKeySecret');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `paytmMerchantId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'paytmMerchantId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `paytmMerchantKey` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'paytmMerchantKey');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `phonepeMerchantId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'phonepeMerchantId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `phonepeSaltKey` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'phonepeSaltKey');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `weighingScalePort` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'weighingScalePort');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `weighingScaleBaud` INTEGER NOT NULL DEFAULT 9600', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'weighingScaleBaud');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `biometricEnabled` BOOLEAN NOT NULL DEFAULT false', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'biometricEnabled');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `loyaltyRate` DOUBLE NOT NULL DEFAULT 1.0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'loyaltyRate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `eInvoiceEnabled` BOOLEAN NOT NULL DEFAULT false', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'eInvoiceEnabled');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `whatsappEnabled` BOOLEAN NOT NULL DEFAULT true', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'whatsappEnabled');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Firm` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND column_name = 'updatedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- UserFirm
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `UserFirm` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('UserFirm') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `UserFirm` ADD COLUMN `userId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('UserFirm') AND column_name = 'userId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `UserFirm` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('UserFirm') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `UserFirm` ADD COLUMN `role` VARCHAR(191) NOT NULL DEFAULT ''staff''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('UserFirm') AND column_name = 'role');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `UserFirm` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('UserFirm') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Customer
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `code` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'code');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT ''customer''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'type');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `supplierType` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'supplierType');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `title` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'title');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `firstName` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'firstName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `lastName` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'lastName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `fatherSpouse` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'fatherSpouse');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `fatherSpouseRel` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'fatherSpouseRel');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `motherName` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'motherName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `spouseName` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'spouseName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `spouseDob` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'spouseDob');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `gender` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'gender');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `dob` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'dob');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `maritalStatus` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'maritalStatus');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `anniversaryDate` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'anniversaryDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `caste` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'caste');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `qualification` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'qualification');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `pan` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'pan');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `gstin` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'gstin');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `taxNo` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'taxNo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `aadhaar` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'aadhaar');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `aadhaarVerified` BOOLEAN NOT NULL DEFAULT false', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'aadhaarVerified');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `bankName` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'bankName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `bankAccName` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'bankAccName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `bankAccNumber` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'bankAccNumber');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `bankIfscCode` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'bankIfscCode');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `accountHeadId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'accountHeadId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `occupation` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'occupation');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `monthlyIncome` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'monthlyIncome');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `creditLimit` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'creditLimit');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `openingBalance` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'openingBalance');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `balanceType` VARCHAR(191) NOT NULL DEFAULT ''debit''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'balanceType');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `cashBalance` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'cashBalance');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `cashBalanceType` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'cashBalanceType');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `goldWeightBal` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'goldWeightBal');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `goldWeightType` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'goldWeightType');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `goldBalanceType` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'goldBalanceType');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `silverWeightBal` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'silverWeightBal');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `silverWeightType` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'silverWeightType');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `silverBalanceType` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'silverBalanceType');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `nomineeName` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'nomineeName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `nomineeRelation` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'nomineeRelation');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `designation` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'designation');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `loginId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'loginId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `password` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'password');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `mobile` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'mobile');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `altMobile` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'altMobile');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `phone` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'phone');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `email` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'email');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `wastagePercent` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'wastagePercent');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `wastageDays` INTEGER NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'wastageDays');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `wastageOccasion` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'wastageOccasion');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `reference` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'reference');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `userGroup` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'userGroup');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `shopName` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'shopName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `shipFirstName` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'shipFirstName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `shipLastName` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'shipLastName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `shipAddress` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'shipAddress');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `shipGstin` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'shipGstin');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `shipPan` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'shipPan');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `shipMobile` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'shipMobile');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `shipCity` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'shipCity');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `shipState` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'shipState');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `country` VARCHAR(191) NULL DEFAULT ''India''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'country');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `state` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'state');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `city` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'city');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `village` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'village');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `wardNo` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'wardNo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `tehsil` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'tehsil');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `officeAddress` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'officeAddress');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `address` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'address');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `currAddress` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'currAddress');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `pincode` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'pincode');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `otherInfo` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'otherInfo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `photoUrl` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'photoUrl');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `photoUrl2` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'photoUrl2');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `photoUrl3` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'photoUrl3');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `photoUrl4` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'photoUrl4');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `fingerScanId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'fingerScanId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `loyaltyPoints` INTEGER NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'loyaltyPoints');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `active` BOOLEAN NOT NULL DEFAULT true', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'active');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'updatedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `kycDocType` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'kycDocType');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `kycDocNo` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'kycDocNo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Customer` ADD COLUMN `kycDocUrl` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND column_name = 'kycDocUrl');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- StockItem
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `itemCode` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'itemCode');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `barcode` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'barcode');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `hallmarkUid` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'hallmarkUid');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `category` VARCHAR(191) NOT NULL DEFAULT ''fine''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'category');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `subType` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'subType');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `name` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'name');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `metalType` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'metalType');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `metalName` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'metalName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `metalRate` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'metalRate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `gender` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'gender');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `hsnCode` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'hsnCode');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `brand` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'brand');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `seller` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'seller');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `counter` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'counter');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `bis` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'bis');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `itemCategory` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'itemCategory');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `purity` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'purity');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `purityPercent` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'purityPercent');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `qty` INTEGER NOT NULL DEFAULT 1', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'qty');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `grossWeight` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'grossWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `grossWeightUnit` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'grossWeightUnit');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `lessWeight` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'lessWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `lessWeightUnit` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'lessWeightUnit');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `packetWeight` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'packetWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `packetWeightUnit` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'packetWeightUnit');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `netWeight` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'netWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `netWeightUnit` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'netWeightUnit');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `tagWeight` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'tagWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `finalPurity` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'finalPurity');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `finalWeight` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'finalWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `finalFineWeight` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'finalFineWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `labourCharge` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'labourCharge');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `makingCharge` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'makingCharge');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `makingType` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'makingType');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `wastagePercent` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'wastagePercent');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `stoneWeight` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'stoneWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `stoneAmount` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'stoneAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `mrp` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'mrp');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `costPrice` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'costPrice');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `sellPrice` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'sellPrice');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `photoUrl` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'photoUrl');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `photoUrl2` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'photoUrl2');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `photoUrl3` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'photoUrl3');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `photoUrl4` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'photoUrl4');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `rfidNo` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'rfidNo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `location` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'location');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `modelNo` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'modelNo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `length` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'length');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `color` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'color');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `size` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'size');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `shape` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'shape');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `width` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'width');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `polish` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'polish');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `spCode` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'spCode');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `salesPackage` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'salesPackage');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `expDate` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'expDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `otherInfo` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'otherInfo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `totalHallmarkCharges` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'totalHallmarkCharges');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `otherCharges` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'otherCharges');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `otherChargesType` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'otherChargesType');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `totalOtherCharges` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'totalOtherCharges');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `stockType` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'stockType');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `ecommStatus` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'ecommStatus');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `jewellersAppStatus` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'jewellersAppStatus');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `totalTax` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'totalTax');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `details` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'details');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `markUp` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'markUp');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `finalValuation` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'finalValuation');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `fixedPriceStatus` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'fixedPriceStatus');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `customerWastage` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'customerWastage');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `customerWastageWt` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'customerWastageWt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `valueAdded` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'valueAdded');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `valuation` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'valuation');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `makingCgstPercent` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'makingCgstPercent');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `makingCgstAmount` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'makingCgstAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `makingSgstPercent` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'makingSgstPercent');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `makingSgstAmount` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'makingSgstAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `makingIgstPercent` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'makingIgstPercent');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `makingIgstAmount` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'makingIgstAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `priceCgstPercent` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'priceCgstPercent');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `priceCgstAmount` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'priceCgstAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `priceSgstPercent` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'priceSgstPercent');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `priceSgstAmount` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'priceSgstAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `priceIgstPercent` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'priceIgstPercent');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `priceIgstAmount` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'priceIgstAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `packetDesc1` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'packetDesc1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `packetQty1` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'packetQty1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `packetWt1` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'packetWt1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `packetTotalWt1` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'packetTotalWt1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `packetDesc2` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'packetDesc2');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `packetQty2` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'packetQty2');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `packetWt2` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'packetWt2');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `packetTotalWt2` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'packetTotalWt2');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `packetDesc3` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'packetDesc3');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `packetQty3` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'packetQty3');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `packetWt3` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'packetWt3');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `packetTotalWt3` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'packetTotalWt3');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `packetDesc4` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'packetDesc4');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `packetQty4` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'packetQty4');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `packetWt4` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'packetWt4');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `packetTotalWt4` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'packetTotalWt4');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `packetDesc5` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'packetDesc5');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `packetQty5` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'packetQty5');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `packetWt5` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'packetWt5');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `packetTotalWt5` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'packetTotalWt5');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `labourQty1` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'labourQty1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `labourChrg1` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'labourChrg1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `labourType1` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'labourType1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `labourTotal1` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'labourTotal1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `labourQty2` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'labourQty2');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `labourChrg2` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'labourChrg2');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `labourType2` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'labourType2');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `labourTotal2` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'labourTotal2');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `labourQty3` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'labourQty3');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `labourChrg3` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'labourChrg3');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `labourType3` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'labourType3');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `labourTotal3` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'labourTotal3');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `labourQty4` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'labourQty4');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `labourChrg4` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'labourChrg4');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `labourType4` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'labourType4');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `labourTotal4` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'labourTotal4');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `labourQty5` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'labourQty5');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `labourChrg5` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'labourChrg5');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `labourType5` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'labourType5');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `labourTotal5` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'labourTotal5');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `totalLabourCharges` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'totalLabourCharges');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT ''available''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'status');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `billDate` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'billDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `mfgDate` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'mfgDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'updatedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `diamondCertNo` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'diamondCertNo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `diamondCertLab` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'diamondCertLab');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `diamondCertUrl` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'diamondCertUrl');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `stoneId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'stoneId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `stoneName` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'stoneName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `stoneClarity` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'stoneClarity');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `stoneColorGrade` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'stoneColorGrade');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `stoneSize` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'stoneSize');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `stoneShape` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'stoneShape');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `stoneOtherInfo` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'stoneOtherInfo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `stoneQty` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'stoneQty');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `stoneGrossWeightCt` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'stoneGrossWeightCt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `stoneRateCt` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'stoneRateCt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockItem` ADD COLUMN `stoneSellRateCt` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND column_name = 'stoneSellRateCt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Stone
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Stone` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Stone') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Stone` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Stone') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Stone` ADD COLUMN `stockItemId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Stone') AND column_name = 'stockItemId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Stone` ADD COLUMN `seq` INTEGER NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Stone') AND column_name = 'seq');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Stone` ADD COLUMN `name` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Stone') AND column_name = 'name');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Stone` ADD COLUMN `clarity` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Stone') AND column_name = 'clarity');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Stone` ADD COLUMN `colorGrade` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Stone') AND column_name = 'colorGrade');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Stone` ADD COLUMN `shape` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Stone') AND column_name = 'shape');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Stone` ADD COLUMN `size` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Stone') AND column_name = 'size');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Stone` ADD COLUMN `certNo` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Stone') AND column_name = 'certNo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Stone` ADD COLUMN `certLab` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Stone') AND column_name = 'certLab');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Stone` ADD COLUMN `otherInfo` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Stone') AND column_name = 'otherInfo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Stone` ADD COLUMN `qty` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Stone') AND column_name = 'qty');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Stone` ADD COLUMN `caratWeight` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Stone') AND column_name = 'caratWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Stone` ADD COLUMN `weightUnit` VARCHAR(191) NULL DEFAULT ''CT''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Stone') AND column_name = 'weightUnit');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Stone` ADD COLUMN `weightGrams` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Stone') AND column_name = 'weightGrams');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Stone` ADD COLUMN `rateCt` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Stone') AND column_name = 'rateCt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Stone` ADD COLUMN `rateUnit` VARCHAR(191) NULL DEFAULT ''CT''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Stone') AND column_name = 'rateUnit');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Stone` ADD COLUMN `sellRateCt` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Stone') AND column_name = 'sellRateCt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Stone` ADD COLUMN `amount` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Stone') AND column_name = 'amount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Stone` ADD COLUMN `deductFromGross` BOOLEAN NOT NULL DEFAULT false', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Stone') AND column_name = 'deductFromGross');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Stone` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Stone') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Stone` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Stone') AND column_name = 'updatedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- HallmarkBatch
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `HallmarkBatch` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('HallmarkBatch') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `HallmarkBatch` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('HallmarkBatch') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `HallmarkBatch` ADD COLUMN `lotNumber` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('HallmarkBatch') AND column_name = 'lotNumber');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `HallmarkBatch` ADD COLUMN `centreName` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('HallmarkBatch') AND column_name = 'centreName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `HallmarkBatch` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT ''sent''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('HallmarkBatch') AND column_name = 'status');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `HallmarkBatch` ADD COLUMN `note` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('HallmarkBatch') AND column_name = 'note');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `HallmarkBatch` ADD COLUMN `sentBy` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('HallmarkBatch') AND column_name = 'sentBy');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `HallmarkBatch` ADD COLUMN `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('HallmarkBatch') AND column_name = 'sentAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `HallmarkBatch` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('HallmarkBatch') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `HallmarkBatch` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('HallmarkBatch') AND column_name = 'updatedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- HallmarkBatchItem
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `HallmarkBatchItem` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('HallmarkBatchItem') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `HallmarkBatchItem` ADD COLUMN `batchId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('HallmarkBatchItem') AND column_name = 'batchId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `HallmarkBatchItem` ADD COLUMN `itemId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('HallmarkBatchItem') AND column_name = 'itemId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `HallmarkBatchItem` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT ''sent''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('HallmarkBatchItem') AND column_name = 'status');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `HallmarkBatchItem` ADD COLUMN `hallmarkUid` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('HallmarkBatchItem') AND column_name = 'hallmarkUid');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `HallmarkBatchItem` ADD COLUMN `hallmarkingFee` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('HallmarkBatchItem') AND column_name = 'hallmarkingFee');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `HallmarkBatchItem` ADD COLUMN `receivedAt` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('HallmarkBatchItem') AND column_name = 'receivedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `HallmarkBatchItem` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('HallmarkBatchItem') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- MeltBatch
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `MeltBatch` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatch') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `MeltBatch` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatch') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `MeltBatch` ADD COLUMN `lotNumber` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatch') AND column_name = 'lotNumber');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `MeltBatch` ADD COLUMN `metal` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatch') AND column_name = 'metal');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `MeltBatch` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT ''assigned''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatch') AND column_name = 'status');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `MeltBatch` ADD COLUMN `fineWeightIn` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatch') AND column_name = 'fineWeightIn');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `MeltBatch` ADD COLUMN `grossWeightIn` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatch') AND column_name = 'grossWeightIn');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `MeltBatch` ADD COLUMN `recoveredGrossWeight` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatch') AND column_name = 'recoveredGrossWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `MeltBatch` ADD COLUMN `recoveredPurity` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatch') AND column_name = 'recoveredPurity');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `MeltBatch` ADD COLUMN `recoveredFineWeight` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatch') AND column_name = 'recoveredFineWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `MeltBatch` ADD COLUMN `lossFineWeight` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatch') AND column_name = 'lossFineWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `MeltBatch` ADD COLUMN `metalRate` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatch') AND column_name = 'metalRate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `MeltBatch` ADD COLUMN `lossValue` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatch') AND column_name = 'lossValue');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `MeltBatch` ADD COLUMN `resultItemId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatch') AND column_name = 'resultItemId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `MeltBatch` ADD COLUMN `note` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatch') AND column_name = 'note');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `MeltBatch` ADD COLUMN `assignedBy` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatch') AND column_name = 'assignedBy');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `MeltBatch` ADD COLUMN `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatch') AND column_name = 'assignedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `MeltBatch` ADD COLUMN `completedAt` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatch') AND column_name = 'completedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `MeltBatch` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatch') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `MeltBatch` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatch') AND column_name = 'updatedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- MeltBatchItem
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `MeltBatchItem` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatchItem') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `MeltBatchItem` ADD COLUMN `batchId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatchItem') AND column_name = 'batchId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `MeltBatchItem` ADD COLUMN `itemId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatchItem') AND column_name = 'itemId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `MeltBatchItem` ADD COLUMN `fineWeight` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatchItem') AND column_name = 'fineWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `MeltBatchItem` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatchItem') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- StockTransfer
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTransfer` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTransfer') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTransfer` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTransfer') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTransfer` ADD COLUMN `itemCode` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTransfer') AND column_name = 'itemCode');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTransfer` ADD COLUMN `itemId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTransfer') AND column_name = 'itemId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTransfer` ADD COLUMN `fromCounter` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTransfer') AND column_name = 'fromCounter');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTransfer` ADD COLUMN `toCounter` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTransfer') AND column_name = 'toCounter');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTransfer` ADD COLUMN `fromFirmId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTransfer') AND column_name = 'fromFirmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTransfer` ADD COLUMN `toFirmId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTransfer') AND column_name = 'toFirmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTransfer` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT ''pending''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTransfer') AND column_name = 'status');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTransfer` ADD COLUMN `userId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTransfer') AND column_name = 'userId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTransfer` ADD COLUMN `approvedBy` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTransfer') AND column_name = 'approvedBy');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTransfer` ADD COLUMN `approvedAt` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTransfer') AND column_name = 'approvedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTransfer` ADD COLUMN `note` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTransfer') AND column_name = 'note');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTransfer` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTransfer') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- StockTally
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTally` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTally') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTally` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTally') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTally` ADD COLUMN `counter` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTally') AND column_name = 'counter');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTally` ADD COLUMN `location` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTally') AND column_name = 'location');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTally` ADD COLUMN `category` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTally') AND column_name = 'category');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTally` ADD COLUMN `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTally') AND column_name = 'startedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTally` ADD COLUMN `closedAt` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTally') AND column_name = 'closedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTally` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT ''open''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTally') AND column_name = 'status');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTally` ADD COLUMN `userId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTally') AND column_name = 'userId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTally` ADD COLUMN `note` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTally') AND column_name = 'note');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTally` ADD COLUMN `expectedQty` INTEGER NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTally') AND column_name = 'expectedQty');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTally` ADD COLUMN `expectedNetWeight` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTally') AND column_name = 'expectedNetWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTally` ADD COLUMN `countedQty` INTEGER NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTally') AND column_name = 'countedQty');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTally` ADD COLUMN `countedNetWeight` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTally') AND column_name = 'countedNetWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTally` ADD COLUMN `missingQty` INTEGER NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTally') AND column_name = 'missingQty');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTally` ADD COLUMN `missingNetWeight` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTally') AND column_name = 'missingNetWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTally` ADD COLUMN `extraCount` INTEGER NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTally') AND column_name = 'extraCount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTally` ADD COLUMN `expectedPieces` INTEGER NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTally') AND column_name = 'expectedPieces');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTally` ADD COLUMN `countedPieces` INTEGER NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTally') AND column_name = 'countedPieces');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTally` ADD COLUMN `missingPieces` INTEGER NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTally') AND column_name = 'missingPieces');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTally` ADD COLUMN `expectedValue` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTally') AND column_name = 'expectedValue');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTally` ADD COLUMN `countedValue` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTally') AND column_name = 'countedValue');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTally` ADD COLUMN `missingValue` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTally') AND column_name = 'missingValue');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTally` ADD COLUMN `missingItemIds` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTally') AND column_name = 'missingItemIds');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- StockTallyScan
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTallyScan` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTallyScan') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTallyScan` ADD COLUMN `tallyId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTallyScan') AND column_name = 'tallyId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTallyScan` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTallyScan') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTallyScan` ADD COLUMN `code` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTallyScan') AND column_name = 'code');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTallyScan` ADD COLUMN `stockItemId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTallyScan') AND column_name = 'stockItemId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTallyScan` ADD COLUMN `scannedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTallyScan') AND column_name = 'scannedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTallyScan` ADD COLUMN `source` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTallyScan') AND column_name = 'source');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `StockTallyScan` ADD COLUMN `userId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTallyScan') AND column_name = 'userId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- InvoiceSequence
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceSequence` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceSequence') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceSequence` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceSequence') AND column_name = 'type');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceSequence` ADD COLUMN `seq` INTEGER NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceSequence') AND column_name = 'seq');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Invoice
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT ''sale''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'type');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `invoiceNo` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'invoiceNo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `customerId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'customerId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `customerName` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'customerName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `customerMobile` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'customerMobile');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `userId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'userId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `invoiceDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'invoiceDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `previousAmount` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'previousAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `goldRate` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'goldRate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `subtotal` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'subtotal');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `discount` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'discount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `taxableValue` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'taxableValue');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `rofAmount` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'rofAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `cgst` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'cgst');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `sgst` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'sgst');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `igst` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'igst');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `totalAmount` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'totalAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `metalAmount` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'metalAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `amountByCash` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'amountByCash');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `amountByCard` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'amountByCard');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `amountByUPI` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'amountByUPI');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `amountByCheque` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'amountByCheque');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `amountByGold` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'amountByGold');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `paymentMode` VARCHAR(191) NOT NULL DEFAULT ''cash''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'paymentMode');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `updateInventory` BOOLEAN NOT NULL DEFAULT true', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'updateInventory');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `taxInclusive` BOOLEAN NOT NULL DEFAULT false', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'taxInclusive');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT ''completed''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'status');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `note` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'note');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `supplierBillNo` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'supplierBillNo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `supplierBillDate` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'supplierBillDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `supplierDueDate` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'supplierDueDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `paymentTerms` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'paymentTerms');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `billingName` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'billingName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `oldGoldWeight` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'oldGoldWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `oldGoldValue` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'oldGoldValue');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `oldGoldPurity` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'oldGoldPurity');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `oldGoldRate` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'oldGoldRate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `bhavCut` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'bhavCut');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `oldMetalRows` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'oldMetalRows');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `loyaltyRedeemed` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'loyaltyRedeemed');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `loyaltyEarned` INTEGER NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'loyaltyEarned');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `salesPersonId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'salesPersonId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `salesPersonName` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'salesPersonName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `staffCode` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'staffCode');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `counterName` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'counterName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `schemeEntryId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'schemeEntryId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `irn` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'irn');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `ackNo` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'ackNo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `ackDate` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'ackDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `qrUrl` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'qrUrl');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `eInvoiceStatus` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'eInvoiceStatus');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `whatsappSent` BOOLEAN NOT NULL DEFAULT false', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'whatsappSent');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `returnOfInvoiceId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'returnOfInvoiceId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `returnReason` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'returnReason');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Invoice` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND column_name = 'updatedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- InvoiceItem
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `invoiceId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'invoiceId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `stockItemId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'stockItemId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `itemCode` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'itemCode');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `name` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'name');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `hsnCode` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'hsnCode');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `purity` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'purity');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `huid` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'huid');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `grossWeight` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'grossWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `netWeight` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'netWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `stoneWeight` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'stoneWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `stoneAmount` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'stoneAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `stoneCertNo` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'stoneCertNo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `stones` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'stones');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `makingCharge` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'makingCharge');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `wastagePercent` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'wastagePercent');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `rate` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'rate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `amount` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'amount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `metalType` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'metalType');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `metalName` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'metalName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `itemCategory` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'itemCategory');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `size` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'size');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `qty` INTEGER NOT NULL DEFAULT 1', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'qty');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `lessWeight` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'lessWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `packetWeight` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'packetWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `tagWeight` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'tagWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `cwWeight` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'cwWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `valueAddPct` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'valueAddPct');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `valueAddAmount` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'valueAddAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `discountPct` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'discountPct');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `discountAmount` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'discountAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `otherCharges` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'otherCharges');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `markUp` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'markUp');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `counterNo` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'counterNo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `length` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'length');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `modelNo` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'modelNo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `otherInfo` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'otherInfo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `cgst` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'cgst');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `sgst` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'sgst');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `igst` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'igst');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `total` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'total');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `returnOfItemId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'returnOfItemId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `InvoiceItem` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Loan
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `loanNo` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'loanNo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `customerId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'customerId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `customerName` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'customerName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `customerMobile` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'customerMobile');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `userId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'userId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `loanDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'loanDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `loanType` VARCHAR(191) NOT NULL DEFAULT ''secured''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'loanType');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `principalAmount` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'principalAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `interestRate` DOUBLE NOT NULL DEFAULT 2', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'interestRate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `interestType` VARCHAR(191) NOT NULL DEFAULT ''monthly''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'interestType');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `interestConvention` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'interestConvention');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `timePeriod` INTEGER NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'timePeriod');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `dueDate` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'dueDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT ''active''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'status');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `wardNo` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'wardNo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `village` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'village');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `city` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'city');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `exFirmId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'exFirmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `trFirmId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'trFirmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `mlFirmId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'mlFirmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `pledgePlace` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'pledgePlace');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `packetNo` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'packetNo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `boxNo` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'boxNo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `lockerNo` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'lockerNo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `jointLoanNo` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'jointLoanNo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `processingFee` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'processingFee');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `transferDate` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'transferDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `transferPrincipal` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'transferPrincipal');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `transferRate` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'transferRate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `transferConvention` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'transferConvention');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `transferStatus` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'transferStatus');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `transferRedeemedDate` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'transferRedeemedDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `transferVoucherId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'transferVoucherId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `note` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'note');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `releasedDate` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'releasedDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `releasedAmount` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'releasedAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `totalInterest` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'totalInterest');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `totalAmount` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'totalAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `auctionDate` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'auctionDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `auctionAmount` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'auctionAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `auctionCharges` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'auctionCharges');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `auctionSurplus` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'auctionSurplus');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `photoUrl` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'photoUrl');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Loan` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND column_name = 'updatedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- LoanItem
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanItem` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanItem') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanItem` ADD COLUMN `loanId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanItem') AND column_name = 'loanId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanItem` ADD COLUMN `stockItemId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanItem') AND column_name = 'stockItemId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanItem` ADD COLUMN `name` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanItem') AND column_name = 'name');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanItem` ADD COLUMN `purity` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanItem') AND column_name = 'purity');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanItem` ADD COLUMN `grossWeight` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanItem') AND column_name = 'grossWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanItem` ADD COLUMN `netWeight` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanItem') AND column_name = 'netWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanItem` ADD COLUMN `stoneWeight` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanItem') AND column_name = 'stoneWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanItem` ADD COLUMN `estimatedValue` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanItem') AND column_name = 'estimatedValue');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanItem` ADD COLUMN `photoUrl` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanItem') AND column_name = 'photoUrl');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanItem` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanItem') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- LoanTransaction
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanTransaction` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanTransaction') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanTransaction` ADD COLUMN `loanId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanTransaction') AND column_name = 'loanId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanTransaction` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanTransaction') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanTransaction` ADD COLUMN `userId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanTransaction') AND column_name = 'userId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanTransaction` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanTransaction') AND column_name = 'type');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanTransaction` ADD COLUMN `stream` VARCHAR(191) NOT NULL DEFAULT ''in''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanTransaction') AND column_name = 'stream');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanTransaction` ADD COLUMN `amount` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanTransaction') AND column_name = 'amount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanTransaction` ADD COLUMN `principalComponent` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanTransaction') AND column_name = 'principalComponent');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanTransaction` ADD COLUMN `interestComponent` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanTransaction') AND column_name = 'interestComponent');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanTransaction` ADD COLUMN `discount` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanTransaction') AND column_name = 'discount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanTransaction` ADD COLUMN `charges` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanTransaction') AND column_name = 'charges');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanTransaction` ADD COLUMN `paymentMode` VARCHAR(191) NOT NULL DEFAULT ''cash''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanTransaction') AND column_name = 'paymentMode');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanTransaction` ADD COLUMN `reversalOfId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanTransaction') AND column_name = 'reversalOfId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanTransaction` ADD COLUMN `voucherId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanTransaction') AND column_name = 'voucherId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanTransaction` ADD COLUMN `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanTransaction') AND column_name = 'date');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanTransaction` ADD COLUMN `note` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanTransaction') AND column_name = 'note');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoanTransaction` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanTransaction') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Udhaar
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Udhaar` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Udhaar` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Udhaar` ADD COLUMN `customerId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND column_name = 'customerId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Udhaar` ADD COLUMN `customerName` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND column_name = 'customerName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Udhaar` ADD COLUMN `customerMobile` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND column_name = 'customerMobile');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Udhaar` ADD COLUMN `village` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND column_name = 'village');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Udhaar` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT ''credit''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND column_name = 'type');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Udhaar` ADD COLUMN `transactionType` VARCHAR(191) NOT NULL DEFAULT ''cash''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND column_name = 'transactionType');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Udhaar` ADD COLUMN `amount` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND column_name = 'amount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Udhaar` ADD COLUMN `description` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND column_name = 'description');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Udhaar` ADD COLUMN `dueDate` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND column_name = 'dueDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Udhaar` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT ''active''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND column_name = 'status');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Udhaar` ADD COLUMN `settledAmount` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND column_name = 'settledAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Udhaar` ADD COLUMN `metal` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND column_name = 'metal');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Udhaar` ADD COLUMN `grams` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND column_name = 'grams');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Udhaar` ADD COLUMN `settledGrams` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND column_name = 'settledGrams');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Udhaar` ADD COLUMN `interestRate` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND column_name = 'interestRate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Udhaar` ADD COLUMN `interestType` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND column_name = 'interestType');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Udhaar` ADD COLUMN `interestStartDate` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND column_name = 'interestStartDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Udhaar` ADD COLUMN `interestEndDate` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND column_name = 'interestEndDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Udhaar` ADD COLUMN `interestConvention` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND column_name = 'interestConvention');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Udhaar` ADD COLUMN `emiIntervalDays` INTEGER NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND column_name = 'emiIntervalDays');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Udhaar` ADD COLUMN `emiOccurrences` INTEGER NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND column_name = 'emiOccurrences');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Udhaar` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Udhaar` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND column_name = 'updatedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- UdhaarPayment
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `UdhaarPayment` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('UdhaarPayment') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `UdhaarPayment` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('UdhaarPayment') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `UdhaarPayment` ADD COLUMN `udhaarId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('UdhaarPayment') AND column_name = 'udhaarId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `UdhaarPayment` ADD COLUMN `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('UdhaarPayment') AND column_name = 'date');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `UdhaarPayment` ADD COLUMN `amount` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('UdhaarPayment') AND column_name = 'amount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `UdhaarPayment` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT ''part_payment''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('UdhaarPayment') AND column_name = 'type');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `UdhaarPayment` ADD COLUMN `interestComponent` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('UdhaarPayment') AND column_name = 'interestComponent');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `UdhaarPayment` ADD COLUMN `principalComponent` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('UdhaarPayment') AND column_name = 'principalComponent');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `UdhaarPayment` ADD COLUMN `paymentMode` VARCHAR(191) NOT NULL DEFAULT ''cash''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('UdhaarPayment') AND column_name = 'paymentMode');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `UdhaarPayment` ADD COLUMN `note` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('UdhaarPayment') AND column_name = 'note');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `UdhaarPayment` ADD COLUMN `voucherId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('UdhaarPayment') AND column_name = 'voucherId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `UdhaarPayment` ADD COLUMN `reversalOfId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('UdhaarPayment') AND column_name = 'reversalOfId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `UdhaarPayment` ADD COLUMN `userId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('UdhaarPayment') AND column_name = 'userId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `UdhaarPayment` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('UdhaarPayment') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Scheme
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Scheme` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Scheme') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Scheme` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Scheme') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Scheme` ADD COLUMN `name` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Scheme') AND column_name = 'name');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Scheme` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT ''cash''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Scheme') AND column_name = 'type');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Scheme` ADD COLUMN `groupName` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Scheme') AND column_name = 'groupName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Scheme` ADD COLUMN `emiAmount` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Scheme') AND column_name = 'emiAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Scheme` ADD COLUMN `durationMonths` INTEGER NOT NULL DEFAULT 11', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Scheme') AND column_name = 'durationMonths');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Scheme` ADD COLUMN `totalInstallments` INTEGER NOT NULL DEFAULT 11', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Scheme') AND column_name = 'totalInstallments');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Scheme` ADD COLUMN `bonusMonths` INTEGER NOT NULL DEFAULT 1', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Scheme') AND column_name = 'bonusMonths');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Scheme` ADD COLUMN `minAmount` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Scheme') AND column_name = 'minAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Scheme` ADD COLUMN `maxAmount` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Scheme') AND column_name = 'maxAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Scheme` ADD COLUMN `interestRate` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Scheme') AND column_name = 'interestRate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Scheme` ADD COLUMN `description` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Scheme') AND column_name = 'description');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Scheme` ADD COLUMN `active` BOOLEAN NOT NULL DEFAULT true', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Scheme') AND column_name = 'active');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Scheme` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Scheme') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Scheme` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Scheme') AND column_name = 'updatedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- SchemeEntry
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeEntry` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeEntry` ADD COLUMN `schemeId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND column_name = 'schemeId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeEntry` ADD COLUMN `customerId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND column_name = 'customerId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeEntry` ADD COLUMN `customerName` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND column_name = 'customerName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeEntry` ADD COLUMN `customerMobile` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND column_name = 'customerMobile');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeEntry` ADD COLUMN `userId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND column_name = 'userId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeEntry` ADD COLUMN `startDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND column_name = 'startDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeEntry` ADD COLUMN `emiAmount` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND column_name = 'emiAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeEntry` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT ''cash''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND column_name = 'type');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeEntry` ADD COLUMN `totalInstallments` INTEGER NOT NULL DEFAULT 11', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND column_name = 'totalInstallments');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeEntry` ADD COLUMN `bonusAmount` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND column_name = 'bonusAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeEntry` ADD COLUMN `bonusGrams` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND column_name = 'bonusGrams');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeEntry` ADD COLUMN `bonusRate` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND column_name = 'bonusRate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeEntry` ADD COLUMN `maturityDate` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND column_name = 'maturityDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeEntry` ADD COLUMN `earlyExitDeduction` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND column_name = 'earlyExitDeduction');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeEntry` ADD COLUMN `closedDate` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND column_name = 'closedDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeEntry` ADD COLUMN `invoiceId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND column_name = 'invoiceId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeEntry` ADD COLUMN `paidInstallments` INTEGER NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND column_name = 'paidInstallments');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeEntry` ADD COLUMN `totalPaid` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND column_name = 'totalPaid');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeEntry` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT ''active''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND column_name = 'status');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeEntry` ADD COLUMN `nomineeName` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND column_name = 'nomineeName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeEntry` ADD COLUMN `nomineeRelation` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND column_name = 'nomineeRelation');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeEntry` ADD COLUMN `otherInfo` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND column_name = 'otherInfo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeEntry` ADD COLUMN `payInfo` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND column_name = 'payInfo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeEntry` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeEntry` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND column_name = 'updatedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- SchemeInstallment
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeInstallment` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeInstallment') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeInstallment` ADD COLUMN `entryId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeInstallment') AND column_name = 'entryId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeInstallment` ADD COLUMN `installmentNo` INTEGER NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeInstallment') AND column_name = 'installmentNo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeInstallment` ADD COLUMN `amount` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeInstallment') AND column_name = 'amount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeInstallment` ADD COLUMN `metalRate` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeInstallment') AND column_name = 'metalRate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeInstallment` ADD COLUMN `grams` DOUBLE NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeInstallment') AND column_name = 'grams');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeInstallment` ADD COLUMN `paidDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeInstallment') AND column_name = 'paidDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeInstallment` ADD COLUMN `paymentMode` VARCHAR(191) NOT NULL DEFAULT ''cash''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeInstallment') AND column_name = 'paymentMode');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeInstallment` ADD COLUMN `note` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeInstallment') AND column_name = 'note');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeInstallment` ADD COLUMN `voucherId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeInstallment') AND column_name = 'voucherId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SchemeInstallment` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeInstallment') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Expense
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Expense` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Expense') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Expense` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Expense') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Expense` ADD COLUMN `userId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Expense') AND column_name = 'userId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Expense` ADD COLUMN `category` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Expense') AND column_name = 'category');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Expense` ADD COLUMN `description` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Expense') AND column_name = 'description');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Expense` ADD COLUMN `amount` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Expense') AND column_name = 'amount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Expense` ADD COLUMN `paymentMode` VARCHAR(191) NOT NULL DEFAULT ''cash''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Expense') AND column_name = 'paymentMode');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Expense` ADD COLUMN `expenseDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Expense') AND column_name = 'expenseDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Expense` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Expense') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Account
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Account` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Account') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Account` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Account') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Account` ADD COLUMN `code` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Account') AND column_name = 'code');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Account` ADD COLUMN `name` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Account') AND column_name = 'name');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Account` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Account') AND column_name = 'type');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Account` ADD COLUMN `group` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Account') AND column_name = 'group');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Account` ADD COLUMN `openingBalance` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Account') AND column_name = 'openingBalance');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Account` ADD COLUMN `balanceType` VARCHAR(191) NOT NULL DEFAULT ''debit''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Account') AND column_name = 'balanceType');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Account` ADD COLUMN `active` BOOLEAN NOT NULL DEFAULT true', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Account') AND column_name = 'active');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Account` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Account') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- LedgerEntry
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LedgerEntry` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LedgerEntry') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LedgerEntry` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LedgerEntry') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LedgerEntry` ADD COLUMN `accountId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LedgerEntry') AND column_name = 'accountId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LedgerEntry` ADD COLUMN `accountName` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LedgerEntry') AND column_name = 'accountName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LedgerEntry` ADD COLUMN `customerId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LedgerEntry') AND column_name = 'customerId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LedgerEntry` ADD COLUMN `invoiceId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LedgerEntry') AND column_name = 'invoiceId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LedgerEntry` ADD COLUMN `loanId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LedgerEntry') AND column_name = 'loanId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LedgerEntry` ADD COLUMN `voucherId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LedgerEntry') AND column_name = 'voucherId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LedgerEntry` ADD COLUMN `reversalOfId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LedgerEntry') AND column_name = 'reversalOfId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LedgerEntry` ADD COLUMN `userId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LedgerEntry') AND column_name = 'userId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LedgerEntry` ADD COLUMN `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LedgerEntry') AND column_name = 'date');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LedgerEntry` ADD COLUMN `particulars` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LedgerEntry') AND column_name = 'particulars');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LedgerEntry` ADD COLUMN `debit` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LedgerEntry') AND column_name = 'debit');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LedgerEntry` ADD COLUMN `credit` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LedgerEntry') AND column_name = 'credit');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LedgerEntry` ADD COLUMN `balance` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LedgerEntry') AND column_name = 'balance');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LedgerEntry` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LedgerEntry') AND column_name = 'type');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LedgerEntry` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LedgerEntry') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- GoldRate
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `GoldRate` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('GoldRate') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `GoldRate` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('GoldRate') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `GoldRate` ADD COLUMN `metal` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('GoldRate') AND column_name = 'metal');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `GoldRate` ADD COLUMN `purity` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('GoldRate') AND column_name = 'purity');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `GoldRate` ADD COLUMN `rate` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('GoldRate') AND column_name = 'rate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `GoldRate` ADD COLUMN `unit` VARCHAR(191) NOT NULL DEFAULT ''per_10_gram''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('GoldRate') AND column_name = 'unit');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `GoldRate` ADD COLUMN `rateDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('GoldRate') AND column_name = 'rateDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `GoldRate` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('GoldRate') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Setting
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Setting` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Setting') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Setting` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Setting') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Setting` ADD COLUMN `key` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Setting') AND column_name = 'key');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Setting` ADD COLUMN `value` TEXT NOT NULL DEFAULT ('''')', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Setting') AND column_name = 'value');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Setting` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Setting') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Setting` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Setting') AND column_name = 'updatedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- SmsLog
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SmsLog` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SmsLog') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SmsLog` ADD COLUMN `firmId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SmsLog') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SmsLog` ADD COLUMN `userId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SmsLog') AND column_name = 'userId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SmsLog` ADD COLUMN `mobile` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SmsLog') AND column_name = 'mobile');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SmsLog` ADD COLUMN `message` TEXT NOT NULL DEFAULT ('''')', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SmsLog') AND column_name = 'message');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SmsLog` ADD COLUMN `template` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SmsLog') AND column_name = 'template');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SmsLog` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT ''transactional''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SmsLog') AND column_name = 'type');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SmsLog` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT ''sent''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SmsLog') AND column_name = 'status');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SmsLog` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SmsLog') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- SystemLog
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SystemLog` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SystemLog') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SystemLog` ADD COLUMN `firmId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SystemLog') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SystemLog` ADD COLUMN `userId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SystemLog') AND column_name = 'userId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SystemLog` ADD COLUMN `action` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SystemLog') AND column_name = 'action');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SystemLog` ADD COLUMN `entity` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SystemLog') AND column_name = 'entity');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SystemLog` ADD COLUMN `entityId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SystemLog') AND column_name = 'entityId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SystemLog` ADD COLUMN `details` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SystemLog') AND column_name = 'details');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SystemLog` ADD COLUMN `ipAddress` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SystemLog') AND column_name = 'ipAddress');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `SystemLog` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SystemLog') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Task
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Task` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Task') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Task` ADD COLUMN `firmId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Task') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Task` ADD COLUMN `userId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Task') AND column_name = 'userId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Task` ADD COLUMN `customerId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Task') AND column_name = 'customerId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Task` ADD COLUMN `subject` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Task') AND column_name = 'subject');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Task` ADD COLUMN `category` VARCHAR(191) NOT NULL DEFAULT ''general''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Task') AND column_name = 'category');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Task` ADD COLUMN `priority` VARCHAR(191) NOT NULL DEFAULT ''medium''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Task') AND column_name = 'priority');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Task` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT ''pending''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Task') AND column_name = 'status');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Task` ADD COLUMN `dueDate` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Task') AND column_name = 'dueDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Task` ADD COLUMN `note` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Task') AND column_name = 'note');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Task` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Task') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Task` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Task') AND column_name = 'updatedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Order
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Order` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Order') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Order` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Order') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Order` ADD COLUMN `orderNo` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Order') AND column_name = 'orderNo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Order` ADD COLUMN `customerId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Order') AND column_name = 'customerId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Order` ADD COLUMN `customerName` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Order') AND column_name = 'customerName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Order` ADD COLUMN `customerMobile` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Order') AND column_name = 'customerMobile');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Order` ADD COLUMN `userId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Order') AND column_name = 'userId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Order` ADD COLUMN `orderDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Order') AND column_name = 'orderDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Order` ADD COLUMN `deliveryDate` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Order') AND column_name = 'deliveryDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Order` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT ''pending''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Order') AND column_name = 'status');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Order` ADD COLUMN `totalAmount` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Order') AND column_name = 'totalAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Order` ADD COLUMN `advanceAmount` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Order') AND column_name = 'advanceAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Order` ADD COLUMN `note` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Order') AND column_name = 'note');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Order` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Order') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Order` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Order') AND column_name = 'updatedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Quotation
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Quotation` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Quotation') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Quotation` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Quotation') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Quotation` ADD COLUMN `quoteNo` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Quotation') AND column_name = 'quoteNo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Quotation` ADD COLUMN `customerId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Quotation') AND column_name = 'customerId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Quotation` ADD COLUMN `customerName` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Quotation') AND column_name = 'customerName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Quotation` ADD COLUMN `customerMobile` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Quotation') AND column_name = 'customerMobile');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Quotation` ADD COLUMN `userId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Quotation') AND column_name = 'userId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Quotation` ADD COLUMN `quoteDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Quotation') AND column_name = 'quoteDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Quotation` ADD COLUMN `validTill` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Quotation') AND column_name = 'validTill');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Quotation` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT ''quotation''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Quotation') AND column_name = 'type');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Quotation` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT ''open''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Quotation') AND column_name = 'status');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Quotation` ADD COLUMN `goldRate` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Quotation') AND column_name = 'goldRate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Quotation` ADD COLUMN `subtotal` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Quotation') AND column_name = 'subtotal');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Quotation` ADD COLUMN `discount` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Quotation') AND column_name = 'discount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Quotation` ADD COLUMN `cgst` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Quotation') AND column_name = 'cgst');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Quotation` ADD COLUMN `sgst` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Quotation') AND column_name = 'sgst');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Quotation` ADD COLUMN `igst` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Quotation') AND column_name = 'igst');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Quotation` ADD COLUMN `totalAmount` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Quotation') AND column_name = 'totalAmount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Quotation` ADD COLUMN `note` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Quotation') AND column_name = 'note');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Quotation` ADD COLUMN `convertedInvoiceId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Quotation') AND column_name = 'convertedInvoiceId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Quotation` ADD COLUMN `whatsappSent` BOOLEAN NOT NULL DEFAULT false', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Quotation') AND column_name = 'whatsappSent');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Quotation` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Quotation') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Quotation` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Quotation') AND column_name = 'updatedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- QuotationItem
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `QuotationItem` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('QuotationItem') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `QuotationItem` ADD COLUMN `quotationId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('QuotationItem') AND column_name = 'quotationId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `QuotationItem` ADD COLUMN `stockItemId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('QuotationItem') AND column_name = 'stockItemId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `QuotationItem` ADD COLUMN `name` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('QuotationItem') AND column_name = 'name');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `QuotationItem` ADD COLUMN `purity` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('QuotationItem') AND column_name = 'purity');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `QuotationItem` ADD COLUMN `netWeight` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('QuotationItem') AND column_name = 'netWeight');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `QuotationItem` ADD COLUMN `rate` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('QuotationItem') AND column_name = 'rate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `QuotationItem` ADD COLUMN `makingCharge` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('QuotationItem') AND column_name = 'makingCharge');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `QuotationItem` ADD COLUMN `amount` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('QuotationItem') AND column_name = 'amount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `QuotationItem` ADD COLUMN `total` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('QuotationItem') AND column_name = 'total');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Repair
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Repair` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Repair` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Repair` ADD COLUMN `repairNo` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND column_name = 'repairNo');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Repair` ADD COLUMN `customerId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND column_name = 'customerId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Repair` ADD COLUMN `customerName` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND column_name = 'customerName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Repair` ADD COLUMN `customerMobile` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND column_name = 'customerMobile');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Repair` ADD COLUMN `karigarId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND column_name = 'karigarId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Repair` ADD COLUMN `karigarName` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND column_name = 'karigarName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Repair` ADD COLUMN `userId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND column_name = 'userId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Repair` ADD COLUMN `intakeDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND column_name = 'intakeDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Repair` ADD COLUMN `deliveryDate` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND column_name = 'deliveryDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Repair` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT ''received''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND column_name = 'status');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Repair` ADD COLUMN `itemName` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND column_name = 'itemName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Repair` ADD COLUMN `itemDesc` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND column_name = 'itemDesc');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Repair` ADD COLUMN `problem` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND column_name = 'problem');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Repair` ADD COLUMN `estimatedCost` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND column_name = 'estimatedCost');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Repair` ADD COLUMN `finalCost` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND column_name = 'finalCost');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Repair` ADD COLUMN `advancePaid` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND column_name = 'advancePaid');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Repair` ADD COLUMN `smsSent` BOOLEAN NOT NULL DEFAULT false', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND column_name = 'smsSent');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Repair` ADD COLUMN `note` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND column_name = 'note');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Repair` ADD COLUMN `invoiceId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND column_name = 'invoiceId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Repair` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Repair` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND column_name = 'updatedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- LoyaltyPoint
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoyaltyPoint` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoyaltyPoint') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoyaltyPoint` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoyaltyPoint') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoyaltyPoint` ADD COLUMN `customerId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoyaltyPoint') AND column_name = 'customerId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoyaltyPoint` ADD COLUMN `points` INTEGER NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoyaltyPoint') AND column_name = 'points');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoyaltyPoint` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoyaltyPoint') AND column_name = 'type');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoyaltyPoint` ADD COLUMN `refInvoiceId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoyaltyPoint') AND column_name = 'refInvoiceId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoyaltyPoint` ADD COLUMN `note` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoyaltyPoint') AND column_name = 'note');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `LoyaltyPoint` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoyaltyPoint') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- BankAccount
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankAccount` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankAccount') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankAccount` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankAccount') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankAccount` ADD COLUMN `accountId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankAccount') AND column_name = 'accountId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankAccount` ADD COLUMN `name` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankAccount') AND column_name = 'name');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankAccount` ADD COLUMN `bankName` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankAccount') AND column_name = 'bankName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankAccount` ADD COLUMN `accountNumber` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankAccount') AND column_name = 'accountNumber');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankAccount` ADD COLUMN `ifsc` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankAccount') AND column_name = 'ifsc');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankAccount` ADD COLUMN `branch` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankAccount') AND column_name = 'branch');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankAccount` ADD COLUMN `openingBalance` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankAccount') AND column_name = 'openingBalance');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankAccount` ADD COLUMN `openingDate` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankAccount') AND column_name = 'openingDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankAccount` ADD COLUMN `active` BOOLEAN NOT NULL DEFAULT true', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankAccount') AND column_name = 'active');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankAccount` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankAccount') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankAccount` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankAccount') AND column_name = 'updatedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- BankTransaction
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankTransaction` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankTransaction') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankTransaction` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankTransaction') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankTransaction` ADD COLUMN `bankAccountId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankTransaction') AND column_name = 'bankAccountId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankTransaction` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankTransaction') AND column_name = 'type');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankTransaction` ADD COLUMN `counterAccountName` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankTransaction') AND column_name = 'counterAccountName');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankTransaction` ADD COLUMN `toBankAccountId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankTransaction') AND column_name = 'toBankAccountId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankTransaction` ADD COLUMN `amount` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankTransaction') AND column_name = 'amount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankTransaction` ADD COLUMN `transactionDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankTransaction') AND column_name = 'transactionDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankTransaction` ADD COLUMN `clearingDate` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankTransaction') AND column_name = 'clearingDate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankTransaction` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT ''cleared''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankTransaction') AND column_name = 'status');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankTransaction` ADD COLUMN `chequeNumber` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankTransaction') AND column_name = 'chequeNumber');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankTransaction` ADD COLUMN `narration` TEXT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankTransaction') AND column_name = 'narration');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankTransaction` ADD COLUMN `voucherId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankTransaction') AND column_name = 'voucherId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankTransaction` ADD COLUMN `clearVoucherId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankTransaction') AND column_name = 'clearVoucherId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankTransaction` ADD COLUMN `reversalVoucherId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankTransaction') AND column_name = 'reversalVoucherId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankTransaction` ADD COLUMN `userId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankTransaction') AND column_name = 'userId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankTransaction` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankTransaction') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- BankStatementLine
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankStatementLine` ADD COLUMN `id` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankStatementLine') AND column_name = 'id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankStatementLine` ADD COLUMN `firmId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankStatementLine') AND column_name = 'firmId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankStatementLine` ADD COLUMN `bankAccountId` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankStatementLine') AND column_name = 'bankAccountId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankStatementLine` ADD COLUMN `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankStatementLine') AND column_name = 'date');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankStatementLine` ADD COLUMN `description` TEXT NOT NULL DEFAULT ('''')', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankStatementLine') AND column_name = 'description');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankStatementLine` ADD COLUMN `debit` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankStatementLine') AND column_name = 'debit');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankStatementLine` ADD COLUMN `credit` DOUBLE NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankStatementLine') AND column_name = 'credit');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankStatementLine` ADD COLUMN `reference` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankStatementLine') AND column_name = 'reference');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankStatementLine` ADD COLUMN `matchedVoucherId` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankStatementLine') AND column_name = 'matchedVoucherId');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankStatementLine` ADD COLUMN `matchedAt` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankStatementLine') AND column_name = 'matchedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankStatementLine` ADD COLUMN `matchedBy` VARCHAR(191) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankStatementLine') AND column_name = 'matchedBy');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankStatementLine` ADD COLUMN `importBatch` VARCHAR(191) NOT NULL DEFAULT ''''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankStatementLine') AND column_name = 'importBatch');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `BankStatementLine` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankStatementLine') AND column_name = 'createdAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===== 3. Indexes (94, of which 14 unique) =====

SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `User` WHERE `loginId` IS NOT NULL GROUP BY `loginId` HAVING COUNT(*) > 1 LIMIT 1) d) = 0, 'CREATE UNIQUE INDEX `User_loginId_key` ON `User`(`loginId`)', 'SELECT ''WARNING: unique index User_loginId_key NOT created - duplicate keys exist in User'' AS migration_warning'), 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('User') AND index_name = 'User_loginId_key');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `User` WHERE `email` IS NOT NULL GROUP BY `email` HAVING COUNT(*) > 1 LIMIT 1) d) = 0, 'CREATE UNIQUE INDEX `User_email_key` ON `User`(`email`)', 'SELECT ''WARNING: unique index User_email_key NOT created - duplicate keys exist in User'' AS migration_warning'), 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('User') AND index_name = 'User_email_key');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Firm` WHERE `code` IS NOT NULL GROUP BY `code` HAVING COUNT(*) > 1 LIMIT 1) d) = 0, 'CREATE UNIQUE INDEX `Firm_code_key` ON `Firm`(`code`)', 'SELECT ''WARNING: unique index Firm_code_key NOT created - duplicate keys exist in Firm'' AS migration_warning'), 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Firm') AND index_name = 'Firm_code_key');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `UserFirm_firmId_idx` ON `UserFirm`(`firmId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('UserFirm') AND index_name = 'UserFirm_firmId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `UserFirm` WHERE `userId` IS NOT NULL AND `firmId` IS NOT NULL GROUP BY `userId`, `firmId` HAVING COUNT(*) > 1 LIMIT 1) d) = 0, 'CREATE UNIQUE INDEX `UserFirm_userId_firmId_key` ON `UserFirm`(`userId`, `firmId`)', 'SELECT ''WARNING: unique index UserFirm_userId_firmId_key NOT created - duplicate keys exist in UserFirm'' AS migration_warning'), 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('UserFirm') AND index_name = 'UserFirm_userId_firmId_key');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Customer_firmId_type_idx` ON `Customer`(`firmId`, `type`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND index_name = 'Customer_firmId_type_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Customer_firmId_createdAt_idx` ON `Customer`(`firmId`, `createdAt`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Customer') AND index_name = 'Customer_firmId_createdAt_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `StockItem_firmId_category_idx` ON `StockItem`(`firmId`, `category`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND index_name = 'StockItem_firmId_category_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `StockItem_firmId_status_idx` ON `StockItem`(`firmId`, `status`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND index_name = 'StockItem_firmId_status_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `StockItem_firmId_createdAt_idx` ON `StockItem`(`firmId`, `createdAt`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND index_name = 'StockItem_firmId_createdAt_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `StockItem` WHERE `firmId` IS NOT NULL AND `itemCode` IS NOT NULL GROUP BY `firmId`, `itemCode` HAVING COUNT(*) > 1 LIMIT 1) d) = 0, 'CREATE UNIQUE INDEX `StockItem_firmId_itemCode_key` ON `StockItem`(`firmId`, `itemCode`)', 'SELECT ''WARNING: unique index StockItem_firmId_itemCode_key NOT created - duplicate keys exist in StockItem'' AS migration_warning'), 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND index_name = 'StockItem_firmId_itemCode_key');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `StockItem` WHERE `firmId` IS NOT NULL AND `hallmarkUid` IS NOT NULL GROUP BY `firmId`, `hallmarkUid` HAVING COUNT(*) > 1 LIMIT 1) d) = 0, 'CREATE UNIQUE INDEX `StockItem_firmId_hallmarkUid_key` ON `StockItem`(`firmId`, `hallmarkUid`)', 'SELECT ''WARNING: unique index StockItem_firmId_hallmarkUid_key NOT created - duplicate keys exist in StockItem'' AS migration_warning'), 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND index_name = 'StockItem_firmId_hallmarkUid_key');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `StockItem` WHERE `firmId` IS NOT NULL AND `rfidNo` IS NOT NULL GROUP BY `firmId`, `rfidNo` HAVING COUNT(*) > 1 LIMIT 1) d) = 0, 'CREATE UNIQUE INDEX `StockItem_firmId_rfidNo_key` ON `StockItem`(`firmId`, `rfidNo`)', 'SELECT ''WARNING: unique index StockItem_firmId_rfidNo_key NOT created - duplicate keys exist in StockItem'' AS migration_warning'), 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockItem') AND index_name = 'StockItem_firmId_rfidNo_key');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Stone_firmId_idx` ON `Stone`(`firmId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Stone') AND index_name = 'Stone_firmId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Stone_stockItemId_seq_idx` ON `Stone`(`stockItemId`, `seq`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Stone') AND index_name = 'Stone_stockItemId_seq_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `HallmarkBatch_firmId_status_idx` ON `HallmarkBatch`(`firmId`, `status`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('HallmarkBatch') AND index_name = 'HallmarkBatch_firmId_status_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `HallmarkBatchItem_batchId_idx` ON `HallmarkBatchItem`(`batchId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('HallmarkBatchItem') AND index_name = 'HallmarkBatchItem_batchId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `HallmarkBatchItem_itemId_idx` ON `HallmarkBatchItem`(`itemId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('HallmarkBatchItem') AND index_name = 'HallmarkBatchItem_itemId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `MeltBatch` WHERE `resultItemId` IS NOT NULL GROUP BY `resultItemId` HAVING COUNT(*) > 1 LIMIT 1) d) = 0, 'CREATE UNIQUE INDEX `MeltBatch_resultItemId_key` ON `MeltBatch`(`resultItemId`)', 'SELECT ''WARNING: unique index MeltBatch_resultItemId_key NOT created - duplicate keys exist in MeltBatch'' AS migration_warning'), 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatch') AND index_name = 'MeltBatch_resultItemId_key');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `MeltBatch_firmId_status_idx` ON `MeltBatch`(`firmId`, `status`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatch') AND index_name = 'MeltBatch_firmId_status_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `MeltBatchItem_batchId_idx` ON `MeltBatchItem`(`batchId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatchItem') AND index_name = 'MeltBatchItem_batchId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `MeltBatchItem_itemId_idx` ON `MeltBatchItem`(`itemId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('MeltBatchItem') AND index_name = 'MeltBatchItem_itemId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `StockTransfer_firmId_status_idx` ON `StockTransfer`(`firmId`, `status`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTransfer') AND index_name = 'StockTransfer_firmId_status_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `StockTransfer_itemId_idx` ON `StockTransfer`(`itemId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTransfer') AND index_name = 'StockTransfer_itemId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `StockTally_firmId_status_idx` ON `StockTally`(`firmId`, `status`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTally') AND index_name = 'StockTally_firmId_status_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `StockTally_firmId_startedAt_idx` ON `StockTally`(`firmId`, `startedAt`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTally') AND index_name = 'StockTally_firmId_startedAt_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `StockTallyScan_firmId_scannedAt_idx` ON `StockTallyScan`(`firmId`, `scannedAt`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTallyScan') AND index_name = 'StockTallyScan_firmId_scannedAt_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `StockTallyScan` WHERE `tallyId` IS NOT NULL AND `code` IS NOT NULL GROUP BY `tallyId`, `code` HAVING COUNT(*) > 1 LIMIT 1) d) = 0, 'CREATE UNIQUE INDEX `StockTallyScan_tallyId_code_key` ON `StockTallyScan`(`tallyId`, `code`)', 'SELECT ''WARNING: unique index StockTallyScan_tallyId_code_key NOT created - duplicate keys exist in StockTallyScan'' AS migration_warning'), 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('StockTallyScan') AND index_name = 'StockTallyScan_tallyId_code_key');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Invoice_firmId_invoiceDate_idx` ON `Invoice`(`firmId`, `invoiceDate`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND index_name = 'Invoice_firmId_invoiceDate_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Invoice_firmId_type_invoiceDate_idx` ON `Invoice`(`firmId`, `type`, `invoiceDate`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND index_name = 'Invoice_firmId_type_invoiceDate_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Invoice_customerId_idx` ON `Invoice`(`customerId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND index_name = 'Invoice_customerId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Invoice_userId_idx` ON `Invoice`(`userId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND index_name = 'Invoice_userId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Invoice_returnOfInvoiceId_idx` ON `Invoice`(`returnOfInvoiceId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND index_name = 'Invoice_returnOfInvoiceId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Invoice_salesPersonId_idx` ON `Invoice`(`salesPersonId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND index_name = 'Invoice_salesPersonId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Invoice_schemeEntryId_idx` ON `Invoice`(`schemeEntryId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND index_name = 'Invoice_schemeEntryId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Invoice` WHERE `firmId` IS NOT NULL AND `invoiceNo` IS NOT NULL GROUP BY `firmId`, `invoiceNo` HAVING COUNT(*) > 1 LIMIT 1) d) = 0, 'CREATE UNIQUE INDEX `Invoice_firmId_invoiceNo_key` ON `Invoice`(`firmId`, `invoiceNo`)', 'SELECT ''WARNING: unique index Invoice_firmId_invoiceNo_key NOT created - duplicate keys exist in Invoice'' AS migration_warning'), 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Invoice') AND index_name = 'Invoice_firmId_invoiceNo_key');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `InvoiceItem_invoiceId_idx` ON `InvoiceItem`(`invoiceId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND index_name = 'InvoiceItem_invoiceId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `InvoiceItem_stockItemId_idx` ON `InvoiceItem`(`stockItemId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND index_name = 'InvoiceItem_stockItemId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `InvoiceItem_returnOfItemId_idx` ON `InvoiceItem`(`returnOfItemId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('InvoiceItem') AND index_name = 'InvoiceItem_returnOfItemId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Loan_firmId_status_idx` ON `Loan`(`firmId`, `status`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND index_name = 'Loan_firmId_status_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Loan_firmId_loanDate_idx` ON `Loan`(`firmId`, `loanDate`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND index_name = 'Loan_firmId_loanDate_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Loan_customerId_idx` ON `Loan`(`customerId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND index_name = 'Loan_customerId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Loan_userId_idx` ON `Loan`(`userId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND index_name = 'Loan_userId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Loan_firmId_transferStatus_idx` ON `Loan`(`firmId`, `transferStatus`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Loan') AND index_name = 'Loan_firmId_transferStatus_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `LoanItem_loanId_idx` ON `LoanItem`(`loanId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanItem') AND index_name = 'LoanItem_loanId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `LoanItem_stockItemId_idx` ON `LoanItem`(`stockItemId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanItem') AND index_name = 'LoanItem_stockItemId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `LoanTransaction_loanId_idx` ON `LoanTransaction`(`loanId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanTransaction') AND index_name = 'LoanTransaction_loanId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `LoanTransaction_firmId_idx` ON `LoanTransaction`(`firmId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoanTransaction') AND index_name = 'LoanTransaction_firmId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Udhaar_firmId_idx` ON `Udhaar`(`firmId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND index_name = 'Udhaar_firmId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Udhaar_customerId_idx` ON `Udhaar`(`customerId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND index_name = 'Udhaar_customerId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Udhaar_firmId_createdAt_idx` ON `Udhaar`(`firmId`, `createdAt`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Udhaar') AND index_name = 'Udhaar_firmId_createdAt_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `UdhaarPayment_udhaarId_date_idx` ON `UdhaarPayment`(`udhaarId`, `date`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('UdhaarPayment') AND index_name = 'UdhaarPayment_udhaarId_date_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `UdhaarPayment_firmId_date_idx` ON `UdhaarPayment`(`firmId`, `date`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('UdhaarPayment') AND index_name = 'UdhaarPayment_firmId_date_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `UdhaarPayment_firmId_voucherId_idx` ON `UdhaarPayment`(`firmId`, `voucherId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('UdhaarPayment') AND index_name = 'UdhaarPayment_firmId_voucherId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Scheme_firmId_idx` ON `Scheme`(`firmId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Scheme') AND index_name = 'Scheme_firmId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `SchemeEntry_schemeId_idx` ON `SchemeEntry`(`schemeId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND index_name = 'SchemeEntry_schemeId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `SchemeEntry_customerId_idx` ON `SchemeEntry`(`customerId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND index_name = 'SchemeEntry_customerId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `SchemeEntry_userId_idx` ON `SchemeEntry`(`userId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeEntry') AND index_name = 'SchemeEntry_userId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `SchemeInstallment_entryId_idx` ON `SchemeInstallment`(`entryId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeInstallment') AND index_name = 'SchemeInstallment_entryId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `SchemeInstallment` WHERE `entryId` IS NOT NULL AND `installmentNo` IS NOT NULL GROUP BY `entryId`, `installmentNo` HAVING COUNT(*) > 1 LIMIT 1) d) = 0, 'CREATE UNIQUE INDEX `SchemeInstallment_entryId_installmentNo_key` ON `SchemeInstallment`(`entryId`, `installmentNo`)', 'SELECT ''WARNING: unique index SchemeInstallment_entryId_installmentNo_key NOT created - duplicate keys exist in SchemeInstallment'' AS migration_warning'), 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SchemeInstallment') AND index_name = 'SchemeInstallment_entryId_installmentNo_key');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Expense_firmId_expenseDate_idx` ON `Expense`(`firmId`, `expenseDate`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Expense') AND index_name = 'Expense_firmId_expenseDate_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Expense_userId_idx` ON `Expense`(`userId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Expense') AND index_name = 'Expense_userId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Account_firmId_idx` ON `Account`(`firmId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Account') AND index_name = 'Account_firmId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `LedgerEntry_firmId_date_idx` ON `LedgerEntry`(`firmId`, `date`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LedgerEntry') AND index_name = 'LedgerEntry_firmId_date_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `LedgerEntry_customerId_idx` ON `LedgerEntry`(`customerId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LedgerEntry') AND index_name = 'LedgerEntry_customerId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `LedgerEntry_voucherId_idx` ON `LedgerEntry`(`voucherId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LedgerEntry') AND index_name = 'LedgerEntry_voucherId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `LedgerEntry_reversalOfId_idx` ON `LedgerEntry`(`reversalOfId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LedgerEntry') AND index_name = 'LedgerEntry_reversalOfId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `GoldRate_firmId_rateDate_idx` ON `GoldRate`(`firmId`, `rateDate`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('GoldRate') AND index_name = 'GoldRate_firmId_rateDate_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Setting_firmId_idx` ON `Setting`(`firmId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Setting') AND index_name = 'Setting_firmId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Setting` WHERE `firmId` IS NOT NULL AND `key` IS NOT NULL GROUP BY `firmId`, `key` HAVING COUNT(*) > 1 LIMIT 1) d) = 0, 'CREATE UNIQUE INDEX `Setting_firmId_key_key` ON `Setting`(`firmId`, `key`)', 'SELECT ''WARNING: unique index Setting_firmId_key_key NOT created - duplicate keys exist in Setting'' AS migration_warning'), 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Setting') AND index_name = 'Setting_firmId_key_key');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `SmsLog_userId_idx` ON `SmsLog`(`userId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SmsLog') AND index_name = 'SmsLog_userId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `SystemLog_firmId_idx` ON `SystemLog`(`firmId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SystemLog') AND index_name = 'SystemLog_firmId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `SystemLog_userId_idx` ON `SystemLog`(`userId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('SystemLog') AND index_name = 'SystemLog_userId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Task_firmId_idx` ON `Task`(`firmId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Task') AND index_name = 'Task_firmId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Task_userId_idx` ON `Task`(`userId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Task') AND index_name = 'Task_userId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Order_firmId_idx` ON `Order`(`firmId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Order') AND index_name = 'Order_firmId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Order_userId_idx` ON `Order`(`userId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Order') AND index_name = 'Order_userId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Quotation_firmId_idx` ON `Quotation`(`firmId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Quotation') AND index_name = 'Quotation_firmId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Quotation_userId_idx` ON `Quotation`(`userId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Quotation') AND index_name = 'Quotation_userId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `QuotationItem_quotationId_idx` ON `QuotationItem`(`quotationId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('QuotationItem') AND index_name = 'QuotationItem_quotationId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `QuotationItem_stockItemId_idx` ON `QuotationItem`(`stockItemId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('QuotationItem') AND index_name = 'QuotationItem_stockItemId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Repair` WHERE `invoiceId` IS NOT NULL GROUP BY `invoiceId` HAVING COUNT(*) > 1 LIMIT 1) d) = 0, 'CREATE UNIQUE INDEX `Repair_invoiceId_key` ON `Repair`(`invoiceId`)', 'SELECT ''WARNING: unique index Repair_invoiceId_key NOT created - duplicate keys exist in Repair'' AS migration_warning'), 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND index_name = 'Repair_invoiceId_key');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Repair_firmId_idx` ON `Repair`(`firmId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND index_name = 'Repair_firmId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Repair_customerId_idx` ON `Repair`(`customerId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND index_name = 'Repair_customerId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Repair_karigarId_idx` ON `Repair`(`karigarId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND index_name = 'Repair_karigarId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Repair_userId_idx` ON `Repair`(`userId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('Repair') AND index_name = 'Repair_userId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `LoyaltyPoint_firmId_idx` ON `LoyaltyPoint`(`firmId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoyaltyPoint') AND index_name = 'LoyaltyPoint_firmId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `LoyaltyPoint_customerId_idx` ON `LoyaltyPoint`(`customerId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('LoyaltyPoint') AND index_name = 'LoyaltyPoint_customerId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `BankAccount_firmId_idx` ON `BankAccount`(`firmId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankAccount') AND index_name = 'BankAccount_firmId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `BankAccount` WHERE `firmId` IS NOT NULL AND `name` IS NOT NULL GROUP BY `firmId`, `name` HAVING COUNT(*) > 1 LIMIT 1) d) = 0, 'CREATE UNIQUE INDEX `BankAccount_firmId_name_key` ON `BankAccount`(`firmId`, `name`)', 'SELECT ''WARNING: unique index BankAccount_firmId_name_key NOT created - duplicate keys exist in BankAccount'' AS migration_warning'), 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankAccount') AND index_name = 'BankAccount_firmId_name_key');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `BankTransaction_firmId_bankAccountId_idx` ON `BankTransaction`(`firmId`, `bankAccountId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankTransaction') AND index_name = 'BankTransaction_firmId_bankAccountId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `BankTransaction_firmId_status_idx` ON `BankTransaction`(`firmId`, `status`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankTransaction') AND index_name = 'BankTransaction_firmId_status_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `BankStatementLine_firmId_bankAccountId_date_idx` ON `BankStatementLine`(`firmId`, `bankAccountId`, `date`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankStatementLine') AND index_name = 'BankStatementLine_firmId_bankAccountId_date_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `BankStatementLine_firmId_matchedVoucherId_idx` ON `BankStatementLine`(`firmId`, `matchedVoucherId`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('BankStatementLine') AND index_name = 'BankStatementLine_firmId_matchedVoucherId_idx');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===== 4. Foreign keys (69) =====

SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `UserFirm` c LEFT JOIN `User` p ON c.`userId` = p.`id` WHERE c.`userId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `UserFirm` ADD CONSTRAINT `UserFirm_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key UserFirm_userId_fkey NOT created - orphan rows exist in UserFirm'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'UserFirm_userId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `UserFirm` c LEFT JOIN `Firm` p ON c.`firmId` = p.`id` WHERE c.`firmId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `UserFirm` ADD CONSTRAINT `UserFirm_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key UserFirm_firmId_fkey NOT created - orphan rows exist in UserFirm'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'UserFirm_firmId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Customer` c LEFT JOIN `Firm` p ON c.`firmId` = p.`id` WHERE c.`firmId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Customer` ADD CONSTRAINT `Customer_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Customer_firmId_fkey NOT created - orphan rows exist in Customer'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Customer_firmId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `StockItem` c LEFT JOIN `Firm` p ON c.`firmId` = p.`id` WHERE c.`firmId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `StockItem` ADD CONSTRAINT `StockItem_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key StockItem_firmId_fkey NOT created - orphan rows exist in StockItem'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'StockItem_firmId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Stone` c LEFT JOIN `Firm` p ON c.`firmId` = p.`id` WHERE c.`firmId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Stone` ADD CONSTRAINT `Stone_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Stone_firmId_fkey NOT created - orphan rows exist in Stone'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Stone_firmId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Stone` c LEFT JOIN `StockItem` p ON c.`stockItemId` = p.`id` WHERE c.`stockItemId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Stone` ADD CONSTRAINT `Stone_stockItemId_fkey` FOREIGN KEY (`stockItemId`) REFERENCES `StockItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Stone_stockItemId_fkey NOT created - orphan rows exist in Stone'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Stone_stockItemId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `HallmarkBatch` c LEFT JOIN `Firm` p ON c.`firmId` = p.`id` WHERE c.`firmId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `HallmarkBatch` ADD CONSTRAINT `HallmarkBatch_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key HallmarkBatch_firmId_fkey NOT created - orphan rows exist in HallmarkBatch'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'HallmarkBatch_firmId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `HallmarkBatchItem` c LEFT JOIN `HallmarkBatch` p ON c.`batchId` = p.`id` WHERE c.`batchId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `HallmarkBatchItem` ADD CONSTRAINT `HallmarkBatchItem_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `HallmarkBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key HallmarkBatchItem_batchId_fkey NOT created - orphan rows exist in HallmarkBatchItem'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'HallmarkBatchItem_batchId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `HallmarkBatchItem` c LEFT JOIN `StockItem` p ON c.`itemId` = p.`id` WHERE c.`itemId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `HallmarkBatchItem` ADD CONSTRAINT `HallmarkBatchItem_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `StockItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key HallmarkBatchItem_itemId_fkey NOT created - orphan rows exist in HallmarkBatchItem'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'HallmarkBatchItem_itemId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `MeltBatch` c LEFT JOIN `Firm` p ON c.`firmId` = p.`id` WHERE c.`firmId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `MeltBatch` ADD CONSTRAINT `MeltBatch_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key MeltBatch_firmId_fkey NOT created - orphan rows exist in MeltBatch'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'MeltBatch_firmId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `MeltBatch` c LEFT JOIN `StockItem` p ON c.`resultItemId` = p.`id` WHERE c.`resultItemId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `MeltBatch` ADD CONSTRAINT `MeltBatch_resultItemId_fkey` FOREIGN KEY (`resultItemId`) REFERENCES `StockItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key MeltBatch_resultItemId_fkey NOT created - orphan rows exist in MeltBatch'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'MeltBatch_resultItemId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `MeltBatchItem` c LEFT JOIN `MeltBatch` p ON c.`batchId` = p.`id` WHERE c.`batchId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `MeltBatchItem` ADD CONSTRAINT `MeltBatchItem_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `MeltBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key MeltBatchItem_batchId_fkey NOT created - orphan rows exist in MeltBatchItem'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'MeltBatchItem_batchId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `MeltBatchItem` c LEFT JOIN `StockItem` p ON c.`itemId` = p.`id` WHERE c.`itemId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `MeltBatchItem` ADD CONSTRAINT `MeltBatchItem_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `StockItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key MeltBatchItem_itemId_fkey NOT created - orphan rows exist in MeltBatchItem'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'MeltBatchItem_itemId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `StockTransfer` c LEFT JOIN `StockItem` p ON c.`itemId` = p.`id` WHERE c.`itemId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `StockTransfer` ADD CONSTRAINT `StockTransfer_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `StockItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key StockTransfer_itemId_fkey NOT created - orphan rows exist in StockTransfer'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'StockTransfer_itemId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `StockTally` c LEFT JOIN `Firm` p ON c.`firmId` = p.`id` WHERE c.`firmId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `StockTally` ADD CONSTRAINT `StockTally_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key StockTally_firmId_fkey NOT created - orphan rows exist in StockTally'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'StockTally_firmId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `StockTally` c LEFT JOIN `User` p ON c.`userId` = p.`id` WHERE c.`userId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `StockTally` ADD CONSTRAINT `StockTally_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key StockTally_userId_fkey NOT created - orphan rows exist in StockTally'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'StockTally_userId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `StockTallyScan` c LEFT JOIN `StockTally` p ON c.`tallyId` = p.`id` WHERE c.`tallyId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `StockTallyScan` ADD CONSTRAINT `StockTallyScan_tallyId_fkey` FOREIGN KEY (`tallyId`) REFERENCES `StockTally`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key StockTallyScan_tallyId_fkey NOT created - orphan rows exist in StockTallyScan'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'StockTallyScan_tallyId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `StockTallyScan` c LEFT JOIN `StockItem` p ON c.`stockItemId` = p.`id` WHERE c.`stockItemId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `StockTallyScan` ADD CONSTRAINT `StockTallyScan_stockItemId_fkey` FOREIGN KEY (`stockItemId`) REFERENCES `StockItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key StockTallyScan_stockItemId_fkey NOT created - orphan rows exist in StockTallyScan'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'StockTallyScan_stockItemId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `StockTallyScan` c LEFT JOIN `User` p ON c.`userId` = p.`id` WHERE c.`userId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `StockTallyScan` ADD CONSTRAINT `StockTallyScan_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key StockTallyScan_userId_fkey NOT created - orphan rows exist in StockTallyScan'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'StockTallyScan_userId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Invoice` c LEFT JOIN `Firm` p ON c.`firmId` = p.`id` WHERE c.`firmId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Invoice_firmId_fkey NOT created - orphan rows exist in Invoice'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Invoice_firmId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Invoice` c LEFT JOIN `Customer` p ON c.`customerId` = p.`id` WHERE c.`customerId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Invoice_customerId_fkey NOT created - orphan rows exist in Invoice'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Invoice_customerId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Invoice` c LEFT JOIN `User` p ON c.`userId` = p.`id` WHERE c.`userId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Invoice_userId_fkey NOT created - orphan rows exist in Invoice'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Invoice_userId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Invoice` c LEFT JOIN `Customer` p ON c.`salesPersonId` = p.`id` WHERE c.`salesPersonId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_salesPersonId_fkey` FOREIGN KEY (`salesPersonId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Invoice_salesPersonId_fkey NOT created - orphan rows exist in Invoice'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Invoice_salesPersonId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `InvoiceItem` c LEFT JOIN `Invoice` p ON c.`invoiceId` = p.`id` WHERE c.`invoiceId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `InvoiceItem` ADD CONSTRAINT `InvoiceItem_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key InvoiceItem_invoiceId_fkey NOT created - orphan rows exist in InvoiceItem'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'InvoiceItem_invoiceId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `InvoiceItem` c LEFT JOIN `StockItem` p ON c.`stockItemId` = p.`id` WHERE c.`stockItemId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `InvoiceItem` ADD CONSTRAINT `InvoiceItem_stockItemId_fkey` FOREIGN KEY (`stockItemId`) REFERENCES `StockItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key InvoiceItem_stockItemId_fkey NOT created - orphan rows exist in InvoiceItem'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'InvoiceItem_stockItemId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Loan` c LEFT JOIN `Firm` p ON c.`firmId` = p.`id` WHERE c.`firmId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Loan` ADD CONSTRAINT `Loan_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Loan_firmId_fkey NOT created - orphan rows exist in Loan'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Loan_firmId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Loan` c LEFT JOIN `Customer` p ON c.`customerId` = p.`id` WHERE c.`customerId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Loan` ADD CONSTRAINT `Loan_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Loan_customerId_fkey NOT created - orphan rows exist in Loan'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Loan_customerId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Loan` c LEFT JOIN `User` p ON c.`userId` = p.`id` WHERE c.`userId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Loan` ADD CONSTRAINT `Loan_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Loan_userId_fkey NOT created - orphan rows exist in Loan'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Loan_userId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `LoanItem` c LEFT JOIN `Loan` p ON c.`loanId` = p.`id` WHERE c.`loanId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `LoanItem` ADD CONSTRAINT `LoanItem_loanId_fkey` FOREIGN KEY (`loanId`) REFERENCES `Loan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key LoanItem_loanId_fkey NOT created - orphan rows exist in LoanItem'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'LoanItem_loanId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `LoanItem` c LEFT JOIN `StockItem` p ON c.`stockItemId` = p.`id` WHERE c.`stockItemId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `LoanItem` ADD CONSTRAINT `LoanItem_stockItemId_fkey` FOREIGN KEY (`stockItemId`) REFERENCES `StockItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key LoanItem_stockItemId_fkey NOT created - orphan rows exist in LoanItem'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'LoanItem_stockItemId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `LoanTransaction` c LEFT JOIN `Loan` p ON c.`loanId` = p.`id` WHERE c.`loanId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `LoanTransaction` ADD CONSTRAINT `LoanTransaction_loanId_fkey` FOREIGN KEY (`loanId`) REFERENCES `Loan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key LoanTransaction_loanId_fkey NOT created - orphan rows exist in LoanTransaction'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'LoanTransaction_loanId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Udhaar` c LEFT JOIN `Firm` p ON c.`firmId` = p.`id` WHERE c.`firmId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Udhaar` ADD CONSTRAINT `Udhaar_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Udhaar_firmId_fkey NOT created - orphan rows exist in Udhaar'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Udhaar_firmId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Udhaar` c LEFT JOIN `Customer` p ON c.`customerId` = p.`id` WHERE c.`customerId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Udhaar` ADD CONSTRAINT `Udhaar_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Udhaar_customerId_fkey NOT created - orphan rows exist in Udhaar'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Udhaar_customerId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `UdhaarPayment` c LEFT JOIN `Firm` p ON c.`firmId` = p.`id` WHERE c.`firmId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `UdhaarPayment` ADD CONSTRAINT `UdhaarPayment_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key UdhaarPayment_firmId_fkey NOT created - orphan rows exist in UdhaarPayment'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'UdhaarPayment_firmId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `UdhaarPayment` c LEFT JOIN `Udhaar` p ON c.`udhaarId` = p.`id` WHERE c.`udhaarId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `UdhaarPayment` ADD CONSTRAINT `UdhaarPayment_udhaarId_fkey` FOREIGN KEY (`udhaarId`) REFERENCES `Udhaar`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key UdhaarPayment_udhaarId_fkey NOT created - orphan rows exist in UdhaarPayment'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'UdhaarPayment_udhaarId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Scheme` c LEFT JOIN `Firm` p ON c.`firmId` = p.`id` WHERE c.`firmId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Scheme` ADD CONSTRAINT `Scheme_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Scheme_firmId_fkey NOT created - orphan rows exist in Scheme'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Scheme_firmId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `SchemeEntry` c LEFT JOIN `Scheme` p ON c.`schemeId` = p.`id` WHERE c.`schemeId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `SchemeEntry` ADD CONSTRAINT `SchemeEntry_schemeId_fkey` FOREIGN KEY (`schemeId`) REFERENCES `Scheme`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key SchemeEntry_schemeId_fkey NOT created - orphan rows exist in SchemeEntry'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'SchemeEntry_schemeId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `SchemeEntry` c LEFT JOIN `Customer` p ON c.`customerId` = p.`id` WHERE c.`customerId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `SchemeEntry` ADD CONSTRAINT `SchemeEntry_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key SchemeEntry_customerId_fkey NOT created - orphan rows exist in SchemeEntry'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'SchemeEntry_customerId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `SchemeEntry` c LEFT JOIN `User` p ON c.`userId` = p.`id` WHERE c.`userId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `SchemeEntry` ADD CONSTRAINT `SchemeEntry_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key SchemeEntry_userId_fkey NOT created - orphan rows exist in SchemeEntry'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'SchemeEntry_userId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `SchemeInstallment` c LEFT JOIN `SchemeEntry` p ON c.`entryId` = p.`id` WHERE c.`entryId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `SchemeInstallment` ADD CONSTRAINT `SchemeInstallment_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `SchemeEntry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key SchemeInstallment_entryId_fkey NOT created - orphan rows exist in SchemeInstallment'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'SchemeInstallment_entryId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Expense` c LEFT JOIN `Firm` p ON c.`firmId` = p.`id` WHERE c.`firmId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Expense` ADD CONSTRAINT `Expense_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Expense_firmId_fkey NOT created - orphan rows exist in Expense'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Expense_firmId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Expense` c LEFT JOIN `User` p ON c.`userId` = p.`id` WHERE c.`userId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Expense` ADD CONSTRAINT `Expense_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Expense_userId_fkey NOT created - orphan rows exist in Expense'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Expense_userId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Account` c LEFT JOIN `Firm` p ON c.`firmId` = p.`id` WHERE c.`firmId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Account` ADD CONSTRAINT `Account_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Account_firmId_fkey NOT created - orphan rows exist in Account'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Account_firmId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `LedgerEntry` c LEFT JOIN `Firm` p ON c.`firmId` = p.`id` WHERE c.`firmId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `LedgerEntry` ADD CONSTRAINT `LedgerEntry_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key LedgerEntry_firmId_fkey NOT created - orphan rows exist in LedgerEntry'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'LedgerEntry_firmId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `LedgerEntry` c LEFT JOIN `Customer` p ON c.`customerId` = p.`id` WHERE c.`customerId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `LedgerEntry` ADD CONSTRAINT `LedgerEntry_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key LedgerEntry_customerId_fkey NOT created - orphan rows exist in LedgerEntry'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'LedgerEntry_customerId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `GoldRate` c LEFT JOIN `Firm` p ON c.`firmId` = p.`id` WHERE c.`firmId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `GoldRate` ADD CONSTRAINT `GoldRate_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key GoldRate_firmId_fkey NOT created - orphan rows exist in GoldRate'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'GoldRate_firmId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Setting` c LEFT JOIN `Firm` p ON c.`firmId` = p.`id` WHERE c.`firmId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Setting` ADD CONSTRAINT `Setting_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Setting_firmId_fkey NOT created - orphan rows exist in Setting'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Setting_firmId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `SmsLog` c LEFT JOIN `User` p ON c.`userId` = p.`id` WHERE c.`userId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `SmsLog` ADD CONSTRAINT `SmsLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key SmsLog_userId_fkey NOT created - orphan rows exist in SmsLog'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'SmsLog_userId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `SystemLog` c LEFT JOIN `Firm` p ON c.`firmId` = p.`id` WHERE c.`firmId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `SystemLog` ADD CONSTRAINT `SystemLog_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key SystemLog_firmId_fkey NOT created - orphan rows exist in SystemLog'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'SystemLog_firmId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `SystemLog` c LEFT JOIN `User` p ON c.`userId` = p.`id` WHERE c.`userId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `SystemLog` ADD CONSTRAINT `SystemLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key SystemLog_userId_fkey NOT created - orphan rows exist in SystemLog'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'SystemLog_userId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Task` c LEFT JOIN `Firm` p ON c.`firmId` = p.`id` WHERE c.`firmId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Task` ADD CONSTRAINT `Task_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Task_firmId_fkey NOT created - orphan rows exist in Task'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Task_firmId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Task` c LEFT JOIN `User` p ON c.`userId` = p.`id` WHERE c.`userId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Task` ADD CONSTRAINT `Task_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Task_userId_fkey NOT created - orphan rows exist in Task'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Task_userId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Order` c LEFT JOIN `Firm` p ON c.`firmId` = p.`id` WHERE c.`firmId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Order` ADD CONSTRAINT `Order_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Order_firmId_fkey NOT created - orphan rows exist in Order'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Order_firmId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Order` c LEFT JOIN `User` p ON c.`userId` = p.`id` WHERE c.`userId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Order` ADD CONSTRAINT `Order_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Order_userId_fkey NOT created - orphan rows exist in Order'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Order_userId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Quotation` c LEFT JOIN `Firm` p ON c.`firmId` = p.`id` WHERE c.`firmId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Quotation_firmId_fkey NOT created - orphan rows exist in Quotation'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Quotation_firmId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Quotation` c LEFT JOIN `User` p ON c.`userId` = p.`id` WHERE c.`userId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Quotation_userId_fkey NOT created - orphan rows exist in Quotation'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Quotation_userId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `QuotationItem` c LEFT JOIN `Quotation` p ON c.`quotationId` = p.`id` WHERE c.`quotationId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `QuotationItem` ADD CONSTRAINT `QuotationItem_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `Quotation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key QuotationItem_quotationId_fkey NOT created - orphan rows exist in QuotationItem'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'QuotationItem_quotationId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `QuotationItem` c LEFT JOIN `StockItem` p ON c.`stockItemId` = p.`id` WHERE c.`stockItemId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `QuotationItem` ADD CONSTRAINT `QuotationItem_stockItemId_fkey` FOREIGN KEY (`stockItemId`) REFERENCES `StockItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key QuotationItem_stockItemId_fkey NOT created - orphan rows exist in QuotationItem'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'QuotationItem_stockItemId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Repair` c LEFT JOIN `Firm` p ON c.`firmId` = p.`id` WHERE c.`firmId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Repair` ADD CONSTRAINT `Repair_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Repair_firmId_fkey NOT created - orphan rows exist in Repair'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Repair_firmId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Repair` c LEFT JOIN `Customer` p ON c.`customerId` = p.`id` WHERE c.`customerId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Repair` ADD CONSTRAINT `Repair_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Repair_customerId_fkey NOT created - orphan rows exist in Repair'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Repair_customerId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Repair` c LEFT JOIN `Customer` p ON c.`karigarId` = p.`id` WHERE c.`karigarId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Repair` ADD CONSTRAINT `Repair_karigarId_fkey` FOREIGN KEY (`karigarId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Repair_karigarId_fkey NOT created - orphan rows exist in Repair'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Repair_karigarId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `Repair` c LEFT JOIN `User` p ON c.`userId` = p.`id` WHERE c.`userId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `Repair` ADD CONSTRAINT `Repair_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key Repair_userId_fkey NOT created - orphan rows exist in Repair'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'Repair_userId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `LoyaltyPoint` c LEFT JOIN `Firm` p ON c.`firmId` = p.`id` WHERE c.`firmId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `LoyaltyPoint` ADD CONSTRAINT `LoyaltyPoint_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key LoyaltyPoint_firmId_fkey NOT created - orphan rows exist in LoyaltyPoint'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'LoyaltyPoint_firmId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `LoyaltyPoint` c LEFT JOIN `Customer` p ON c.`customerId` = p.`id` WHERE c.`customerId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `LoyaltyPoint` ADD CONSTRAINT `LoyaltyPoint_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key LoyaltyPoint_customerId_fkey NOT created - orphan rows exist in LoyaltyPoint'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'LoyaltyPoint_customerId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `BankAccount` c LEFT JOIN `Firm` p ON c.`firmId` = p.`id` WHERE c.`firmId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `BankAccount` ADD CONSTRAINT `BankAccount_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key BankAccount_firmId_fkey NOT created - orphan rows exist in BankAccount'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'BankAccount_firmId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `BankTransaction` c LEFT JOIN `Firm` p ON c.`firmId` = p.`id` WHERE c.`firmId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `BankTransaction` ADD CONSTRAINT `BankTransaction_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key BankTransaction_firmId_fkey NOT created - orphan rows exist in BankTransaction'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'BankTransaction_firmId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `BankTransaction` c LEFT JOIN `BankAccount` p ON c.`bankAccountId` = p.`id` WHERE c.`bankAccountId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `BankTransaction` ADD CONSTRAINT `BankTransaction_bankAccountId_fkey` FOREIGN KEY (`bankAccountId`) REFERENCES `BankAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key BankTransaction_bankAccountId_fkey NOT created - orphan rows exist in BankTransaction'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'BankTransaction_bankAccountId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `BankStatementLine` c LEFT JOIN `Firm` p ON c.`firmId` = p.`id` WHERE c.`firmId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `BankStatementLine` ADD CONSTRAINT `BankStatementLine_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key BankStatementLine_firmId_fkey NOT created - orphan rows exist in BankStatementLine'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'BankStatementLine_firmId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = (SELECT IF(COUNT(*) = 0, IF((SELECT COUNT(*) FROM (SELECT 1 FROM `BankStatementLine` c LEFT JOIN `BankAccount` p ON c.`bankAccountId` = p.`id` WHERE c.`bankAccountId` IS NOT NULL AND p.`id` IS NULL LIMIT 1) o) = 0, 'ALTER TABLE `BankStatementLine` ADD CONSTRAINT `BankStatementLine_bankAccountId_fkey` FOREIGN KEY (`bankAccountId`) REFERENCES `BankAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''WARNING: foreign key BankStatementLine_bankAccountId_fkey NOT created - orphan rows exist in BankStatementLine'' AS migration_warning'), 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = 'BankStatementLine_bankAccountId_fkey' AND constraint_type = 'FOREIGN KEY');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
