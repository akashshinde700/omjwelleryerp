<?php

/*
 * **************************************************************************************
 * @tutorial: oMunim Product Version Table
 * **************************************************************************************
 * 
 * Created on Apr 9, 2013 8:22:19 PM
 *
 * @FileName: omtbprvr.php
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
$query = "CREATE TABLE IF NOT EXISTS prod_version (
prod_id               INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
prod_ver	      VARCHAR(16),
prod_ver1	      int,
prod_ver2	      int,
prod_ver3	      int,
prod_temp_ver         float,
prod_ent_pro_year     int,
prod_ent_pro_count    int,
prod_temp_migration   int,
prod_process_date     DATE,
prod_process_lock     VARCHAR(2),
prod_gold_rate        VARCHAR(10),
prod_silver_rate      VARCHAR(10),
prod_new_loans_added  VARCHAR(2),
prod_info	      VARCHAR(200),
last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>