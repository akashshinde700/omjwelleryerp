<?php
/*
 * **************************************************************************************
 * @Description: Stock Attributes Details Table File @AUTHOR-PRIYANKA-08JULY2020
 * **************************************************************************************
 *
 * Created on JULY 08, 2020 04:55:00 PM
 *
 * @FileName: omtbstocattrdet.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: 
 * @version 
 * @Copyright (c) 2020 www.softwaregen.com
 * @All rights reserved
 * Copyright 2020 SoftwareGen, Inc
 *
 * @ModificaionHistory
 * MODIFICATION DATE:
 * AUTHOR:
 * REASON:
 *
 * Project Name: Online Munim ERP Accounting Software 
 * Version:
 * Website: http://www.omunim.com/
 * Contact: info@omunim.com
 * Follow: www.twitter.com/omunim
 * Like: www.facebook.com/omunim
 * Purchase: http://www.omunim.com/buy.html
 * License: You must have a valid license purchased only from Online Munim
 */
?>
<?php
//
// Create new table stock attributes details @AUTHOR-PRIYANKA-08JULY2020
$query = "CREATE TABLE IF NOT EXISTS stock_attributes_details (
attr_dtl_id                      INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
attr_dtl_sttr_id                 VARCHAR(24),
attr_dtl_sttr_sku                VARCHAR(100),
attr_dtl_col_32_1                VARCHAR(32),
attr_dtl_col_32_2                VARCHAR(32),
attr_dtl_col_32_3                VARCHAR(32),
attr_dtl_col_32_4                VARCHAR(32),
attr_dtl_col_32_5                VARCHAR(32),
attr_dtl_col_32_6                VARCHAR(32),
attr_dtl_col_32_7                VARCHAR(32),
attr_dtl_col_32_8                VARCHAR(32),
attr_dtl_col_32_9                VARCHAR(32),
attr_dtl_col_32_10               VARCHAR(32),
attr_dtl_col_32_11               VARCHAR(32),
attr_dtl_col_32_12               VARCHAR(32),
attr_dtl_col_64_13               VARCHAR(64),
attr_dtl_col_64_14               VARCHAR(64),
attr_dtl_col_64_15               VARCHAR(64),
attr_dtl_col_64_16               VARCHAR(64),
attr_dtl_col_64_17               VARCHAR(64),
attr_dtl_col_64_18               VARCHAR(64),
attr_dtl_col_64_19               VARCHAR(64),
attr_dtl_col_64_20               VARCHAR(64),
attr_dtl_col_64_21               VARCHAR(64),
attr_dtl_col_64_22               VARCHAR(64),
attr_dtl_col_64_23               VARCHAR(64),
attr_dtl_col_64_24               VARCHAR(64),
attr_dtl_col_128_25              VARCHAR(128),
attr_dtl_col_128_26              VARCHAR(128),
attr_dtl_col_128_27              VARCHAR(128),
attr_dtl_col_128_28              VARCHAR(128),
attr_dtl_col_128_29              VARCHAR(128),
attr_dtl_col_128_30              VARCHAR(128),
attr_dtl_col_128_31              VARCHAR(128),
attr_dtl_col_128_32              VARCHAR(128),
attr_dtl_col_128_33              VARCHAR(128),
attr_dtl_col_128_34              VARCHAR(128),
attr_dtl_col_128_35              VARCHAR(128),
attr_dtl_col_128_36              VARCHAR(128),
attr_dtl_col_256_37              VARCHAR(256),
attr_dtl_col_256_38              VARCHAR(256),
attr_dtl_col_256_39              VARCHAR(256),
attr_dtl_col_256_40              VARCHAR(256),
attr_dtl_col_256_41              VARCHAR(256),
attr_dtl_col_256_42              VARCHAR(256),
attr_dtl_col_256_43              VARCHAR(256),
attr_dtl_col_256_44              VARCHAR(256),
attr_dtl_col_256_45              VARCHAR(256),
attr_dtl_col_256_46              VARCHAR(256),
attr_dtl_col_256_47              VARCHAR(256),
attr_dtl_col_256_48              VARCHAR(256),
attr_dtl_col_512_49              VARCHAR(512),
attr_dtl_col_512_50              VARCHAR(512),
attr_dtl_col_512_51              VARCHAR(512),
attr_dtl_col_512_52              VARCHAR(512),
attr_dtl_col_512_53              VARCHAR(512),
attr_dtl_col_512_54              VARCHAR(512),
attr_dtl_col_512_55              VARCHAR(512),
attr_dtl_col_512_56              VARCHAR(512),
attr_dtl_col_512_57              VARCHAR(512),
attr_dtl_col_512_58              VARCHAR(512),
attr_dtl_col_512_59              VARCHAR(512),
attr_dtl_col_512_60              VARCHAR(512),
last_column                      VARCHAR(1))AUTO_INCREMENT=1";
//
//
if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//
// To check new columns added into table or not @AUTHOR-PRIYANKA-08JULY2020
include 'ommptbauprdwrfl.php';
//
?>