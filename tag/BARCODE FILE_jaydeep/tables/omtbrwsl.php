<?php

/*
 * **************************************************************************************
 * @tutorial: RAW Sell Table
 * **************************************************************************************
 * 
 * Created on Jan 24, 2014 11:44:55 AM
 *
 * @FileName: omtbrwsl.php
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
$query = "CREATE TABLE IF NOT EXISTS raw_sell (
rwsl_id                         INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
rwsl_owner_id                   VARCHAR(16),
rwsl_jrnl_id                    INT,
rwsl_supp_id                    VARCHAR(16),
rwsl_cust_id                    VARCHAR(16),
rwsl_pay_id                     INT,
rwsl_met_type                   VARCHAR(15), 
rwsl_pre_Id                     VARCHAR(6), 
rwsl_post_Id                    VARCHAR(16),
rwsl_pre_invoice_no             VARCHAR(10),
rwsl_invoice_no                 VARCHAR(50),
rwsl_frmid                      VARCHAR(16),
rwsl_accid                      VARCHAR(16),
rwsl_rc_nt_wgt                  VARCHAR(15),
rwsl_rc_nt_wgt_typ              VARCHAR(10),
rwsl_rc_tunch                   VARCHAR(15),
rwsl_rc_fn_wgt                  VARCHAR(15),
rwsl_rc_rate                    VARCHAR(15),
rwsl_rc_val                     VARCHAR(20),
rwsl_wgt_bal                    VARCHAR(15),
rwsl_wgt_bal_typ                VARCHAR(10),
rwsl_type                       VARCHAR(50),
rwsl_status                     VARCHAR(20),
rwsl_since                      DATETIME,
last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>