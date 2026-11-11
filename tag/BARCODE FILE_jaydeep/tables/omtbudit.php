<?php

/*
 * **************************************************************************************
 * @tutorial:Udhhaar items table 
 * **************************************************************************************
 * 
 * Created on Mar 28, 2014 3:30:51 PM
 *
 * @FileName: omtbudit.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: omunim
 * @version 1.0.1
 * @Copyright (c) 2013 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2013 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php
//START code to add Item Image Field @AUTHOR:PRIYA22JAN13
$query="CREATE TABLE IF NOT EXISTS udhaar_items (
udhaar_itm_id                                           INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
udhaar_itm_own_id					VARCHAR(16), 
udhaar_itm_udhaar_id					VARCHAR(16), 
udhaar_itm_cust_id					VARCHAR(16),
udhaar_itm_metal_type					VARCHAR(30),
udhaar_itm_name 					VARCHAR(1000),
udhaar_itm_pieces 					INT,
udhaar_itm_gross_weight 				FLOAT,
udhaar_itm_gross_weight_type                            VARCHAR(10),
udhaar_itm_weight 					FLOAT,
udhaar_itm_weight_type                                  VARCHAR(10),
udhaar_itm_tunch_id					INT,
udhaar_itm_valuation 					FLOAT,
udhaar_itm_DOB						VARCHAR(50),
udhaar_itm_DOR						VARCHAR(50),
udhaar_itm_since     					DATETIME,
udhaar_itm_upd_sts					VARCHAR(50),
udhaar_itm_comm						VARCHAR(500),
udhaar_itm_snap                                         LONGBLOB,
udhaar_itm_snap_thumb                                   LONGBLOB,
udhaar_itm_snap_fname                                   VARCHAR(150),
udhaar_itm_snap_ftype                                   VARCHAR(20),
udhaar_itm_snap_fsize                                   VARCHAR(40),
udhaar_itm_snap_fszMB                                   VARCHAR(40),
last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)){ die('Error: ' . mysqli_error($conn));}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
//echo "udhaari Items Table Created Successfully.\n";

?>