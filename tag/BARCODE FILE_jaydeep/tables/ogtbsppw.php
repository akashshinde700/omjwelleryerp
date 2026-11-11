<?php

/*
 * **************************************************************************************
 * @tutorial: Supplier Table
 * **************************************************************************************
 *
 * Created on 2 Dec, 2012 12:01:52 PM
 *
 * @FileName: ogtbsppw.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: omunim
 * @version 1.0.1
 * @Copyright (c) 2010 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2012 SoftwareGen, Inc
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
//TO ADD NEW FIELDS AS IN ommptbupd @AUTHOR: SANDY16DEC13
$query = "CREATE TABLE IF NOT EXISTS omsupplier (
supp_id 		INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
supp_pre_def_id         VARCHAR(10),
supp_user_def_id        INT,
supp_type               VARCHAR(50),
supp_unique_code        VARCHAR(10),
supp_owner_id		VARCHAR(16),
supp_acc_id             VARCHAR(10),  
supp_firm_id		VARCHAR(16), 
supp_shop_name 		VARCHAR(100),
supp_website 		VARCHAR(100),
supp_pacc_id 		VARCHAR(16),
supp_sacc_id 		VARCHAR(16),
supp_category           VARCHAR(16),
supp_fname 		VARCHAR(32),
supp_lname 		VARCHAR(32),
supp_father_name 	VARCHAR(50),
supp_DOB		VARCHAR(50),
supp_marriage_any	VARCHAR(50),
supp_gender		VARCHAR(2),
supp_qualification	VARCHAR(50),
supp_add 		VARCHAR(500),
supp_city 		VARCHAR(50),
supp_pincode 		VARCHAR(6),
supp_state 		VARCHAR(50),
supp_country 		VARCHAR(50),
supp_phone 		VARCHAR(16),
supp_mobile		VARCHAR(16), 
supp_email 		VARCHAR(100),
supp_pan_it_no		VARCHAR(50),
supp_sale_tax_no	VARCHAR(50),
supp_cst_no		VARCHAR(50),
supp_op_bal_date       VARCHAR(100),
supp_op_cash_bal	VARCHAR(50),
supp_op_cash_bal_crdr	VARCHAR(5),
supp_op_gold_bal	VARCHAR(10),
supp_op_gold_bal_wtype  VARCHAR(5),
supp_op_gold_bal_crdr	VARCHAR(5),
supp_op_silv_bal	VARCHAR(10),
supp_op_silv_bal_wtype  VARCHAR(5),
supp_op_silv_bal_crdr	VARCHAR(5),
supp_since 		DATETIME,
supp_reference		VARCHAR(50),
supp_priority 		VARCHAR(16),
supp_status 		VARCHAR(16),
supp_loyal_points	VARCHAR(16),
supp_snap 		LONGBLOB,
supp_snap_thumb         LONGBLOB,
supp_snap_fname		VARCHAR(150),
supp_snap_ftype		VARCHAR(20),
supp_snap_fsize		VARCHAR(40),
supp_snap_fszMB		VARCHAR(40),
supp_other_info		VARCHAR(500),
supp_staff_id           VARCHAR(16),
last_column                                     VARCHAR(1),UNIQUE KEY (supp_pre_def_id,supp_user_def_id))AUTO_INCREMENT=10001";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>