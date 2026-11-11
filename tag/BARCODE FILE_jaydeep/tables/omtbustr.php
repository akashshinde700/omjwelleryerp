<?php

/*
 * Created on 22-Dec-2015 15:45:17 PM
 *
 * @FileName: omtbustr.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: eMunim
 * @version 1.0
 * @Copyright (c) 2015 www.softwaregen.com
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
//include '../system/omssopin.php';

$query = "CREATE TABLE IF NOT EXISTS user_transaction (
utrans_id 		  INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
utrans_owner_id           VARCHAR(16),
utrans_firm_id		  VARCHAR(16), 
utrans_user_id            VARCHAR(32),
utrans_pre_invoice_no     VARCHAR(10),
utrans_invoice_no         VARCHAR(10),
utrans_unique_id          VARCHAR(50),
utrans_type               VARCHAR(16),
utrans_gd_gs_wt           VARCHAR(16),
utrans_gd_gs_wt_type      VARCHAR(10),
utrans_gd_nt_wt           VARCHAR(16),
utrans_gd_nt_wt_type      VARCHAR(10),
utrans_gd_fn_wt           VARCHAR(16),
utrans_gd_fn_wt_type      VARCHAR(10),
utrans_gd_ffn_wt          VARCHAR(16),
utrans_gd_ffn_wt_type     VARCHAR(10),
utrans_sl_gs_wt           VARCHAR(16),
utrans_sl_gs_wt_type      VARCHAR(10),
utrans_sl_nt_wt           VARCHAR(16),
utrans_sl_nt_wt_type      VARCHAR(10),
utrans_sl_fn_wt           VARCHAR(16),
utrans_sl_fn_wt_type      VARCHAR(10),
utrans_sl_ffn_wt          VARCHAR(16),
utrans_sl_ffn_wt_type     VARCHAR(10),
utrans_gd_paid_wt         VARCHAR(15),
utrans_gd_paid_wt_typ     VARCHAR(10),
utrans_sl_paid_wt         VARCHAR(15),
utrans_sl_paid_wt_typ     VARCHAR(10),
utrans_paym_acc_id        VARCHAR(10),
utrans_pay_cheque_acc_id  VARCHAR(10),
utrans_pay_card_acc_id    VARCHAR(10),
utrans_pay_disc_acc_id    VARCHAR(10),
utrans_pay_vat_acc_id     VARCHAR(10),
utrans_courier_acc_id     VARCHAR(10),
utrans_cash_narratn       VARCHAR(16),
utrans_cheque_no          VARCHAR(50),
utrans_card_no            VARCHAR(50),
utrans_disc_narratn       VARCHAR(50),
utrans_courier_info       VARCHAR(30),
utrans_cash_amt_rec       VARCHAR(50),
utrans_pay_cheque_amt     VARCHAR(50),
utrans_pay_card_amt       VARCHAR(50),
utrans_discount_amt       VARCHAR(50),
utrans_pre_tax_amt        VARCHAR(15),
utrans_final_tax_amt      VARCHAR(15),
utrans_pay_vat_amt        VARCHAR(50),
utrans_pay_tax_amt        VARCHAR(10),
utrans_courier_chgs_amt   VARCHAR(50),
utrans_paym_oth_info      VARCHAR(200),
utrans_date               VARCHAR(80),
utrans_bal                VARCHAR(80),
utrans_gd_rtct_wt         VARCHAR(15),
utrans_gd_rtct_wt_typ     VARCHAR(15),
utrans_sl_rtct_wt         VARCHAR(10),
utrans_sl_rtct_wt_typ     VARCHAR(15),
utrans_gd_bal_wt          VARCHAR(15),
utrans_gd_bal_wt_typ      VARCHAR(10),
utrans_panelName          VARCHAR(30),
utrans_metal_val          VARCHAR(50),
utrans_cash_rec           VARCHAR(50),
utrans_item_desc          VARCHAR(30),
utrans_utin_id            integer,
utrans_jrnl_id            integer,
utrans_vat_jrnl_id        VARCHAR(16),
utrans_gd_rate            VARCHAR(20),
utrans_sl_rate            VARCHAR(16),
utrans_quantity           VARCHAR(10),
utrans_tunch              VARCHAR(15),
utrans_metal_type         VARCHAR(16),
utrans_item_name          VARCHAR(20),
utrans_final_fine_wt      VARCHAR(10),
utrans_wastage            VARCHAR(15),
utrans_lab_charges        VARCHAR(15),
utrans_lab_charges_type   VARCHAR(10),
utrans_valuation          VARCHAR(30),
utrans_crdr_type          VARCHAR(10),
utrans_transaction_type   VARCHAR(30),
utrans_tot_amt_rec        VARCHAR(50),
utrans_gd_bal_crdr        VARCHAR(5),
utrans_sl_bal_crdr        VARCHAR(5),
utrans_cash_bal_crdr      VARCHAR(5),
utrans_sl_bal_wt          VARCHAR(15),
utrans_sl_bal_wt_typ      VARCHAR(10),
utrans_prev_metal_gd_rate     VARCHAR(30),
utrans_prev_metal_sl_rate     VARCHAR(30),
utrans_avg_gd_rate        VARCHAR(30),
utrans_avg_sl_rate        VARCHAR(30),
utrans_gd_PNL_amt         VARCHAR(50),
utrans_sl_PNL_amt         VARCHAR(50),
utrans_gold_amt           VARCHAR(50),
utrans_silver_amt         VARCHAR(50),
utrans_prev_gd_amt        VARCHAR(50),
utrans_prev_sl_amt        VARCHAR(50),
utrans_cash_balance       VARCHAR(16), 
utrans_status 		  VARCHAR(16),
utrans_since              DATETIME,
utrans_other_info         VARCHAR(500),
utrans_othr_chgs_by               VARCHAR(15),
utrans_gd_othr_chgs_wt            VARCHAR(15),
utrans_gd_othr_chgs_wt_typ        VARCHAR(10),
utrans_sl_othr_chgs_wt            VARCHAR(15),
utrans_sl_othr_chgs_wt_typ        VARCHAR(10),
utrans_pay_opt                    VARCHAR(30),
utrans_oth_chgs_amt               VARCHAR(15),
utrans_cry_chrg                   VARCHAR(30),
utrans_prev_cash_bal              VARCHAR(50),
last_column                VARCHAR(1))AUTO_INCREMENT=10001";
if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
?>