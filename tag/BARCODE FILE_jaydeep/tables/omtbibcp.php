<?php

/*
 * **************************************************************************************
 * @tutorial: Bar Code Print Panel Table
 * **************************************************************************************
 * 
 * Created on Apr 30, 2012 10:42:40 PM
 *
 * @FileName: omtbibcp.php
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
/***************Start code to add fields @Author:PRIYA27NOV13*******************/
$query = "CREATE TABLE IF NOT EXISTS item_barcode (
itbc_id 			INT NOT NULL PRIMARY KEY AUTO_INCREMENT, 
itbc_stock_id                   VARCHAR(16),
itbc_ref_id                     VARCHAR(16),
itbc_owner_id                   VARCHAR(16),
itbc_firm_id                    VARCHAR(16),
itbc_item_id                    VARCHAR(40), 
itbc_prefix_id                  VARCHAR(4),
itbc_pre_id			VARCHAR(40), 
itbc_post_id			VARCHAR(40), 
itbc_name		        VARCHAR(40),
itbc_metal			VARCHAR(40), 
itbc_gwt		        VARCHAR(40),
itbc_gwt_type                   VARCHAR(40),
itbc_nwt		        VARCHAR(40),
itbc_nwt_type                   VARCHAR(40),
itbc_cry_val			VARCHAR(40),
itbc_tunch			VARCHAR(40), 
itbc_date 			DATETIME,
itbc_bis_mark 			VARCHAR(10),
itbc_mkng_charges               VARCHAR(50),
itbc_mkng_charges_typ           VARCHAR(20),
itbc_cry_net_wt                 VARCHAR(50),
itbc_oth_info			VARCHAR(40), 
itbc_purchase_rate              VARCHAR(20),
itbc_purchase_rate_type         VARCHAR(20),
itbc_shape                      VARCHAR(20),
itbc_color                      VARCHAR(20),
itbc_cust_wo_gst_price	        VARCHAR(12),
itbc_cust_price			VARCHAR(12), 
itbc_cust_itmcode		VARCHAR(40), 
itbc_cust_itmnum		VARCHAR(6), 
itbc_pwt			VARCHAR(40), 
itbc_pwt_type			VARCHAR(40), 
itbc_quantity			VARCHAR(40), 
itbc_add_barcode_date		VARCHAR(50), 
itbc_image_id			VARCHAR(10), 
itbc_item_model_no		VARCHAR(50), 
itbc_item_size			VARCHAR(30),".
// five new columns added for value added functionality @PRIYANKA-11APR18       
"itbc_fine_wt		        VARCHAR(10), 
itbc_final_fine_wt		VARCHAR(10),
itbc_value_added                VARCHAR(10), 
itbc_cust_wastage		VARCHAR(10), 
itbc_cust_wastage_wt		VARCHAR(10),
itbc_indicator		        VARCHAR(30),
itbc_cry_net_wt_tp              VARCHAR(20),
last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
/***************End code to add fields @Author:PRIYA27NOV13*******************/
?>