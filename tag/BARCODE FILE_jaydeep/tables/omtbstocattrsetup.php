<?php
/*
 * **************************************************************************************
 * @Description: Stock Attributes Setup Table File @AUTHOR-PRIYANKA-08JULY2020
 * **************************************************************************************
 *
 * Created on JULY 08, 2020 04:44:00 PM
 *
 * @FileName: omtbstocattrsetup.php
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
// Create new table stock attributes setup @AUTHOR-PRIYANKA-08JULY2020
$query = "CREATE TABLE IF NOT EXISTS stock_attributes_setup (
attr_stp_id                                                    INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
attr_stp_category                                              VARCHAR(64),
attr_stp_attribute_heading                                     VARCHAR(100),
attr_stp_attribute                                             VARCHAR(100),
attr_stp_column_type                                           VARCHAR(24),
attr_stp_column_name                                           VARCHAR(64),
last_column                                                    VARCHAR(1))AUTO_INCREMENT=1";
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