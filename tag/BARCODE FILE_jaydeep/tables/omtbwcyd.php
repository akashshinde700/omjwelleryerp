<?php

/*
 * **************************************************************************************
 * @tutorial: Table for supplier order crystal delievery
 * **************************************************************************************
 * 
 * Created on Oct 8, 2013 10:59:57 AM
 *
 * @FileName: omtbwcyd.php
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

$query = "CREATE TABLE IF NOT EXISTS supp_ordeliev_cry(
spordvcry_id                         INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
spordvcry_owner_id                   VARCHAR(16),
spordvcry_cry_id                     VARCHAR(16),
spordvcry_spordv_id                  VARCHAR(16),
spordvcry_firm_id                    VARCHAR(16), 
spordvcry_acc_id                     VARCHAR(16), 
spordvcry_supp_id                    VARCHAR(16),
spordvcry_cust_id                    INT,
spordvcry_DOB                        VARCHAR(50),
spordvcry_name                       VARCHAR(80),
spordvcry_quantity                   VARCHAR(10),
spordvcry_gs_weight                  VARCHAR(15),
spordvcry_gs_wt_type                 VARCHAR(10),
spordvcry_rate                       VARCHAR(20),
spordvcry_rate_type                  VARCHAR(20),
spordvcry_valuation                  VARCHAR(30),
spordvcry_final_valuation            VARCHAR(30),
spordvcry_tax_charges                VARCHAR(15),
spordvcry_clarity                    VARCHAR(15),
spordvcry_color                      VARCHAR(15),
spordvcry_oth_info                   VARCHAR(80),
spordvcry_status                     VARCHAR(32),
spordvcry_since                      DATETIME,
last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>
