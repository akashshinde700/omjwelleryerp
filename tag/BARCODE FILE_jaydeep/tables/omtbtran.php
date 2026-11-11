<?php

/*
 * Created on Mar 13, 2011 6:54:14 PM
 *
 * @FileName: omtbtran.php
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

//ALTER TABLE AS IN OMMPTBUPD @AUTHOR: SANDY16DEC13//to change post id field datatype @AUTHOR: SANDY25JAN14
//NEW COLUMNS ADDED - transaction_trans_id,transaction_cr_amt,transaction_dr_amt @SHRI:05AUG20
$query = "CREATE TABLE IF NOT EXISTS transaction (
transaction_id                          INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
transaction_trans_id                    INT,
transaction_own_id                      VARCHAR(16), 
transaction_user_id                     VARCHAR(16), 
transaction_pre_vch_id                  VARCHAR(16),
transaction_pre_vch_firm_id             VARCHAR(10),
transaction_post_vch_id                 INT,
transaction_supp_vch_id                 VARCHAR(15),". //ADDED TO STORE SUPPLIER VOUCHER NO @AUTHOR:MADHUREE-08JULY2021
"transaction_firm_id                    VARCHAR(16),
transaction_jrnl_id                     VARCHAR(16),
transaction_amt                         VARCHAR(24),
transaction_from_cr_acc_id       	INT,
transaction_to_dr_acc_id                INT,
transaction_cr_amt                      VARCHAR(24),
transaction_dr_amt                      VARCHAR(24),
transaction_sub                         VARCHAR(60),
transaction_type                        VARCHAR(100),
transaction_cat                         VARCHAR(16),
transaction_DOB                         VARCHAR(50),
transaction_other_lang_DOB              VARCHAR(50),". //ADDED TO STORE OTHER LANGUAGE DATE @AUTHOR:MADHUREE-23DEC2021
"transaction_ent_dat                    DATETIME,
transaction_upd_sts                     VARCHAR(50),
transaction_desc                        VARCHAR(2000),
transaction_panel                       VARCHAR(50),
transaction_staff_id	                VARCHAR(16),
last_column                VARCHAR(1),UNIQUE KEY (transaction_pre_vch_id,transaction_pre_vch_firm_id,transaction_post_vch_id))AUTO_INCREMENT=1";
//change in UNIQUE KEY TO remove cust_pcust_id @AUTHOR: SANDY16DEC13
if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>