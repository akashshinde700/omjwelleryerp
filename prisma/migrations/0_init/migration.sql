-- CreateTable
CREATE TABLE `User` (
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

-- CreateTable
CREATE TABLE `Firm` (
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

-- CreateTable
CREATE TABLE `UserFirm` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'staff',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserFirm_firmId_idx`(`firmId`),
    UNIQUE INDEX `UserFirm_userId_firmId_key`(`userId`, `firmId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Customer` (
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
    `masterPassword` VARCHAR(191) NULL,
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
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockItem` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `itemCode` VARCHAR(191) NULL,
    `barcode` VARCHAR(191) NULL,
    `hallmarkUid` VARCHAR(191) NULL,
    `category` VARCHAR(191) NOT NULL DEFAULT 'fine',
    `subType` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `metalType` VARCHAR(191) NULL,
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
    `rfidNo` VARCHAR(191) NULL,
    `location` VARCHAR(191) NULL,
    `modelNo` VARCHAR(191) NULL,
    `length` VARCHAR(191) NULL,
    `color` VARCHAR(191) NULL,
    `size` VARCHAR(191) NULL,
    `totalHallmarkCharges` DOUBLE NULL,
    `otherCharges` DOUBLE NULL,
    `otherChargesType` VARCHAR(191) NULL,
    `totalOtherCharges` DOUBLE NULL,
    `ecommStatus` VARCHAR(191) NULL,
    `jewellersAppStatus` VARCHAR(191) NULL,
    `totalTax` DOUBLE NULL,
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

    INDEX `StockItem_firmId_category_idx`(`firmId`, `category`),
    INDEX `StockItem_firmId_status_idx`(`firmId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockTransfer` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `itemCode` VARCHAR(191) NULL,
    `fromCounter` VARCHAR(191) NULL,
    `toCounter` VARCHAR(191) NULL,
    `toFirmId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Invoice` (
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
    `status` VARCHAR(191) NOT NULL DEFAULT 'completed',
    `note` TEXT NULL,
    `oldGoldWeight` DOUBLE NOT NULL DEFAULT 0,
    `oldGoldValue` DOUBLE NOT NULL DEFAULT 0,
    `bhavCut` DOUBLE NOT NULL DEFAULT 0,
    `loyaltyRedeemed` DOUBLE NOT NULL DEFAULT 0,
    `loyaltyEarned` INTEGER NOT NULL DEFAULT 0,
    `irn` VARCHAR(191) NULL,
    `ackNo` VARCHAR(191) NULL,
    `ackDate` DATETIME(3) NULL,
    `qrUrl` TEXT NULL,
    `eInvoiceStatus` VARCHAR(191) NULL,
    `whatsappSent` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Invoice_firmId_invoiceDate_idx`(`firmId`, `invoiceDate`),
    INDEX `Invoice_firmId_type_invoiceDate_idx`(`firmId`, `type`, `invoiceDate`),
    INDEX `Invoice_customerId_idx`(`customerId`),
    INDEX `Invoice_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InvoiceItem` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `stockItemId` VARCHAR(191) NULL,
    `itemCode` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `hsnCode` VARCHAR(191) NULL,
    `purity` VARCHAR(191) NULL,
    `grossWeight` DOUBLE NOT NULL DEFAULT 0,
    `netWeight` DOUBLE NOT NULL DEFAULT 0,
    `stoneWeight` DOUBLE NULL,
    `stoneAmount` DOUBLE NULL,
    `makingCharge` DOUBLE NOT NULL DEFAULT 0,
    `wastagePercent` DOUBLE NULL,
    `rate` DOUBLE NOT NULL DEFAULT 0,
    `amount` DOUBLE NOT NULL DEFAULT 0,
    `cgst` DOUBLE NOT NULL DEFAULT 0,
    `sgst` DOUBLE NOT NULL DEFAULT 0,
    `igst` DOUBLE NOT NULL DEFAULT 0,
    `total` DOUBLE NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InvoiceItem_invoiceId_idx`(`invoiceId`),
    INDEX `InvoiceItem_stockItemId_idx`(`stockItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Loan` (
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
    `timePeriod` INTEGER NULL,
    `dueDate` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `wardNo` VARCHAR(191) NULL,
    `village` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `exFirmId` VARCHAR(191) NULL,
    `trFirmId` VARCHAR(191) NULL,
    `mlFirmId` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `releasedDate` DATETIME(3) NULL,
    `releasedAmount` DOUBLE NULL,
    `totalInterest` DOUBLE NULL,
    `totalAmount` DOUBLE NULL,
    `photoUrl` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Loan_firmId_status_idx`(`firmId`, `status`),
    INDEX `Loan_firmId_loanDate_idx`(`firmId`, `loanDate`),
    INDEX `Loan_customerId_idx`(`customerId`),
    INDEX `Loan_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LoanItem` (
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

-- CreateTable
CREATE TABLE `LoanTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `loanId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LoanTransaction_loanId_idx`(`loanId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Udhaar` (
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
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Udhaar_firmId_idx`(`firmId`),
    INDEX `Udhaar_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Scheme` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
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

-- CreateTable
CREATE TABLE `SchemeEntry` (
    `id` VARCHAR(191) NOT NULL,
    `schemeId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `customerMobile` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `startDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `emiAmount` DOUBLE NOT NULL,
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

-- CreateTable
CREATE TABLE `SchemeInstallment` (
    `id` VARCHAR(191) NOT NULL,
    `entryId` VARCHAR(191) NOT NULL,
    `installmentNo` INTEGER NOT NULL,
    `amount` DOUBLE NOT NULL,
    `paidDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `paymentMode` VARCHAR(191) NOT NULL DEFAULT 'cash',
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SchemeInstallment_entryId_idx`(`entryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Expense` (
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

-- CreateTable
CREATE TABLE `Account` (
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

-- CreateTable
CREATE TABLE `LedgerEntry` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NULL,
    `accountName` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `invoiceId` VARCHAR(191) NULL,
    `loanId` VARCHAR(191) NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `particulars` VARCHAR(191) NULL,
    `debit` DOUBLE NOT NULL DEFAULT 0,
    `credit` DOUBLE NOT NULL DEFAULT 0,
    `balance` DOUBLE NOT NULL DEFAULT 0,
    `type` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LedgerEntry_firmId_date_idx`(`firmId`, `date`),
    INDEX `LedgerEntry_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GoldRate` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `metal` VARCHAR(191) NOT NULL,
    `purity` VARCHAR(191) NOT NULL,
    `rate` DOUBLE NOT NULL,
    `rateDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GoldRate_firmId_rateDate_idx`(`firmId`, `rateDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Setting` (
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

-- CreateTable
CREATE TABLE `SmsLog` (
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

-- CreateTable
CREATE TABLE `SystemLog` (
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

-- CreateTable
CREATE TABLE `Task` (
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

-- CreateTable
CREATE TABLE `Order` (
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

-- CreateTable
CREATE TABLE `Quotation` (
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

-- CreateTable
CREATE TABLE `QuotationItem` (
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

-- CreateTable
CREATE TABLE `Repair` (
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
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Repair_firmId_idx`(`firmId`),
    INDEX `Repair_customerId_idx`(`customerId`),
    INDEX `Repair_karigarId_idx`(`karigarId`),
    INDEX `Repair_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LoyaltyPoint` (
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

-- AddForeignKey
ALTER TABLE `UserFirm` ADD CONSTRAINT `UserFirm_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserFirm` ADD CONSTRAINT `UserFirm_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Customer` ADD CONSTRAINT `Customer_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockItem` ADD CONSTRAINT `StockItem_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InvoiceItem` ADD CONSTRAINT `InvoiceItem_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InvoiceItem` ADD CONSTRAINT `InvoiceItem_stockItemId_fkey` FOREIGN KEY (`stockItemId`) REFERENCES `StockItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Loan` ADD CONSTRAINT `Loan_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Loan` ADD CONSTRAINT `Loan_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Loan` ADD CONSTRAINT `Loan_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoanItem` ADD CONSTRAINT `LoanItem_loanId_fkey` FOREIGN KEY (`loanId`) REFERENCES `Loan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoanItem` ADD CONSTRAINT `LoanItem_stockItemId_fkey` FOREIGN KEY (`stockItemId`) REFERENCES `StockItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoanTransaction` ADD CONSTRAINT `LoanTransaction_loanId_fkey` FOREIGN KEY (`loanId`) REFERENCES `Loan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Udhaar` ADD CONSTRAINT `Udhaar_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Udhaar` ADD CONSTRAINT `Udhaar_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Scheme` ADD CONSTRAINT `Scheme_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SchemeEntry` ADD CONSTRAINT `SchemeEntry_schemeId_fkey` FOREIGN KEY (`schemeId`) REFERENCES `Scheme`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SchemeEntry` ADD CONSTRAINT `SchemeEntry_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SchemeEntry` ADD CONSTRAINT `SchemeEntry_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SchemeInstallment` ADD CONSTRAINT `SchemeInstallment_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `SchemeEntry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Account` ADD CONSTRAINT `Account_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LedgerEntry` ADD CONSTRAINT `LedgerEntry_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LedgerEntry` ADD CONSTRAINT `LedgerEntry_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GoldRate` ADD CONSTRAINT `GoldRate_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Setting` ADD CONSTRAINT `Setting_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SmsLog` ADD CONSTRAINT `SmsLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SystemLog` ADD CONSTRAINT `SystemLog_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SystemLog` ADD CONSTRAINT `SystemLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuotationItem` ADD CONSTRAINT `QuotationItem_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `Quotation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuotationItem` ADD CONSTRAINT `QuotationItem_stockItemId_fkey` FOREIGN KEY (`stockItemId`) REFERENCES `StockItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Repair` ADD CONSTRAINT `Repair_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Repair` ADD CONSTRAINT `Repair_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Repair` ADD CONSTRAINT `Repair_karigarId_fkey` FOREIGN KEY (`karigarId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Repair` ADD CONSTRAINT `Repair_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoyaltyPoint` ADD CONSTRAINT `LoyaltyPoint_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoyaltyPoint` ADD CONSTRAINT `LoyaltyPoint_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

