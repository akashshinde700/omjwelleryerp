<?php
/*
 * Created on Mar 14, 2011 10:41:45 PM
 *
 * @FileName: omtbitnm.php
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
// Start code to add new column itm_nm_name_lang_typ AND itm_nm_name_lang @AUTHOR: GAUR21JUL16
$query = "CREATE TABLE IF NOT EXISTS item_name (
itm_nm_id			INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
itm_nm_own_id			VARCHAR(16), 
itm_nm_name			VARCHAR(200),
itm_nm_name_lang_typ            VARCHAR(50),
itm_nm_name_lang                VARCHAR(500),
itm_nm_category			VARCHAR(200),
itm_nm_code                     VARCHAR(10),
itm_nm_metal			VARCHAR(30),
itm_nm_ent_dat			DATETIME,
itm_nm_upd_sts			VARCHAR(50),
itm_nm_comm			VARCHAR(500),
itm_nm_type                     VARCHAR(50),
itm_nm_prod_type                VARCHAR(50),
itm_nm_metal_oth_lang           VARCHAR(30),
itm_min_req_stock               VARCHAR(50),
itm_stock_type                  VARCHAR(50),
itm_nm_snap                     LONGBLOB,
itm_nm_snap_thumb               LONGBLOB,
itm_nm_snap_fname               VARCHAR(150),
itm_nm_snap_ftype               VARCHAR(20),
itm_nm_snap_fsize               VARCHAR(40),
itm_nm_snap_fszMB               VARCHAR(40),".
//START CODE TO ADD COLUMN TO ADD STARTING SIZE , END SIZE AND DIIFFERENCE IN SIZE,@AUTHOR:HEMA-10AUG2020
"itm_nm_start_size              VARCHAR(20),
itm_nm_end_size                 VARCHAR(20),
itm_nm_size_difference          VARCHAR(20),
itm_nm_staff_id                 VARCHAR(16),
last_column                VARCHAR(1),UNIQUE KEY (itm_nm_own_id,itm_nm_name,itm_nm_metal))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error item_name: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
//echo "Items Name Table Created Successfully.\n";
//END code to add new column itm_nm_name_lang_typ AND itm_nm_name_lang @AUTHOR: GAUR21JUL16
?>