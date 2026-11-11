-- Every list GET filters on firmId and sorts on createdAt DESC with a LIMIT. With only a
-- firmId-prefixed index that does not carry createdAt, MySQL reads the firm's whole table and
-- filesorts it. Measured on omerp_perf_test (5,000 customers / 10,000 stock rows / 2,000 udhaar):
--   SELECT * FROM Customer  WHERE firmId=? ORDER BY createdAt DESC LIMIT 200  70ms -> 0ms
--   SELECT * FROM StockItem WHERE firmId=? ORDER BY createdAt DESC LIMIT 300  60ms -> 0ms
-- EXPLAIN goes from `Using filesort` to `Backward index scan`.
CREATE INDEX `Customer_firmId_createdAt_idx` ON `Customer`(`firmId`, `createdAt`);
CREATE INDEX `StockItem_firmId_createdAt_idx` ON `StockItem`(`firmId`, `createdAt`);
CREATE INDEX `Udhaar_firmId_createdAt_idx` ON `Udhaar`(`firmId`, `createdAt`);
