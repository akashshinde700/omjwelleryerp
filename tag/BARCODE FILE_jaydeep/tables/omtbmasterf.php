
<?php

/*
 * **************************************************************************************
 * @Description: Master Features Table File
 * **************************************************************************************
 *
 * Created on APR 22, 2017 11:26:00 AM
 *
 * @FileName: omtbmasterf.php
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
$query = "CREATE TABLE IF NOT EXISTS master_features (
mf_id                                                         INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
mf_sttr_id                                                    VARCHAR(16),
mf_transaction_id                                             VARCHAR(10),
mf_main_entry                                                 VARCHAR(2),
mf_main_entry_count                                           VARCHAR(3),
mf_sub_entry_count                                            VARCHAR(3),
mf_owner_id                                                   VARCHAR(16),
mf_firm_id                                                    VARCHAR(16),
mf_product_type                                                VARCHAR(30),
mf_feature_category 						 VARCHAR(80),
mf_feature_name                  				 VARCHAR(80),
mf_barcode 							 VARCHAR(64),
mf_barcode_serial_num 					 VARCHAR(64),
mf_brand_name 					         VARCHAR(50),
mf_add_date							 VARCHAR(32),
mf_expiry_date						 VARCHAR(32),
mf_mfg_date							 VARCHAR(32),
mf_purchase_price                                             VARCHAR(16),
mf_sell_price                                                 VARCHAR(16),
mf_mrp_price                                                  VARCHAR(16),
mf_total_purchase_price                                       VARCHAR(16),
mf_total_sell_price                                           VARCHAR(16),
mf_tax                                                        VARCHAR(16),
mf_total_tax                                                  VARCHAR(16),
mf_topfive                                                    VARCHAR(12),
mf_sttr_category                                              VARCHAR(50),
mf_sttr_item_name                                                   VARCHAR(50),
UNIQUE KEY (mf_barcode, mf_barcode_serial_num))AUTO_INCREMENT = 1";

if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
include 'ommptbauprdwrfl.php';
?>


