-- Metal-denominated schemes and udhaar.
--
-- Udhaar: metal NULL = an ordinary money debt (unchanged, still posted to the ledger).
-- 'gold'/'silver' = the debt is in grams; amount/settledAmount stay 0 and it is NOT posted.
ALTER TABLE `Udhaar`
  ADD COLUMN `metal` VARCHAR(191) NULL,
  ADD COLUMN `grams` DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `settledGrams` DOUBLE NOT NULL DEFAULT 0;

-- Scheme.type: cash | gold | silver. Every existing scheme is cash, which is what it was sold as.
ALTER TABLE `Scheme` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT 'cash';

-- SchemeEntry: the type is a TERM, frozen at enrolment like totalInstallments and bonusAmount.
-- bonusGrams/bonusRate carry the weight-scheme bonus; exactly one of bonusAmount/bonusGrams is
-- ever non-zero, so the unit of a bonus is never ambiguous.
ALTER TABLE `SchemeEntry`
  ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT 'cash',
  ADD COLUMN `bonusGrams` DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `bonusRate` DOUBLE NULL;

-- SchemeInstallment: the rate of the day (INR per GRAM) and the grams it bought, unrounded.
ALTER TABLE `SchemeInstallment`
  ADD COLUMN `metalRate` DOUBLE NULL,
  ADD COLUMN `grams` DOUBLE NULL;
