<?php

/*
 * Created on Dec 21, 2010 12:56:23 AM
 *
 * @FileName: omtbownr.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: OMunim
 * @version 1.0
 * @Copyright (c) 2010 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2010 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:RENUKA SHARMA
 *  REASON:ADD ONE COLUMN FOR  OTP
 *
 */
?>
<?php

$query = "CREATE TABLE IF NOT EXISTS owner (
own_snid			INT NOT NULL PRIMARY KEY AUTO_INCREMENT, 
own_id 				INT NOT NULL,
own_userid 			VARCHAR(64), 
own_gid                         VARCHAR(24),
own_pass 			VARCHAR(40),
own_ipass 			VARCHAR(40),
own_prodid 			VARCHAR(40),
own_prod_status			VARCHAR(40),
own_prod_name			VARCHAR(40),
own_prod_ver      		VARCHAR(40),
own_ikey 			VARCHAR(40),
own_skey 			VARCHAR(40),
own_hkey 			VARCHAR(40),
own_ukey 			VARCHAR(40),
own_gukey 			VARCHAR(40),
own_pass_hintq                  VARCHAR(100),
own_pass_hinta                  VARCHAR(50),
own_pass_scode                  VARCHAR(100),
own_ipass_hintq                 VARCHAR(100),
own_ipass_hinta                 VARCHAR(50),
own_fname 			VARCHAR(32),
own_lname 			VARCHAR(32),
own_father_name                 VARCHAR(50),
own_DOB				VARCHAR(50),
own_sex				VARCHAR(2),
own_qualification               VARCHAR(50),
own_shipping_address    	VARCHAR(50),
own_billing_address		VARCHAR(50),
own_add1         		VARCHAR(100),
own_add2         		VARCHAR(100),
own_city 			VARCHAR(50),
own_pincode                     VARCHAR(6),
own_state 			VARCHAR(50),
own_country                     VARCHAR(50),
own_phone 			VARCHAR(16),
own_mobile 			VARCHAR(16), 
own_sec_mobile                  VARCHAR(16),
own_email 			VARCHAR(100),
own_website 			VARCHAR(100),
own_ecomm_website 	        VARCHAR(100),
own_since 			DATETIME,
own_ref 			VARCHAR(50),
own_priority                    VARCHAR(16),
own_package                     VARCHAR(50),
own_status 			VARCHAR(50),
own_last_login 			VARCHAR(12),
own_act_period                  VARCHAR(6),
own_snap 			LONGBLOB,
own_snap_thumb                  LONGBLOB,
own_snap_fname                  VARCHAR(150),
own_snap_ftype                  VARCHAR(20),
own_snap_fsize                  VARCHAR(40),
own_snap_fszMB                  VARCHAR(40),
own_act_counter                 INT,
own_otp                         VARCHAR(50),
own_other_info                  VARCHAR(100),
own_trans_passcode              VARCHAR(40),
own_image_id                    VARCHAR(16),
own_passcode_onoff              VARCHAR(6),
own_staff_passcode_onoff        VARCHAR(6),
own_trans_check                 VARCHAR(40),
own_refferal_code               VARCHAR(10),
last_column                     VARCHAR(1))AUTO_INCREMENT=101010";

if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>
