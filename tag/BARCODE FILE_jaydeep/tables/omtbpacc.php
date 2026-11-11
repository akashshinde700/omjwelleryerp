<?php

/*
 * **************************************************************************************
 * @tutorial: Online Munim Primary Accounts Table
 * **************************************************************************************
 *
 * Created on 17 Dec, 2012 11:29:35 PM
 *
 * @FileName: omtbpacc.php
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

/* * ****************** New column acc_metal added @Author:SHRI17MAR16 *************** */
$query = "CREATE TABLE IF NOT EXISTS accounts (
acc_id                   INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
acc_own_id               VARCHAR(50),
acc_pri_acc              VARCHAR(30),
acc_pri_grp              VARCHAR(30),
acc_main_acc             VARCHAR(100),
acc_user_acc             VARCHAR(100),
acc_created_by           VARCHAR(50),
acc_firm_id              VARCHAR(10),
acc_name                 VARCHAR(50),
acc_metal                VARCHAR(30),
acc_address              VARCHAR(50),
acc_city                 VARCHAR(30),
acc_pincode              VARCHAR(20),
acc_state                VARCHAR(30),
acc_country              VARCHAR(30),
acc_pan_it_no            VARCHAR(30),
acc_sales_tax_no         VARCHAR(30),
acc_cst_no               VARCHAR(30),
acc_banc_acc_no          VARCHAR(30),
acc_branch_name          VARCHAR(30),
acc_bsr_code             VARCHAR(30),
acc_ifs_code             VARCHAR(30),
acc_cash_balance         VARCHAR(30),
acc_cash_balance_desc    VARCHAR(64),
acc_cash_balance_crdr    VARCHAR(30),
acc_cash_balance_date    VARCHAR(30),
acc_since                DATETIME,
acc_other_info           VARCHAR(500),
acc_staff_id	         VARCHAR(16),
last_column                VARCHAR(1),UNIQUE KEY (acc_firm_id,acc_user_acc))AUTO_INCREMENT=1";

if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
/* * ****************** New column acc_metal added @Author:SHRI17MAR16 *************** */
?>