-- CreateIndex
CREATE UNIQUE INDEX `Invoice_firmId_invoiceNo_key` ON `Invoice`(`firmId`, `invoiceNo`);

-- CreateIndex
CREATE UNIQUE INDEX `StockItem_firmId_itemCode_key` ON `StockItem`(`firmId`, `itemCode`);

