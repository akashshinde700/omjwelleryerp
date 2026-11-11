-- be-inventory: daily rates panel — put the unit ON the row (GoldRate.rate has always been quoted
-- per 10 gram for gold and per kg for silver, but the schema comment only said "per 10 gram" and
-- nothing on the row said which; a caller had to guess by metal name). Purely additive: one column,
-- backfilled from the metal that was already implicit for every existing row, no data loss.
-- mysqldump taken immediately before this migration:
--   scratchpad/omerp_backup_20260917121308.sql
-- Generated with `prisma migrate diff --from-url <omerp> --to-schema-datamodel prisma/schema.prisma
-- --script` against the live schema, then applied with `migrate deploy` (never migrate dev/reset).

-- AlterTable
ALTER TABLE `GoldRate` ADD COLUMN `unit` VARCHAR(191) NOT NULL DEFAULT 'per_10_gram';

-- Backfill: every silver row ever entered was intended and displayed as per-kg (see the rate
-- ticker in app-shell.tsx and the "Silver 999 (per kg)" field in settings.tsx). Gold rows keep the
-- column default (per_10_gram), which was already their true unit.
UPDATE `GoldRate` SET `unit` = 'per_kg' WHERE `metal` = 'silver';
