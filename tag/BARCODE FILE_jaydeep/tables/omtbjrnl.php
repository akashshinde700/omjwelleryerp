<?php
/*
 * **************************************************************************************
 * @tutorial: Main Journal Table 
 * **************************************************************************************
 *
 * Created on 29 JAN, 2012 11:43:27 PM
 *
 * @FileName: omtbjrnl.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: omunim
 * @version 1.0.1
 * @Copyright (c) 2010 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2012 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:Modified by @AUTHOR:PRIYA29JAN13 
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php
//require_once 'system/omssopin.php';
$query = "CREATE TABLE IF NOT EXISTS journal (
jrnl_id           INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
jrnl_own_id	  VARCHAR(16),
jrnl_jid          VARCHAR(10),
jrnl_userid       VARCHAR(30),
jrnl_user_type    VARCHAR(30),
jrnl_trans_id     VARCHAR(30),
jrnl_trans_type   VARCHAR(30),
jrnl_firm_id      VARCHAR(30),
jrnl_tt_dr        VARCHAR(50),
jrnl_tt_odr        VARCHAR(50),
jrnl_tt_dr_int    VARCHAR(50),
jrnl_ggw_dr       VARCHAR(15),
jrnl_ggw_dr_tp    VARCHAR(10),
jrnl_gnw_dr       VARCHAR(15),
jrnl_gnw_dr_tp    VARCHAR(10),
jrnl_gfw_dr       VARCHAR(15),
jrnl_gfw_dr_tp    VARCHAR(10),
jrnl_sgw_dr       VARCHAR(15),
jrnl_sgw_dr_tp    VARCHAR(10),
jrnl_snw_dr       VARCHAR(15),
jrnl_snw_dr_tp    VARCHAR(10),
jrnl_sfw_dr       VARCHAR(15),
jrnl_sfw_dr_tp    VARCHAR(10),
jrnl_dr_acc_id      VARCHAR(10),
jrnl_dr_acc_id_int  VARCHAR(10),
jrnl_dr_desc        VARCHAR(100),
jrnl_idr_desc        VARCHAR(100),
jrnl_tt_cr	  VARCHAR(50),
jrnl_tt_ocr	  VARCHAR(50),
jrnl_tt_cr_int	  VARCHAR(50),
jrnl_ggw_cr       VARCHAR(15),
jrnl_ggw_cr_tp    VARCHAR(10),
jrnl_gnw_cr       VARCHAR(15),
jrnl_gnw_cr_tp    VARCHAR(10),
jrnl_gfw_cr       VARCHAR(15),
jrnl_gfw_cr_tp    VARCHAR(10),
jrnl_sgw_cr       VARCHAR(15),
jrnl_sgw_cr_tp    VARCHAR(10),
jrnl_snw_cr       VARCHAR(15),
jrnl_snw_cr_tp    VARCHAR(10),
jrnl_sfw_cr       VARCHAR(15),
jrnl_sfw_cr_tp    VARCHAR(10),
jrnl_cr_acc_id        VARCHAR(10),
jrnl_cr_acc_id_int    VARCHAR(10),
jrnl_cr_desc          VARCHAR(100),
jrnl_icr_desc          VARCHAR(100),
jrnl_desc	  VARCHAR(100),
jrnl_oth_info     VARCHAR(200),
jrnl_dob 	  VARCHAR(30),
jrnl_since	  DATETIME,
last_column                VARCHAR(1))AUTO_INCREMENT=1";

//Trans_id = Cust trans id which trans cust has done

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>