<?php

/*
 * **************************************************************************************
 * @tutorial: Cust Sell Crystal Table
 * **************************************************************************************
 * 
 * Created on Dec 24, 2013 6:40:59 PM
 *
 * @FileName: omtbslcy.php
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

$query = "CREATE TABLE IF NOT EXISTS cust_itsl_crystal (
itslcry_id                         INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
itslcry_owner_id                   VARCHAR(16),
itslcry_cry_id                     VARCHAR(16),
itslcry_itsl_id                    VARCHAR(16),
itslcry_firm_id                    VARCHAR(16), 
itslcry_acc_id                     VARCHAR(16), 
itslcry_supp_id                    VARCHAR(16),
itslcry_cust_id                    INT,
itslcry_DOB                        VARCHAR(50),
itslcry_name                       VARCHAR(80),
itslcry_quantity                   VARCHAR(10),
itslcry_gs_weight                  VARCHAR(15),
itslcry_gs_wt_type                 VARCHAR(10),
itslcry_rate                       VARCHAR(20),
itslcry_rate_type                  VARCHAR(20),
itslcry_valuation                  VARCHAR(30),
itslcry_final_valuation            VARCHAR(30),
itslcry_tax_charges                VARCHAR(15),
itslcry_clarity                    VARCHAR(15),
itslcry_color                      VARCHAR(15),
itslcry_oth_info                   VARCHAR(80),
itslcry_status                     VARCHAR(32),
itslcry_since                      DATETIME,
last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>
