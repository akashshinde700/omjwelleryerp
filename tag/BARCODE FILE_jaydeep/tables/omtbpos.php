<?php

/*
 * **************************************************************************************
 * @tutorial: Table for POS
 * **************************************************************************************
 * 
 * Created on Apr 9, 2014 12:42:34 PM
 *
 * @FileName: omtbpos.php
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
//pos_main_id and pos_sub_id columns added
$query = "CREATE TABLE IF NOT EXISTS pos (
pos_id					INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
pos_own_id			        VARCHAR(16),
pos_firm_id			        VARCHAR(6),
pos_brand                               VARCHAR(16),
pos_source_id                           VARCHAR(50),
pos_mid                                 VARCHAR(32),
pos_tid                                 VARCHAR(32),
pos_erp_client_id			VARCHAR(50),
pos_key          		        VARCHAR(50),
pos_salt_key          		        VARCHAR(50),
pos_index_key          		        VARCHAR(50),
pos_status                              VARCHAR(12),
pos_ent_date                            DATETIME,
last_column                             VARCHAR(1))";
if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>