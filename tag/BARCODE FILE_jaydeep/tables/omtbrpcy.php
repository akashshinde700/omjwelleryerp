<?php

/*
 * **************************************************************************************
 * @tutorial: Supp Order Crystal Table
 * **************************************************************************************
 * 
 * Created on Jan 09, 2015 12:01:37 PM
 *
 * @FileName: omtbrpcy.php
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
$query = "CREATE TABLE IF NOT EXISTS repair_item_crystal (
repair_crystal_id                         INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
repair_crystal_own_id                     VARCHAR(16),
item_repair_item_id                       VARCHAR(16),
repair_crystal_firm_id                    VARCHAR(16), 
repair_crystal_acc_id                     VARCHAR(16), 
repair_crystal_cust_id                    INT,
repair_crystal_DOB                        VARCHAR(50),
repair_crystal_name                       VARCHAR(80),
repair_crystal_quantity                   VARCHAR(10),
repair_crystal_gs_weight                  VARCHAR(15),
repair_crystal_gs_wt_type                 VARCHAR(10),
repair_crystal_rate                       VARCHAR(20),
repair_crystal_rate_type                  VARCHAR(20),
repair_crystal_valuation                  VARCHAR(30),
repair_crystal_final_valuation            VARCHAR(30),
repair_crystal_tax                        VARCHAR(15),
repair_crystal_clarity                    VARCHAR(15),
repair_crystal_color                      VARCHAR(15),
repair_cry_oth_info                       VARCHAR(80),
repair_crystal_status                     VARCHAR(32),
repair_crystal_since                      DATETIME,
last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>
