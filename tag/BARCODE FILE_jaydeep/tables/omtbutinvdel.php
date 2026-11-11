<?php

/*
 * **************************************************************************************
 * @tutorial: 
 * **************************************************************************************
 * 
 * Created on 7 Aug, 2017 5:53:06 PM
 *
 * @FileName: omtbutinvdel.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: omunim
 * @version 3.0.0
 * @Copyright (c) 2017 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2017 SoftwareGen Technologies
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
$query = "CREATE TABLE IF NOT EXISTS user_transaction_invoice_del (
utin_id 		INT NOT NULL," .
// Need for udhaar deposit @Author:PRIYANKA-28JUN17
"utin_utin_id           VARCHAR(16),".
// Owner,firm and user id's
"utin_owner_id          VARCHAR(16),
utin_firm_id		VARCHAR(16), 
utin_user_id            VARCHAR(32)," .
// Invoice Number.       
"utin_pre_invoice_no    VARCHAR(10),
utin_invoice_no         VARCHAR(10)," .
// Which Transaction.
"utin_type              VARCHAR(16),
utin_transaction_type   VARCHAR(30)," .
// =========================================
// = Gold Weights
// =========================================
"utin_gd_qty            VARCHAR(16),
utin_gd_gs_wt           VARCHAR(16),
utin_gd_gs_wt_type      VARCHAR(10),
utin_gd_nt_wt           VARCHAR(16),
utin_gd_nt_wt_type      VARCHAR(10),
utin_gd_fn_wt           VARCHAR(16),
utin_gd_fn_wt_type      VARCHAR(10),
utin_gd_ffn_wt          VARCHAR(16),
utin_gd_ffn_wt_type     VARCHAR(10),
utin_gd_oth_chgs_wt     VARCHAR(15),
utin_gd_oth_chgs_wt_typ VARCHAR(10),
utin_gd_paid_wt         VARCHAR(15),
utin_gd_paid_wt_typ     VARCHAR(10),
utin_gd_rtct_wt         VARCHAR(15),
utin_gd_rtct_wt_typ     VARCHAR(15),
utin_gd_due_wt          VARCHAR(15),
utin_gd_due_wt_typ      VARCHAR(10)," .
// Gold Settled Invoice Id
"utin_gd_settled_inv_id            INT,".   
        
// Gold Payment Check
"utin_gd_pay_chk           VARCHAR(10),".

// =========================================
// = Silver Weights
// =========================================  
"utin_sl_qty            VARCHAR(16),
utin_sl_gs_wt           VARCHAR(16),
utin_sl_gs_wt_type      VARCHAR(10),
utin_sl_nt_wt           VARCHAR(16),
utin_sl_nt_wt_type      VARCHAR(10),
utin_sl_fn_wt           VARCHAR(16),
utin_sl_fn_wt_type      VARCHAR(10),
utin_sl_ffn_wt          VARCHAR(16),
utin_sl_ffn_wt_type     VARCHAR(10),
utin_sl_oth_chgs_wt     VARCHAR(15),
utin_sl_oth_chgs_wt_typ VARCHAR(10),
utin_sl_paid_wt         VARCHAR(15),
utin_sl_paid_wt_typ     VARCHAR(10),
utin_sl_rtct_wt         VARCHAR(10),
utin_sl_rtct_wt_typ     VARCHAR(15),
utin_sl_due_wt          VARCHAR(15),
utin_sl_due_wt_typ      VARCHAR(10)," .
// Silver Settled Invoice Id
"utin_sl_settled_inv_id INT," .
        
// Silver Payment Check
"utin_sl_pay_chk           VARCHAR(10),".
// ====================================================================================================
// FOR PLATINIUM METAL TYPE @SIMRAN:19JUNE2023
// ====================================================================================================
"utin_pt_qty                                            VARCHAR(16),
utin_pt_gs_wt                                           VARCHAR(16),
utin_pt_gs_wt_type                                      VARCHAR(4),
utin_pt_nt_wt                                           VARCHAR(16),
utin_pt_nt_wt_type                                      VARCHAR(4),
utin_pt_fn_wt                                           VARCHAR(16),
utin_pt_fn_wt_type                                      VARCHAR(4),
utin_pt_ffn_wt                                          VARCHAR(16),
utin_pt_ffn_wt_type                                     VARCHAR(4),
utin_pt_oth_chgs_wt                                     VARCHAR(15),
utin_pt_oth_chgs_wt_typ                                 VARCHAR(4),
utin_pt_paid_wt                                         VARCHAR(15),
utin_pt_paid_wt_typ                                     VARCHAR(4),
utin_pt_rtct_wt                                         VARCHAR(15),
utin_pt_rtct_wt_typ                                     VARCHAR(4),
utin_pt_rtct_amt                                        VARCHAR(15),"//COLUMN ADDED FOR GOLD RATE CUT AMOUNT @AUTHOR:MADHUREE-16DEC2020
        . "utin_pt_due_wt                                        VARCHAR(15),
utin_pt_due_wt_typ                                      VARCHAR(4)," .
// Gold Settled Invoice Id
        "utin_pt_settled_inv_id                                 INT," .
// Gold Payment Check
        "utin_pt_pay_chk                                        VARCHAR(10)," .
//
        
// =========================================
// = Metal Rates
// =========================================
// Rate Cut Rates        
"utin_st_qty            VARCHAR(16),
utin_gd_rate            VARCHAR(20),
utin_sl_rate            VARCHAR(16),
utin_pt_rate            VARCHAR(20)," .
// Previous remaining metal's rates.             
"utin_prev_metal_gd_rate    VARCHAR(30),
utin_prev_metal_sl_rate     VARCHAR(30),
utin_prev_metal_pt_rate     VARCHAR(30)," .
// Current Average metal rates               
"utin_avg_gd_rate       VARCHAR(30),
utin_avg_sl_rate        VARCHAR(30),
utin_avg_pt_rate        VARCHAR(30)," .
// Total other charges (labour charges & tax amount)       
"utin_oth_chgs_amt      VARCHAR(15)," .
// Total crystal charges        
"utin_crystal_amt       VARCHAR(30)," .
// Total payable amount        
"utin_total_amt         VARCHAR(30)," .
// All payment account id's  
// New 4 Columns Added by Author:PRIYANKA-19JUN17
"utin_gold_acc_id       VARCHAR(10),
utin_silver_acc_id      VARCHAR(10),
utin_platinum_acc_id      VARCHAR(10),
utin_cr_acc_id          VARCHAR(10),
utin_dr_acc_id          VARCHAR(10),
utin_pay_cash_acc_id    VARCHAR(10),
utin_pay_cheque_acc_id  VARCHAR(10),
utin_pay_card_acc_id    VARCHAR(10),
utin_online_pay_acc_id  VARCHAR(10),
utin_pay_disc_acc_id    VARCHAR(10),
utin_pay_tax_acc_id     VARCHAR(10),
utin_courier_acc_id     VARCHAR(10)," .
// All Payment account info                
"utin_cash_narratn      VARCHAR(16),
utin_cheque_no          VARCHAR(50),
utin_card_no            VARCHAR(50),
utin_online_pay_narratn VARCHAR(40),
utin_disc_narratn       VARCHAR(50),
utin_courier_info       VARCHAR(30)," .
// Cash,cheque,cc card, online payment & discount amounts        
"utin_cash_amt_rec      VARCHAR(30),
utin_pay_cheque_amt     VARCHAR(30),
utin_pay_card_amt       VARCHAR(30),
utin_pay_trans_chrg     VARCHAR(30),
utin_online_pay_amt     VARCHAR(30),
utin_pay_comm_paid      VARCHAR(30),
utin_discount_amt       VARCHAR(30),
utin_courier_chgs_amt   VARCHAR(30)," .
// All tax amounts               
"utin_pre_tax_amt        VARCHAR(30),
utin_final_tax_amt       VARCHAR(30),
utin_pay_tax_chrg        VARCHAR(10),
utin_pay_cgst_chrg       VARCHAR(10),
utin_pay_sgst_chrg       VARCHAR(10),
utin_pay_igst_chrg       VARCHAR(10),
utin_pay_mkg_cgst_chrg    VARCHAR(10),
utin_pay_mkg_sgst_chrg    VARCHAR(10),
utin_pay_tax_amt         VARCHAR(30),
utin_pay_cgst_amt        VARCHAR(30),
utin_pay_sgst_amt        VARCHAR(30),
utin_pay_igst_amt        VARCHAR(30),
utin_pay_mkg_cgst_amt     VARCHAR(30),
utin_pay_mkg_sgst_amt     VARCHAR(30),".
// Taxable amounts columns
"utin_pay_tax_tot_amt         VARCHAR(30),
utin_pay_cgst_tot_amt        VARCHAR(30),
utin_pay_sgst_tot_amt        VARCHAR(30),
utin_pay_igst_tot_amt        VARCHAR(30),
utin_pay_mkg_cgst_tot_amt     VARCHAR(30),
utin_pay_mkg_sgst_tot_amt     VARCHAR(30),
utin_tot_payable_amt           VARCHAR(30),".
// Tax Amounts Checks
"utin_pay_cgst_chk            VARCHAR(15),
utin_pay_sgst_chk             VARCHAR(15),
utin_pay_igst_chk             VARCHAR(15),
utin_pay_tax_chk              VARCHAR(15),
utin_pay_mkg_tax_chk          VARCHAR(15),
utin_pay_tax_by_val_chk       VARCHAR(15),
utin_paytm_pay_chk            VARCHAR(15),".   // ADDED PAY WITH PAYMENT COL @SIMRAN:29NOV2023
// Tax Amounts Account Id
"utin_pay_cgst_acc_id         VARCHAR(10),
utin_pay_sgst_acc_id          VARCHAR(10),
utin_pay_igst_acc_id          VARCHAR(10),
utin_pay_mkg_cgst_acc_id      VARCHAR(10),
utin_pay_mkg_sgst_acc_id      VARCHAR(10),".
// Payment other info        
"utin_paym_oth_info      VARCHAR(200)," .
// Invoice other info        
"utin_other_info         VARCHAR(500)," .
// Invoice Date       
"utin_date               VARCHAR(80)," .
// Invoice entry date
"utin_since              DATETIME," .
// Total paid raw metal amount.
"utin_tot_amt_rec       VARCHAR(30)," .
// Invoice journal id's
"utin_jrnl_id           INT,
utin_tax_jrnl_id        INT," .
// Cr & Dr Type
"utin_CRDR              VARCHAR(10),
utin_gd_CRDR            VARCHAR(5),
utin_sl_CRDR            VARCHAR(5),
utin_cash_CRDR          VARCHAR(5),
utin_pt_CRDR            VARCHAR(5)," .
// Rate Cut Metal Profit & Loss 
"utin_gd_PNL_amt        VARCHAR(30),
utin_sl_PNL_amt         VARCHAR(30),
utin_pt_PNL_amt         VARCHAR(30)," .
// Separate gold & silver amounts.       
"utin_gold_amt          VARCHAR(30),
utin_silver_amt         VARCHAR(30),
utin_platinum_amt         VARCHAR(30)," .
// Separate gold & silver previous invoice amounts       
"utin_prev_gd_amt       VARCHAR(30),
utin_prev_sl_amt        VARCHAR(30),
utin_prev_pt_amt        VARCHAR(30)," .
// Previous invoices amount 
"utin_prev_cash_bal     VARCHAR(30)," .
// Total amt deposited @Author:PRIYANKA-03-07-17
"utin_total_amt_deposit VARCHAR(30),".
// Final due amount       
"utin_cash_balance      VARCHAR(16)," .
// Amount Settled Invoice Id
"utin_amt_settled_inv_id     INT," .
// Amount Payment Check
"utin_amt_pay_chk           VARCHAR(10),".
// Optional - status of invoice
"utin_status 		VARCHAR(16)," .
// Other charges by weight or by cash
"utin_othr_chgs_by      VARCHAR(10)," .
// Invoice pending payment settlement check
"utin_pay_opt           VARCHAR(30)," .
// Invoice payment mode
"utin_payment_mode            VARCHAR(10)," .
// Staff Id
"utin_staff_id                VARCHAR(16),".
// utin_sales_person_name @simran:23aug2023
"utin_sales_person_name            VARCHAR(50)," .
// New 3 Columns Added by Author:PRIYANKA-19JUN17        
"utin_comm                    VARCHAR(1000),
utin_due_date                 VARCHAR(80),
utin_history                  VARCHAR(2000),".
// New 5 Columns Added by Author:PRIYANKA-21JUN17      
"utin_ROI                     VARCHAR(30),
utin_EMI_days                 VARCHAR(30),
utin_EMI_occurrences          VARCHAR(30),
utin_EMI_status               VARCHAR(50),
utin_EMI_opt                  VARCHAR(30),".
// New 3 Columns Added by Author:PRIYANKA-29JUN17     
"utin_EMI_amt                 VARCHAR(50),
utin_EMI_int_amt              VARCHAR(50),
utin_EMI_total_amt            VARCHAR(50),".
// New 3 Columns Added by Author:PRIYANKA-01JULY17     
"utin_EMI_no                  VARCHAR(50),             
utin_EMI_start_DOB            VARCHAR(50),
utin_EMI_end_DOB              VARCHAR(50),".
// New 2 Columns Added by Author:PRIYANKA-07JULY17   
"utin_EMI_paid_date           VARCHAR(50),
utin_paid_amt                 VARCHAR(50),
utin_scheme_gold_valuation    VARCHAR(20),
utin_scheme_mkg_disc_per      VARCHAR(10),
utin_kitty_id                 VARCHAR(16),
utin_paytm_order_id           VARCHAR(50),
utin_paytm_pay_amt            VARCHAR(30),
utin_paytm_card_no            VARCHAR(20),
utin_paytm_bank_name          VARCHAR(50),
utin_paytm_bank_mid           VARCHAR(20),
utin_paytm_bank_tid           VARCHAR(20),
utin_paytm_aid                VARCHAR(40),
utin_paytm_pay_method         VARCHAR(20),
utin_paytm_pay_card_type      VARCHAR(30),
utin_paytm_pay_card_scheme    VARCHAR(30),
utin_paytm_prod_code          VARCHAR(40),
utin_paytm_values             VARCHAR(2056),
utin_advance_rate            VARCHAR(8),
utin_advance_wt               VARCHAR(8),
utin_panel_name               VARCHAR(16), 
utin_gd_total_mkg             VARCHAR(16),
utin_sl_total_mkg             VARCHAR(16),
utin_pl_total_mkg             VARCHAR(16),
utin_system_type              VARCHAR(16),
utin_last_column              VARCHAR(10))";

if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>