<?php
/*
 * Created on Mar 14, 2011 10:41:20 PM
 *
 * @FileName: omtbittn.php
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

$query="CREATE TABLE IF NOT EXISTS item_tunch (
itm_tunch_id				INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
itm_tunch_own_id			VARCHAR(16), 
itm_tunch_metal_type                    VARCHAR(30),
itm_tunch_name 				VARCHAR(50),
itm_tunch_value 			VARCHAR(50),
itm_tunch_bccolor 			VARCHAR(50),
itm_tunch_bctext 			VARCHAR(20),
itm_tunch_ent_dat			DATETIME,
itm_tunch_upd_sts			VARCHAR(50),
itm_tunch_comm				VARCHAR(500),
itm_tunch_staff_id                      VARCHAR(16),
last_column                VARCHAR(1),UNIQUE KEY (itm_tunch_own_id,itm_tunch_name))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)){ die('Error item_tunch: ' . mysqli_error($conn));}
//echo "Items Tunch Table Created Successfully.\n";
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>