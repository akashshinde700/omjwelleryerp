<?php

/*
 * **************************************************************************************
 * @Description: Stock Features Table File
 * **************************************************************************************
 *
 * Created on MAY 29, 2017 11:26:00 AM
 *
 * @FileName: omtbstockf.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: 2
 * @version 1.0.1
 * @Copyright (c) 2015 www.softwaregen.com
 * @All rights reserved
 * Copyright 2015 SoftwareGen, Inc
 *
  */
?>
<?php
//
$query = "CREATE TABLE IF NOT EXISTS stock_features (
sttrf_id                                                         INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
sttrf_sttr_id                                                    VARCHAR(16),
sttrf_transaction_id                                             VARCHAR(10),
sttrf_main_entry                                                 VARCHAR(2),
sttrf_main_entry_count                                           VARCHAR(3),
sttrf_sub_entry_count                                            VARCHAR(3),
sttrf_owner_id                                                   VARCHAR(16),
sttrf_firm_id                                                    VARCHAR(16),
sttrf_product_type                                                VARCHAR(30),
sttrf_product_category 						 VARCHAR(80),
sttrf_product_name      					 VARCHAR(80),
sttrf_barcode 							 VARCHAR(64),
sttrf_barcode_serial_num 					 VARCHAR(64),
sttrf_brand_name 					         VARCHAR(50),
sttrf_add_date							 VARCHAR(32),
sttrf_expiry_date						 VARCHAR(32),
sttrf_mfg_date							 VARCHAR(32),
sttrf_purchase_price                                             VARCHAR(16),
sttrf_sell_price                                                 VARCHAR(16),
sttrf_mrp_price                                                  VARCHAR(16),
sttrf_total_purchase_price                                       VARCHAR(16),
sttrf_total_sell_price                                           VARCHAR(16),
sttrf_tax                                                        VARCHAR(16),
sttrf_total_tax                                                  VARCHAR(16),
UNIQUE KEY (sttrf_barcode, sttrf_barcode_serial_num))AUTO_INCREMENT = 1";
//
if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>
