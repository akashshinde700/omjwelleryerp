<?php

/*
 * **************************************************************************************
 * @tutorial:Cust Sell Invoice Table
 * **************************************************************************************
 * 
 * Created on Dec 24, 2013 6:45:48 PM
 *
 * @FileName: omtbslin.php
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

/***********Start code to add column itslin_tot_fin_amt in cust_itsl_inv @OMMODTAG SHE20APR16******************** */
$query = "CREATE TABLE IF NOT EXISTS cust_itsl_inv (
itslin_id                         INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
itslin_owner_id                   VARCHAR(16),
itslin_jrnl_id                    INT,
itslin_pre_invoice_no             VARCHAR(16), 
itslin_invoice_no                 VARCHAR(16), 
itslin_cust_id                    VARCHAR(16), 
itslin_firm_id                    VARCHAR(16), 
itslin_acc_id                     VARCHAR(16), 
itslin_date                       VARCHAR(50),
itslin_raw_gd_pre_Id              VARCHAR(6), 
itslin_raw_gd_post_Id             VARCHAR(16),
itslin_gd_type                    VARCHAR(16), 
itslin_gd_firm_id                 VARCHAR(16), 
itslin_gd_acc_id                  VARCHAR(16),
itslin_gd_gs_wgt                  VARCHAR(15),
itslin_gd_gs_wgt_typ              VARCHAR(10),
itslin_gd_nt_wgt                  VARCHAR(15),
itslin_gd_nt_wgt_typ              VARCHAR(10),
itslin_gd_fn_wgt                  VARCHAR(15),
itslin_gd_fn_wgt_typ              VARCHAR(10),
itslin_gd_rc_wgt                  VARCHAR(16),
itslin_gd_rc_wgt_type             VARCHAR(16),
itslin_gd_tunch                   VARCHAR(10),
itslin_gd_rc_fn_wgt               VARCHAR(10),
itslin_gd_rate                    VARCHAR(50),
itslin_gd_rc_val                  VARCHAR(50),
itslin_gd_bal_wgt                 VARCHAR(50),
itslin_gd_bal_wgt_type            VARCHAR(50),
itslin_raw_sr_pre_Id              VARCHAR(6), 
itslin_raw_sr_post_Id             VARCHAR(16),
itslin_sr_type                    VARCHAR(16), 
itslin_sr_firm_id                 VARCHAR(16), 
itslin_sr_acc_id                  VARCHAR(16),
itslin_sr_gs_wgt                  VARCHAR(15),
itslin_sr_gs_wgt_typ              VARCHAR(10),
itslin_sr_nt_wgt                  VARCHAR(15),
itslin_sr_nt_wgt_typ              VARCHAR(10),
itslin_sr_fn_wgt                  VARCHAR(15),
itslin_sr_fn_wgt_typ              VARCHAR(10),
itslin_sr_rc_wgt                  VARCHAR(16),
itslin_sr_rc_wgt_type             VARCHAR(16),
itslin_sr_tunch                   VARCHAR(10),
itslin_sr_rc_fn_wgt               VARCHAR(10),
itslin_sr_rate                    VARCHAR(50),
itslin_sr_rc_val                  VARCHAR(50),
itslin_sr_bal_wgt                 VARCHAR(50),
itslin_sr_bal_wgt_type            VARCHAR(50),
itslin_tot_amount                 VARCHAR(50),
itslin_tot_amount_rc              VARCHAR(50),
itslin_fnl_due_bal                VARCHAR(50),
itslin_pay_by                     VARCHAR(50),
itslin_tot_cash_rc                VARCHAR(50),
itslin_discount                   VARCHAR(50),
itslin_card_type                  VARCHAR(50),
itsl_card_amt                     VARCHAR(30),
itsl_cheque_amt                   VARCHAR(30),
itsl_cheque_no                    VARCHAR(30),
itsl_disc_narratn                 VARCHAR(30),
itsl_cash_narratn                 VARCHAR(30),
itsl_vat_amt                      VARCHAR(30),
itsl_tax_amt                      VARCHAR(30),
itsl_cheque_acc_id                VARCHAR(30),
itsl_card_acc_id                  VARCHAR(30),
itsl_disc_acc_id                  VARCHAR(30),
itsl_vat_acc_id                   VARCHAR(30),
itslin_card_no                    VARCHAR(30),
itslin_other_info                 VARCHAR(50),
itslin_status                     VARCHAR(32),
itslin_gd_rtct                    VARCHAR(30),
itslin_gd_rtct_type               VARCHAR(30),
itslin_sr_rtct                    VARCHAR(30),
itslin_sr_rtct_type               VARCHAR(30),
itslin_gd_valuation               VARCHAR(30),
itslin_sr_valuation               VARCHAR(30),
itslin_adv_amt                    VARCHAR(30),
itslin_othr_chgs_by               VARCHAR(10),
itslin_gd_othr_chgs_wt            VARCHAR(20),
itslin_gd_othr_chgs_wt_typ        VARCHAR(20),
itslin_sl_othr_chgs_wt            VARCHAR(20),
itslin_sl_othr_chgs_wt_typ         VARCHAR(20),
itslin_gd_rtct_wt_rem_bal         VARCHAR(20),
itslin_sl_rtct_wt_rem_bal         VARCHAR(20),
itslin_tot_fin_amt                VARCHAR(15),
itslin_since                      DATETIME,
itslin_staff_id	                  VARCHAR(16),
last_column                VARCHAR(1),UNIQUE KEY (itslin_pre_invoice_no,itslin_invoice_no))AUTO_INCREMENT=10001";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';

/***********End code to add column itslin_tot_fin_amt in cust_itsl_inv @OMMODTAG SHE20APR16******************** */
