<?php

/*
 * **************************************************************************************
 * @tutorial: Ecommerce Setup Table
 * **************************************************************************************
 * 
 * Created on Jun 16, 2019 12:46:17 PM
 *
 * @FileName: omtbecom.php
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
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php
//
$query = "CREATE TABLE IF NOT EXISTS omecom (
ecom_id                 INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
ecom_own_id             VARCHAR(16),
ecom_website            VARCHAR(64),
ecom_theme              VARCHAR(32),
ecom_page               VARCHAR(32),
ecom_option             VARCHAR(100),
ecom_language           VARCHAR(32),
ecom_value              BLOB,
ecom_font_name          VARCHAR(16),
ecom_font_size          VARCHAR(3),
ecom_font_color         VARCHAR(16),
ecom_font_bgcolor       VARCHAR(16),
ecom_image_id           VARCHAR(12),
ecom_image_name         VARCHAR(32),
ecom_image_alt          VARCHAR(50),".// COLUMN ADDED TO STORE ECOM IMAGE ALTER TAG CONTENT @AUTHOR:MADHUREE-22MARCH2022
"ecom_info              BLOB,".
"ecom_image_ext         VARCHAR(12),".
"ecoms_last_column       VARCHAR(1))";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>