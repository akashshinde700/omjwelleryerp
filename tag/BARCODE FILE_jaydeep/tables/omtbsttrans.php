<?php
/*
 * Created on nov 5, 2024 11:24:15 PM
 *
 * @FileName: omtbsttrans.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: eMunim
 * @version 1.0
 * @Copyright (c) 2010 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2010 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php
//require_once 'system/omssopin.php';

$query="CREATE TABLE IF NOT EXISTS stock_transfer (
sttrans_id                          INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
sttrans_sttr_id                     VARCHAR(16),
sttrans_own_id                      VARCHAR(16), 
sttrans_pre_voucher_no              VARCHAR(30),
sttrans_voucher_no                  VARCHAR(30),
sttrans_prev_firm                   VARCHAR(30),
sttrans_new_firm                    VARCHAR(30),
sttrans_status                      VARCHAR(30),
sttrans_qty                         VARCHAR(30),
sttrans_gs_wt                       VARCHAR(30),
sttrans_item_name                   VARCHAR(30),
sttrans_item_category	            VARCHAR(30),
sttrans_item_code	            VARCHAR(30),
sttrans_trans_date	            VARCHAR(30),
last_column                         VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)){ die('Error: ' . mysqli_error($conn));}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>