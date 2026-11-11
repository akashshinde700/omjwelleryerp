<?php
/*
 * **************************************************************************************
 * @Description: Stock Transaction Table File
 * **************************************************************************************
 *
 * Created on FEB 13, 2019 11:26:00 AM
 *
 * @FileName: omstoclocation.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: 2
 * @version 1.0.1
 * @Copyright (c) 2015 www.softwaregen.com
 * @All rights reserved
 * Copyright 2015 SoftwareGen, Inc
 *
 * @ModificaionHistory
 * MODIFICATION DATE:
 * AUTHOR:
 * REASON:
 *
 * Project Name: Online Munim ERP Accounting Software 1.0.0
 * Version: 1.0.0
 * Website: http://www.omunim.com/
 * Contact: info@omunim.com
 * Follow: www.twitter.com/omunim
 * Like: www.facebook.com/omunim
 * Purchase: http://www.omunim.com/buy.html
 * License: You must have a valid license purchased only from Online Munim
 */
?>
<?php
// Create new table stock location @SHUBHAM-13 FEB 2019
$query = "CREATE TABLE IF NOT EXISTS stock_location (
stlc_id                                                             INT NOT NULL PRIMARY KEY AUTO_INCREMENT,".
// For Main Entry Reference Id
"stlc_owner_id                                                      VARCHAR(16),
stlc_cust_id                                                        VARCHAR(16),
stlc_jrnl_id                                                        VARCHAR(16),
stlc_firm_id                                                        VARCHAR(16),
stlc_sr_no                                                          VARCHAR(16),
stlc_desc                                                           VARCHAR(50),
stlc_barcode_box                                                    VARCHAR(30),
stlc_wt_in                                                          VARCHAR(16),
stlc_wt_out                                                         VARCHAR(10),
stlc_time_in                                                        VARCHAR(10),
stlc_time_out                                                       VARCHAR(16),
stlc_assignee_out                                                   VARCHAR(16),
stlc_assignee_in                                                    VARCHAR(16),
stlc_diff_wt                                                        VARCHAR(16),
stlc_box_sts                                                        VARCHAR(16),
stlc_barcode_box_sts                                                VARCHAR(16),
stlc_entry_date                                                     VARCHAR(16),
stlc_entry_sts                                                      VARCHAR(16),
stlc_remark                                                         VARCHAR(50),
last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}

//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>