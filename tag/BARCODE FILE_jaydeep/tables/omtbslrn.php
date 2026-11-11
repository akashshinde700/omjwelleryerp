<?php

/*
 * **************************************************************************************
 * @tutorial: Sell Return table
 * **************************************************************************************
 * 
 * Created on Dec 13, 2013 5:56:56 PM
 *
 * @FileName: omtbslrn.php
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
$query = "CREATE TABLE IF NOT EXISTS slpr_return_inv (
slprrn_id                         INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
slprrn_owner_id                   VARCHAR(16),
slprrn_jrnl_id                    INT,
slprrn_firm_id                    VARCHAR(16),
slprrn_cust_id                    INT,
slprrn_supp_id                    VARCHAR(16),
slprrn_date                       VARCHAR(50),
slprrn_slprin_id                  VARCHAR(16),
slprrn_raw_gd_pre_Id              VARCHAR(6), 
slprrn_raw_gd_post_Id             VARCHAR(16),
slprrn_raw_sr_pre_Id              VARCHAR(6), 
slprrn_raw_sr_post_Id             VARCHAR(16),
slprrn_pre_invoice_no             VARCHAR(10),
slprrn_invoice_no                 VARCHAR(50),
slprrn_gd_frmid                   VARCHAR(16),
slprrn_sl_frmid                   VARCHAR(16),
slprrn_gd_accid                   VARCHAR(16),
slprrn_sl_accid                   VARCHAR(16),
slprrn_gd_tt_wgt                  VARCHAR(15),
slprrn_gd_tt_wgt_typ              VARCHAR(10),
slprrn_sl_tt_wgt                  VARCHAR(15),
slprrn_sl_tt_wgt_typ              VARCHAR(10),
slprrn_gd_rc_nt_wgt               VARCHAR(15),
slprrn_gd_rc_nt_wgt_typ           VARCHAR(10),
slprrn_sl_rc_nt_wgt               VARCHAR(15),
slprrn_sl_rc_nt_wgt_typ           VARCHAR(10),
slprrn_gd_rc_tunch                VARCHAR(15),
slprrn_sl_rc_tunch                VARCHAR(15),
slprrn_gd_rc_fn_wgt               VARCHAR(15),
slprrn_sl_rc_fn_wgt               VARCHAR(15),
slprrn_gd_rc_rate                 VARCHAR(15),
slprrn_sl_rc_rate                 VARCHAR(15),
slprrn_gd_rc_val                  VARCHAR(20),
slprrn_sl_rc_val                  VARCHAR(20),
slprrn_gd_wgt_bal                 VARCHAR(15),
slprrn_gd_wgt_bal_typ             VARCHAR(10),
slprrn_sl_wgt_bal                 VARCHAR(15),
slprrn_sl_wgt_bal_typ             VARCHAR(10),
slprrn_total_amt                  VARCHAR(20),
slprrn_tot_amt_rec                VARCHAR(20),
slprrn_paym_acc_id                VARCHAR(10),
slprrn_cheque_no                  VARCHAR(50),
slprrn_pay_card_type              VARCHAR(20),
slprrn_paym_oth_info              VARCHAR(200),
slprrn_cash_amt_rec               VARCHAR(50),
slprrn_discount_amt               VARCHAR(50),
slprrn_fnl_due_bal                VARCHAR(50),
slprrn_since                      DATETIME,
slprrn_staff_id	                  VARCHAR(16),
last_column                VARCHAR(1),UNIQUE KEY (slprrn_pre_invoice_no,slprrn_invoice_no))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>