<?php
/*
 * Created on Mar 14, 2011 10:41:20 PM
 *
 * @FileName: omtbmtrt.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: oMunim
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

$query="CREATE TABLE IF NOT EXISTS metal_rates (
met_rate_id				INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
met_rate_own_id         		VARCHAR(16), 
met_rate_metal_name             	VARCHAR(50),
met_rate_value  			VARCHAR(50),
met_rate_value_1gm  			VARCHAR(50),
met_rate_metal_id                       VARCHAR(30),
met_rate_per_wt                         VARCHAR(10),
met_rate_per_wt_tp                      VARCHAR(10),
met_rate_percentage                     VARCHAR(10),
met_rate_cust_percentage                VARCHAR(10),
met_rate_ent_dat			DATETIME,
met_rate_upd_sts			VARCHAR(50),
met_rate_comm				VARCHAR(500),
met_rate_staff_id                       VARCHAR(16),
met_rate_tax_check                      VARCHAR(16),
met_rate_tax_percentage                 VARCHAR(16),
met_rate_with_tax                       VARCHAR(50),
met_rate_tax_amt                        VARCHAR(30),
met_rate_mkg_chrgs                      VARCHAR(20),
met_rate_mkg_chrgs_type                 VARCHAR(20),
met_rate_purity                         VARCHAR(20),
met_rate_color                          VARCHAR(16),". // COLUMN ADDED TO ADD METAL COLOR,@AUTHOR:HEMA-1AUG2020
"met_rate_since                         DATETIME,
met_rate_last_column	                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)){ die('Error metal_rates: ' . mysqli_error($conn));}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
//echo "Metal Rates Table Created Successfully.\n";
?>