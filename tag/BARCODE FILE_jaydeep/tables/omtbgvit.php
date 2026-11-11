<?php
/*
 * Created on Mar 13, 2011 6:53:43 PM
 *
 * @FileName: omtbgvit.php
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
//START code to add Item Image Field @AUTHOR:PRIYA22JAN13
$query="CREATE TABLE IF NOT EXISTS girvi_items (
girv_itm_id                                             INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
girv_itm_girv_id					VARCHAR(16), 
girv_itm_cust_id					VARCHAR(16),
girv_itm_own_id						VARCHAR(16), 
girv_itm_metal_type					VARCHAR(30),
girv_itm_name 						VARCHAR(1000),
girv_itm_pieces 					INT,
girv_itm_gross_weight 					FLOAT,
girv_itm_gross_weight_type                              VARCHAR(10),
girv_itm_less_weight 					FLOAT,
girv_itm_less_weight_type                              VARCHAR(10),
girv_itm_weight 					FLOAT,
girv_itm_weight_type                                    VARCHAR(10),
girv_itm_fine_weight 					FLOAT,
girv_itm_tunch_id					INT,
girv_itm_release_trans_id INT,
girv_itm_valuation 					FLOAT,
girv_pdf                                              VARCHAR(100),".
"girv_itm_DOB						VARCHAR(50),
girv_itm_other_lang_DOB					VARCHAR(50),
girv_itm_DOR						VARCHAR(50),
girv_itm_ent_dat					DATETIME,
girv_itm_upd_sts					VARCHAR(50),
girv_itm_comm						VARCHAR(500),
girv_itm_snap                                           LONGBLOB,
girv_itm_snap_thumb                                     LONGBLOB,
girv_itm_snap_fname                                     VARCHAR(150),
girv_itm_snap_ftype                                     VARCHAR(20),
girv_itm_snap_fsize                                     VARCHAR(40),
girv_itm_snap_fszMB                                     VARCHAR(40),
girv_itm_staff_id                               	VARCHAR(16),
last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)){ die('Error: ' . mysqli_error($conn));}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
//echo "Girvi Items Table Created Successfully.\n";

?>