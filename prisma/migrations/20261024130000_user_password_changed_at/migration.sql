-- User.passwordChangedAt: set on every password change/reset; sessions authenticated before it are
-- revoked by the jwt callback in src/lib/auth.ts.
--
-- GUARDED and idempotent, like 20261024120000_reconcile_schema_drift: the live database's history
-- is not purely `migrate deploy`, so the column may already exist. information_schema decides;
-- the statement is a no-op when it is present, and this file can be run any number of times.
-- Nullable with no default: existing rows read NULL = "never changed", which revokes nothing.
-- Table name is PascalCase (case-sensitive MySQL on Linux); the lookup uses LOWER() for
-- case-insensitive hosts.

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `User` ADD COLUMN `passwordChangedAt` DATETIME(3) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('User') AND column_name = 'passwordChangedAt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
