<?php
/*
 * **************************************************************************************
 * @tutorial: Journal Trans Table 
 * **************************************************************************************
 *
 * Created on 24 Dec, 2012 11:43:27 PM
 *
 * @FileName: omtbjrtr.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: omunim
 * @version 1.0.1
 * @Copyright (c) 2010 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2012 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:15 NOV 2022
 *  AUTHOR:RENUKA SHARMA
 *  REASON:ADD COLUMN FOR OTHER LANGUAGE DATE
 *
 */
?>
<?php
$query = "CREATE TABLE IF NOT EXISTS journal_trans (
jrtr_id             INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
jrtr_jid            VARCHAR(16),
jrtr_jrnl_id        VARCHAR(16),
jrtr_own_id         VARCHAR(16),
jrtr_user_id        VARCHAR(30),
jrtr_user_type      VARCHAR(30),
jrtr_trans_id       VARCHAR(30),
jrtr_trans_type     VARCHAR(50),
jrtr_firm_id        VARCHAR(30),
jrtr_tr_crdr        VARCHAR(5),
jrtr_dr_amt         VARCHAR(50),
jrtr_odr_amt        VARCHAR(50),".//ADDED FOR ORDINARY DR AMOUNT @AUTHOR:MADHUREE-28APRIL2020
"jrtr_dr_amt_int    VARCHAR(50),
jrtr_ggw_dr         VARCHAR(15),
jrtr_ggw_dr_tp      VARCHAR(10),
jrtr_gnw_dr         VARCHAR(15),
jrtr_gnw_dr_tp      VARCHAR(10),
jrtr_gfw_dr         VARCHAR(15),
jrtr_gfw_dr_tp      VARCHAR(10),
jrtr_sgw_dr         VARCHAR(15),
jrtr_sgw_dr_tp      VARCHAR(10),
jrtr_snw_dr         VARCHAR(15),
jrtr_snw_dr_tp      VARCHAR(10),
jrtr_sfw_dr         VARCHAR(15),
jrtr_sfw_dr_tp      VARCHAR(10),
jrtr_dr_acc_id      VARCHAR(10),
jrtr_dr_acc_id_int  VARCHAR(10),
jrtr_dr_desc        VARCHAR(100),
jrtr_idr_desc       VARCHAR(100),
jrtr_cr_amt         VARCHAR(50),
jrtr_ocr_amt        VARCHAR(50),".//ADDED FOR ORDINARY CR AMOUNT @AUTHOR:MADHUREE-28APRIL2020
"jrtr_cr_amt_int    VARCHAR(50),
jrtr_ggw_cr         VARCHAR(15),
jrtr_ggw_cr_tp      VARCHAR(10),
jrtr_gnw_cr         VARCHAR(15),
jrtr_gnw_cr_tp      VARCHAR(10),
jrtr_gfw_cr         VARCHAR(15),
jrtr_gfw_cr_tp      VARCHAR(10),
jrtr_sgw_cr         VARCHAR(15),
jrtr_sgw_cr_tp      VARCHAR(10),
jrtr_snw_cr         VARCHAR(15),
jrtr_snw_cr_tp      VARCHAR(10),
jrtr_sfw_cr         VARCHAR(15),
jrtr_sfw_cr_tp      VARCHAR(10),
jrtr_cr_acc_id      VARCHAR(10),
jrtr_cr_acc_id_int  VARCHAR(10),
jrtr_cr_desc        VARCHAR(100),
jrtr_icr_desc        VARCHAR(100),
jrtr_desc           VARCHAR(100),
jrtr_oth_info       VARCHAR(200),
jrtr_dob            VARCHAR(50),
jrtr_since          DATETIME,
jrtr_other_lang_dob VARCHAR(50), 
last_column         VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>