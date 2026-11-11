<?php
/*
 * **************************************************************************************
 * @tutorial: Main Journal Table 
 * **************************************************************************************
 *
 * Created on 24 DEC, 2015 11:15:27 PM
 *
 * @FileName: omtbjrmn.php
 * @Author: GAUR24DEC2015
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: omunim
 * @version 1.0.1
 * @Copyright (c) 2010 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2015 SoftwareGen, Inc
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
$query = "CREATE TABLE IF NOT EXISTS journal_main (
jrmn_id           INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
jrmn_own_id	  VARCHAR(16),
jrmn_jid          VARCHAR(10),
jrmn_userid       VARCHAR(30),
jrmn_user_type    VARCHAR(30),
jrmn_trans_id     VARCHAR(30),
jrmn_trans_type   VARCHAR(30),
jrmn_firm_id      VARCHAR(30),
jrmn_acc_id       VARCHAR(10),
jrmn_tt_dr        VARCHAR(50),
jrmn_ggw_dr       VARCHAR(15),
jrmn_ggw_dr_tp    VARCHAR(10),
jrmn_gnw_dr       VARCHAR(15),
jrmn_gnw_dr_tp    VARCHAR(10),
jrmn_gfw_dr       VARCHAR(15),
jrmn_gfw_dr_tp    VARCHAR(10),
jrmn_sgw_dr       VARCHAR(15),
jrmn_sgw_dr_tp    VARCHAR(10),
jrmn_snw_dr       VARCHAR(15),
jrmn_snw_dr_tp    VARCHAR(10),
jrmn_sfw_dr       VARCHAR(15),
jrmn_sfw_dr_tp    VARCHAR(10),
jrmn_dr_acc_id    VARCHAR(10),
jrmn_dr_desc      VARCHAR(100),
jrmn_tt_cr	  VARCHAR(50),
jrmn_ggw_cr       VARCHAR(15),
jrmn_ggw_cr_tp    VARCHAR(10),
jrmn_gnw_cr       VARCHAR(15),
jrmn_gnw_cr_tp    VARCHAR(10),
jrmn_gfw_cr       VARCHAR(15),
jrmn_gfw_cr_tp    VARCHAR(10),
jrmn_sgw_cr       VARCHAR(15),
jrmn_sgw_cr_tp    VARCHAR(10),
jrmn_snw_cr       VARCHAR(15),
jrmn_snw_cr_tp    VARCHAR(10),
jrmn_sfw_cr       VARCHAR(15),
jrmn_sfw_cr_tp    VARCHAR(10),
jrmn_cr_acc_id    VARCHAR(10),
jrmn_cr_desc      VARCHAR(100),
jrmn_desc	  VARCHAR(100),
jrmn_oth_info     VARCHAR(200),
jrmn_dob 	  VARCHAR(30),
jrmn_op_bal       VARCHAR(50),
jrmn_op_bal_type  VARCHAR(10),           
jrmn_cl_bal       VARCHAR(50),
jrmn_cl_bal_type  VARCHAR(10),          
jrmn_start_yr     VARCHAR(16),
jrmn_end_yr       VARCHAR(16),
jrmn_since	  DATETIME,
last_column                VARCHAR(1))AUTO_INCREMENT=1";

//Trans_id = Cust trans id which trans cust has done

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>