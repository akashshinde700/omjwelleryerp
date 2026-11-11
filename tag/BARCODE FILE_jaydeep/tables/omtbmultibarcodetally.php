<?php

/*
 * **************************************************************************************
 * @tutorial: ADD THIS FILE FOR STOCK MULTI BARCODE TALLY @YUVRAJ KAMBLE 01122022
 * **************************************************************************************
 * 
 * Created on 20 Jan, 2019 12:45:12 PM
 *
 * @FileName: omtbmultibarcodetally.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: omunim
 * @version 2.6.0
 * @Copyright (c) 2018 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2018 SoftwareGen Technologies
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:YUVRAJ KAMBLE
 *  REASON:
 *
 */
?>
<?php

$query = "CREATE TABLE IF NOT EXISTS multi_barcode_tally (
        multi_barcode_id                         INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
        multi_barcode_owner_id                   VARCHAR(16),
        multi_barcode_sttr_id                    VARCHAR(16),
        multi_barcode_firm_id                    VARCHAR(16)," .
        "multi_barcode_prefix                    VARCHAR(64)," .
        "multi_barcode                           VARCHAR(64),
        multi_barcode_scan_date                  VARCHAR(24),
        multi_barcode_scan_time                  VARCHAR(24),
        multi_barcode_scan_status                VARCHAR(4),
        multi_barcode_since                      DATETIME," .
        "multi_barcode_product_code              VARCHAR(50)," .
        "multi_barcode_st_id                     VARCHAR(50)," .
        "multi_barcode_quantity                  VARCHAR(50)," .
        "multi_barcode_gs_weight_type            VARCHAR(50)," .
        "multi_barcode_gs_weight                 VARCHAR(50)," .
        "multi_barcode_nt_weight_type            VARCHAR(50)," .
        "multi_barcode_nt_weight                 VARCHAR(50)," .
        "multi_barcode_fine_weight               VARCHAR(50)," .
        "multi_barcode_stock_type                VARCHAR(50)," .
        "multi_barcode_purity                    VARCHAR(50)," .
        "multi_barcode_transaction_type          VARCHAR(50)," .
        "multi_barcode_sell_status               VARCHAR(50)," .
        "multi_barcode_status                    VARCHAR(50)," .
        "multi_barcode_indicator                 VARCHAR(50)," .
        "multi_barcode_tally                     VARCHAR(50),".
        "multi_barcode_metal_type                VARCHAR(50)," .
        "multi_barcode_product_name              VARCHAR(50)," .
        "multi_barcode_product_category          VARCHAR(50)," .
        "multi_barcode_counter_name              VARCHAR(50)," .
        "multi_barcode_location                  VARCHAR(50)," .
        "multi_barcode_reporting_preiod          VARCHAR(50)," .
        "multi_barcode_tally_open_report         VARCHAR(50)," .
        "multi_barcode_tally_close_report        VARCHAR(50)," .
        "multi_barcode_add_date                  VARCHAR(50)," .
        "multi_barcode_tally_quantity            VARCHAR(50)," .
        "multi_barcode_last_column	         VARCHAR(1))AUTO_INCREMENT=1";
// 
if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>