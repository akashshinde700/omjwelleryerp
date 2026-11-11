<?php

/*
 * *****************************************************************************************************
 * @tutorial: user_transaction_invoice table
 * *****************************************************************************************************
 *
 * Created on 28 Sep, 2016
 *
 * @FileName: omtbutinv.php
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

//include '../system/omssopin.php';
$query = "CREATE TABLE IF NOT EXISTS user_transaction_invoice (
utin_id                                                 INT NOT NULL PRIMARY KEY AUTO_INCREMENT," .
// Need for udhaar deposit @Author:PRIYANKA-28JUN17
        "utin_utin_id                                           VARCHAR(16)," .
        "utin_transaction_id                                    VARCHAR(26)," . //COLUMN ADDED TO STORE UNIQUE TRANSCATION ID@AUTHOR:MADHUREE-10AUGUST2022
// Owner,firm and user id's
        "utin_owner_id                                          VARCHAR(16),
utin_firm_id                                            VARCHAR(16), 
utin_user_id                                            VARCHAR(32),
utin_billing_name                                       VARCHAR(50),"
        . "utin_gift_user_id                                     VARCHAR(32)," . // YUVRAJ ADD THIS utin_gift_user_id COLOUM 14012021 
// Invoice Number.       
        "utin_pre_invoice_no                                    VARCHAR(20),
utin_invoice_no                                         VARCHAR(10)," .
// Which Transaction.
        "utin_type                                              VARCHAR(16),
utin_transaction_type                                   VARCHAR(30),
utin_prod_details                                       VARCHAR(100),
utin_prod_qty                                           VARCHAR(10),
utin_prod_unit_price                                    VARCHAR(32)," .
// =====================================================================================================
// = Gold Weights
// =====================================================================================================
//Column(utin_gd_qty) for Gold qt. @AMRUTA10JUNE2022
        "utin_gd_qty                                            VARCHAR(16),
utin_gd_gs_wt                                           VARCHAR(16),
utin_gd_gs_wt_type                                      VARCHAR(4),
utin_gd_nt_wt                                           VARCHAR(16),
utin_gd_nt_wt_type                                      VARCHAR(4),
utin_gd_fn_wt                                           VARCHAR(16),
utin_gd_fn_wt_type                                      VARCHAR(4),
utin_gd_ffn_wt                                          VARCHAR(16),
utin_gd_ffn_wt_type                                     VARCHAR(4),
utin_gd_oth_chgs_wt                                     VARCHAR(15),
utin_gd_oth_chgs_wt_typ                                 VARCHAR(4),
utin_gd_paid_wt                                         VARCHAR(15),
utin_gd_paid_wt_rate                                    VARCHAR(15),
utin_gd_paid_wt_typ                                     VARCHAR(4),
utin_gd_rtct_wt                                         VARCHAR(15),
utin_gd_rtct_wt_typ                                     VARCHAR(4),
utin_gd_rtct_amt                                        VARCHAR(15),"//COLUMN ADDED FOR GOLD RATE CUT AMOUNT @AUTHOR:MADHUREE-16DEC2020
        . "utin_gd_due_wt                                        VARCHAR(15),
utin_gd_due_wt_typ                                      VARCHAR(4)," .
// Gold Settled Invoice Id
        "utin_gd_settled_inv_id                                 INT," .
// Gold Payment Check
        "utin_gd_pay_chk                                        VARCHAR(10)," .
// =====================================================================================================
// = Silver Weights
// =====================================================================================================   
//Column(utin_sl_qty) for Silver qt. @AMRUTA10JUNE2022
        "utin_sl_qty                                            VARCHAR(16),
utin_sl_gs_wt                                           VARCHAR(16),
utin_sl_gs_wt_type                                      VARCHAR(4),
utin_sl_nt_wt                                           VARCHAR(16),
utin_sl_nt_wt_type                                      VARCHAR(4),
utin_sl_fn_wt                                           VARCHAR(16),
utin_sl_fn_wt_type                                      VARCHAR(4),
utin_sl_ffn_wt                                          VARCHAR(16),
utin_sl_ffn_wt_type                                     VARCHAR(4),
utin_sl_oth_chgs_wt                                     VARCHAR(15),
utin_sl_oth_chgs_wt_typ                                 VARCHAR(4),
utin_sl_paid_wt                                         VARCHAR(15),
utin_sl_paid_wt_rate                                    VARCHAR(15),
utin_sl_paid_wt_typ                                     VARCHAR(4),
utin_sl_rtct_wt                                         VARCHAR(10),
utin_sl_rtct_wt_typ                                     VARCHAR(4),
utin_sl_rtct_amt                                        VARCHAR(15),"//COLUMN ADDED FOR SILVER RATE CUT AMOUNT @AUTHOR:MADHUREE-16DEC2020
        . "utin_sl_due_wt                                        VARCHAR(15),
utin_sl_due_wt_typ                                      VARCHAR(4)," .
// Silver Settled Invoice Id
        "utin_sl_settled_inv_id                                 INT," .
// Silver Payment Check
        "utin_sl_pay_chk                                        VARCHAR(10)," .
// =====================================================================================================
// = Crystal Weights
// =====================================================================================================  
//Column(utin_st_qty) for Stone/Crystal/Diamond qt. @AMRUTA10JUNE2022
        "utin_st_qty                                            VARCHAR(16),
utin_st_gs_wt                                           VARCHAR(16),
utin_st_gs_wt_type                                      VARCHAR(4),
utin_st_nt_wt                                           VARCHAR(16),
utin_st_nt_wt_type                                      VARCHAR(4),
utin_st_oth_chgs_wt                                     VARCHAR(15),
utin_st_oth_chgs_wt_typ                                 VARCHAR(4),
utin_st_paid_wt                                         VARCHAR(15),
utin_st_paid_wt_typ                                     VARCHAR(4),
utin_st_rtct_wt                                         VARCHAR(10),
utin_st_rtct_wt_typ                                     VARCHAR(4),
utin_st_rtct_amt                                        VARCHAR(15),"//COLUMN ADDED FOR SILVER RATE CUT AMOUNT @AUTHOR:MADHUREE-16DEC2020
        . "utin_st_due_wt                                        VARCHAR(15),
utin_st_due_wt_typ                                      VARCHAR(4)," .
// Crystal Settled Invoice Id
        "utin_st_settled_inv_id                                 INT," .
// Crystal Payment Check
        "utin_st_pay_chk                                        VARCHAR(10)," .
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
// ====================================================================================================
// = Metal Rates
// ====================================================================================================
// Rate Cut Rates        
        "utin_gd_rate                                           VARCHAR(20),
utin_sl_rate                                            VARCHAR(16),
utin_st_rate                                            VARCHAR(16),
utin_pt_rate                                            VARCHAR(16)," .
// Previous remaining metal's rates.             
        "utin_prev_metal_gd_rate                                VARCHAR(30),
utin_prev_metal_sl_rate                                 VARCHAR(30),
utin_prev_metal_st_rate                                 VARCHAR(30),
utin_prev_metal_pt_rate                                 VARCHAR(30)," .
// Current Average metal rates               
        "utin_avg_gd_rate                                       VARCHAR(30),
utin_avg_sl_rate                                        VARCHAR(30),
utin_avg_st_rate                                        VARCHAR(30),
utin_avg_pt_rate                                        VARCHAR(30)," .
// 
// HALLMARK CHARGES @PRIYANKA-26MAY2022         
        "utin_hallmark_chrgs_amt                                VARCHAR(15)," .
// 
// Total other charges (labour charges & tax amount)       
        "utin_oth_chgs_amt                                      VARCHAR(15)," .
// 
// Total crystal charges        
        "utin_crystal_amt                                       VARCHAR(30)," .
// 
// Total payable amount        
        "utin_total_amt                                         VARCHAR(30)," .
// 
// Total Taxable Amount - Reverse Calculation On Payment Panel @Author:PRIYANKA-01OCT18
        "utin_total_taxable_amt                                 VARCHAR(30)," .
// 
// 
// All payment account id's  
// New 4 Columns Added by Author:PRIYANKA-19JUN17
        "utin_gold_acc_id                                       VARCHAR(10),
utin_silver_acc_id                                      VARCHAR(10),
utin_crystal_acc_id                                      VARCHAR(10),
utin_cr_acc_id                                          VARCHAR(10),
utin_dr_acc_id                                          VARCHAR(10),
utin_pay_cash_acc_id                                    VARCHAR(10),
utin_pay_cheque_acc_id                                  VARCHAR(10),
utin_pay_card_acc_id                                    VARCHAR(10),
utin_online_pay_acc_id                                  VARCHAR(10),
utin_platinum_acc_id                                       VARCHAR(10)," .
// 
// utin_pay_int_acc_id column added to added udhaar interest account id,@AUTHOR:HEMA-23OCT2020
        "utin_pay_int_acc_id                                    VARCHAR(10),
utin_pay_disc_acc_id                                    VARCHAR(10),
utin_pay_tax_acc_id                                     VARCHAR(10),
utin_courier_acc_id                                     VARCHAR(10),
utin_other_acc_id                                       VARCHAR(10)," .
// 
// All Payment account info                
        "utin_cash_narratn                                      VARCHAR(16),
utin_cheque_no                                          VARCHAR(20),
utin_cheque_num                                         VARCHAR(50),
utin_cheque_submit_date                                 VARCHAR(32),
utin_cheque_clearance_date                              VARCHAR(32),
utin_cheque_submitted_on_date                           VARCHAR(32),
utin_cheque_cleared_on_date                             VARCHAR(32),
utin_card_no                                            VARCHAR(32),
utin_online_pay_narratn                                 VARCHAR(32),
utin_disc_narratn                                       VARCHAR(32),
utin_courier_info                                       VARCHAR(30),
utin_other_charge_info                                  VARCHAR(30)," .
// 
// Cash, cheque, cc card, online payment & discount amounts        
        "utin_cash_amt_rec                                      VARCHAR(30),
utin_pay_cheque_amt                                     VARCHAR(30),
utin_pay_card_amt                                       VARCHAR(30),
utin_pay_trans_chrg_per                                 VARCHAR(30)," . //COLUMN ADDED TO STORE TRANS CHARGES PERCENTAGE@AUTHOR:MADHUREE-04SEP2021
        "utin_pay_trans_chrg                                    VARCHAR(30)," .
        "utin_online_pay_amt                                    VARCHAR(30),
utin_pay_comm_paid_per                                  VARCHAR(30)," . //COLUMN ADDED TO STORE TRANS CHARGES PERCENTAGE@AUTHOR:MADHUREE-04SEP2021
        "utin_pay_comm_paid                                     VARCHAR(30),
utin_discount_amt                                       VARCHAR(30),
utin_discount_per                                       VARCHAR(30),
utin_discount_amt_discup                                VARCHAR(30),
utin_discount_per_discup                                VARCHAR(30),
utin_disc_narratn_discup                                VARCHAR(30)," .
// 
// Additional Charges, Narration And Account Id Columns @PRIYANKA-23AUG2019
        "utin_additional_charges                                VARCHAR(30),
utin_additional_charges_narratn                         VARCHAR(30),
utin_additional_charges_acc_id                          VARCHAR(30),
utin_courier_chgs_amt                                   VARCHAR(30),
utin_other_chgs_amt                                     VARCHAR(30)," .
// 
// All tax amounts               
        "utin_pre_tax_amt                                       VARCHAR(30),
utin_final_tax_amt                                      VARCHAR(30),
utin_pay_tax_chrg                                       VARCHAR(10),
utin_pay_cgst_chrg                                      VARCHAR(10),
utin_pay_sgst_chrg                                      VARCHAR(10),
utin_pay_igst_chrg                                      VARCHAR(10),
utin_pay_mkg_cgst_chrg                                  VARCHAR(10),
utin_pay_mkg_sgst_chrg                                  VARCHAR(10),
utin_pay_mkg_igst_chrg                                  VARCHAR(10),
utin_pay_tax_amt                                        VARCHAR(30),
utin_pay_cgst_amt                                       VARCHAR(30),
utin_pay_sgst_amt                                       VARCHAR(30),
utin_pay_igst_amt                                       VARCHAR(30),
utin_pay_mkg_cgst_amt                                   VARCHAR(30),
utin_pay_mkg_sgst_amt                                   VARCHAR(30),
utin_pay_mkg_igst_amt                                   VARCHAR(30)," .
//        
// ALL TAX AMT - HALLMARK CHARGES COLUMNS @PRIYANKA-26MAY2022        
        "utin_pay_hallmark_cgst_chrg                            VARCHAR(10),
utin_pay_hallmark_sgst_chrg                             VARCHAR(10),
utin_pay_hallmark_igst_chrg                             VARCHAR(10),
utin_pay_hallmark_cgst_amt                              VARCHAR(30),
utin_pay_hallmark_sgst_amt                              VARCHAR(30),
utin_pay_hallmark_igst_amt                              VARCHAR(30)," .
// 
// TAXABLE AMT - HALLMARK CHARGES COLUMNS @PRIYANKA-26MAY2022        
        "utin_pay_hallmark_cgst_tot_amt                         VARCHAR(30),
utin_pay_hallmark_sgst_tot_amt                          VARCHAR(30),
utin_pay_hallmark_igst_tot_amt                          VARCHAR(30),
utin_cess_amt                                           VARCHAR(30)," .
// 
// Taxable amounts columns
        "utin_pay_tax_tot_amt                                   VARCHAR(30),
utin_pay_cgst_tot_amt                                   VARCHAR(30),
utin_pay_sgst_tot_amt                                   VARCHAR(30),
utin_pay_igst_tot_amt                                   VARCHAR(30),
utin_pay_mkg_cgst_tot_amt                               VARCHAR(30),
utin_pay_mkg_sgst_tot_amt                               VARCHAR(30),
utin_pay_mkg_igst_tot_amt                               VARCHAR(30),
utin_tot_payable_amt                                    VARCHAR(30)," .
// 
// Tax Amounts Checks
        "utin_pay_cgst_chk                                      VARCHAR(15),
utin_pay_sgst_chk                                       VARCHAR(15),
utin_pay_igst_chk                                       VARCHAR(15),
utin_pay_tax_chk                                        VARCHAR(15),
utin_pay_mkg_tax_chk                                    VARCHAR(15),
utin_paytm_pay_chk                                      VARCHAR(15)," . // ADDED PAY WITH PAYMENT COL @SIMRAN:29NOV2023
// 
// TAX APPLY ON HALLMARK CHARGES CHECK @PRIYANKA-26MAY2022        
        "utin_pay_hallmark_tax_chk                              VARCHAR(15),
utin_pay_tax_by_val_chk                                 VARCHAR(15),
utin_metal_exchange_chk                                 VARCHAR(15)," .
// 
// Currency Change Check @PRIYANKA-01AUG19       
        "utin_currency_change_chk                               VARCHAR(15)," .
// 
// Tax Apply on Total Amount Check @PRIYANKA-03-JAN-18
        "utin_pay_tax_on_total_amt_chk                          VARCHAR(15)," .
// 
// 
// Unregistered Purchase Check @PRIYANKA-07JULY2022      
        "utin_unregistered_purchase_tax_chk                     VARCHAR(15)," .
// 
// Tax Amounts Account Id
        "utin_pay_cgst_acc_id                                   VARCHAR(10),
utin_pay_sgst_acc_id                                    VARCHAR(10),
utin_pay_igst_acc_id                                    VARCHAR(10),
utin_pay_mkg_cgst_acc_id                                VARCHAR(10),
utin_pay_mkg_sgst_acc_id                                VARCHAR(10),
utin_pay_mkg_igst_acc_id                                VARCHAR(10)," .
// 
// FOR HALLMARK TAX AMT ACCOUNT ID @PRIYANKA-26MAY2022     
        "utin_pay_hallmark_cgst_acc_id                          VARCHAR(10),
utin_pay_hallmark_sgst_acc_id                           VARCHAR(10),
utin_pay_hallmark_igst_acc_id                           VARCHAR(10)," .
// 
// Payment other info        
        "utin_paym_oth_info                                     VARCHAR(200)," .
// 
// Invoice other info        
        "utin_other_info                                        VARCHAR(200)," .
// 
// MAIN INVOICE NUMBER @SIMRAN:05JUN2023
        "utin_main_inv_no                                       VARCHAR(50),".
        // SALES PERSON NAME
"utin_sales_person_name      VARCHAR(50),".
// 
// Invoice Date       
        "utin_date                                              VARCHAR(40)," .
        "utin_financial_year                                    VARCHAR(8)," .
        "utin_other_lang_date                                   VARCHAR(40)," . // ADDED TO STORE OTHER LANGUAGE DATE @AUTHOR:MADHUREE-07DEC2021
        "utin_end_date                                          VARCHAR(40)," .
        "utin_other_lang_end_date                               VARCHAR(80)," . // ADDED TO STORE OTHER LANGUAGE END DATE @AUTHOR:MADHUREE-27DEC2021
        "utin_since                                             DATETIME," .
// Total paid raw metal amount.
        "utin_tot_amt_rec                                       VARCHAR(30)," .
// Invoice journal id's
        "utin_jrnl_id                                           INT,
utin_tax_jrnl_id                                        INT," .
// Cr & Dr Type
        "utin_CRDR                                              VARCHAR(10),
utin_gd_CRDR                                            VARCHAR(5),
utin_sl_CRDR                                            VARCHAR(5),
utin_st_CRDR                                            VARCHAR(5),
utin_pt_CRDR                                            VARCHAR(5),
utin_cash_CRDR                                          VARCHAR(5)," .
// Rate Cut Metal Profit & Loss 
        "utin_gd_PNL_amt                                        VARCHAR(30),
utin_sl_PNL_amt                                         VARCHAR(30),
utin_st_PNL_amt                                         VARCHAR(30),
utin_pt_PNL_amt                                         VARCHAR(30)," .
// Separate gold & silver amounts.       
        "utin_gold_amt                                          VARCHAR(30),
utin_silver_amt                                         VARCHAR(30),
utin_platinum_amt                                         VARCHAR(30)," .
// Separate Purchase gold, silver and stock & inventory amounts      
        "utin_gd_pur_amt                                        VARCHAR(30),
utin_sl_pur_amt                                         VARCHAR(30),
utin_st_pur_amt                                         VARCHAR(30),
utin_pt_pur_amt                                         VARCHAR(30),
utin_stock_pur_amt                                      VARCHAR(30)," .
// Purchase Lab / Other Charges @Author:PRIYANKA-11AUG2020   
        "utin_pur_lab_chrgs                                     VARCHAR(20),    
utin_pur_other_chrgs                                    VARCHAR(20)," .
// Separate gold & silver previous invoice amounts       
        "utin_prev_gd_amt                                       VARCHAR(30),
utin_prev_sl_amt                                        VARCHAR(30),
utin_prev_st_amt                                        VARCHAR(30),
utin_prev_pt_amt                                        VARCHAR(30)," .
// Previous invoices amount 
        "utin_prev_cash_bal                                     VARCHAR(30)," .
// Total amt deposited @Author:PRIYANKA-03-07-17
        "utin_total_amt_deposit                                 VARCHAR(30)," .
// Final due amount & round off amount.     
        "utin_round_off_amt                                     VARCHAR(5),
utin_cash_balance                                       VARCHAR(30)," .
// AMOUNT LEFT @Author:PRIYANKA-03JAN18     
        "utin_left_amount                                       VARCHAR(30)," .
// Amount Settled Invoice Id
        "utin_amt_settled_inv_id                                INT," .
// Amount Payment Check
        "utin_amt_pay_chk                                       VARCHAR(10)," .
// Optional - status of invoice
        "utin_status                                            VARCHAR(16)," .
// Other charges by weight or by cash
        "utin_othr_chgs_by                                      VARCHAR(10)," .
// Invoice pending payment settlement check
        "utin_pay_opt                                           VARCHAR(30)," .
// Invoice payment mode
        "utin_payment_mode                                      VARCHAR(10)," .
// Staff Id
        "utin_staff_id                                          VARCHAR(16)," .
// New 3 Columns Added by Author:PRIYANKA-19JUN17        
        "utin_comm                                              VARCHAR(300),
utin_due_date                                           VARCHAR(80)," .
        "utin_other_lang_due_date                               VARCHAR(80)," . // ADDED TO STORE OTHER LANGUAGE DUE DATE @AUTHOR:MADHUREE-27DEC2021
        "utin_history                                           VARCHAR(300)," .
// New 2 Columns
// utin_scheme_name for scheme name
// utin_group_name for scheme GROUP name 
// utin_metal_type for scheme METAL TYPE 
// utin_gift_item for scheme GIFT ITEM         
        "utin_scheme_name                                       VARCHAR(30),
utin_group_name                                         VARCHAR(30),
utin_metal_type                                         VARCHAR(30),
utin_gift_item                                          VARCHAR(30)," .
// New 5 Columns Added by Author:PRIYANKA-21JUN17      
        "utin_ROI                                               VARCHAR(30),
utin_int_per                                            VARCHAR(30),
utin_int_amt                                            VARCHAR(30),
utin_EMI_days                                           VARCHAR(30)," .
// utin_EMI_period_type column added for store EMI duration (Monthly,days) @RATNAKAR 16FEB2018
        "utin_EMI_period_type                                   VARCHAR(30),
utin_EMI_occurrences                                    VARCHAR(30),
utin_EMI_status                                         VARCHAR(50),
utin_EMI_opt                                            VARCHAR(30)," .
// New 3 Columns Added by Author:PRIYANKA-29JUN17     
        "utin_EMI_amt                                           VARCHAR(30),
utin_EMI_int_amt                                        VARCHAR(30),
utin_EMI_total_amt                                      VARCHAR(30)," .
// New 3 Columns Added by Author:PRIYANKA-01JULY17     
        "utin_EMI_no                                            VARCHAR(30),             
utin_EMI_start_DOB                                      VARCHAR(36),
utin_EMI_end_DOB                                        VARCHAR(36)," .
// New 2 Columns Added by Author:PRIYANKA-07JULY17   
        "utin_EMI_paid_date                                     VARCHAR(50),
utin_paid_amt                                           VARCHAR(50)," .
// CRDR COLUMNS FOR PREVIOUS PAID METAL & CASH
        "utin_prev_gd_CRDR                                      VARCHAR(5),
utin_prev_sl_CRDR                                       VARCHAR(5),
utin_prev_st_CRDR                                       VARCHAR(5),
utin_prev_pt_CRDR                                       VARCHAR(5),
utin_prev_amt_CRDR                                      VARCHAR(5)," .
// PREVIOUS PAID WEIGHT COLUMNS
        "utin_gs_prev_wt                                        VARCHAR(15),
utin_gd_prev_wt_typ                                     VARCHAR(10),
utin_sl_prev_wt                                         VARCHAR(15),
utin_sl_prev_wt_typ                                     VARCHAR(10),
utin_pt_prev_wt                                         VARCHAR(15),
utin_pt_prev_wt_typ                                     VARCHAR(10),
utin_st_prev_wt                                         VARCHAR(15),
utin_st_prev_wt_typ                                     VARCHAR(10)," .
// LOALITY POINTS
        "utin_lp_open                                           VARCHAR(15),
utin_lp_gain                                            VARCHAR(15),
utin_lp_metal_wt                                        VARCHAR(15),
utin_lp_metal_wt_type                                   VARCHAR(15),
utin_lp_gift_type                                       VARCHAR(15),
utin_lp_gift_wt                                         VARCHAR(15),
utin_lp_gift_wt_type                                    VARCHAR(15),
utin_lp_redeem                                          VARCHAR(15),
utin_lp_close                                           VARCHAR(15),
utin_lp_cash                                            VARCHAR(15),
utin_lp_value                                           VARCHAR(15),
utin_lp_amount                                          VARCHAR(15)," .
// CASH TO METAL FUNCTIONALITY COLUMNS @Author:PRIYANKA-07APR18         
        "utin_gd_prev_cash_opening                              VARCHAR(10),
utin_gd_prev_cash_opening_CRDR                          VARCHAR(10),
utin_gd_cash_to_metal                                   VARCHAR(10),
utin_gd_prev_cash_balance                               VARCHAR(10),
utin_gd_prev_cash_bal_CRDR                              VARCHAR(10),
utin_gd_cash_metal_rate                                 VARCHAR(10),
utin_gd_cash_metal_purity                               VARCHAR(10),
utin_gd_cash_to_metalwt                                 VARCHAR(10),
utin_gd_cash_to_metalwt_CRDR                            VARCHAR(10)," .
// CASH TO METAL FUNCTIONALITY COLUMNS @Author:PRIYANKA-08APR18  
        "utin_gd_cash_metal_rec_paid                            VARCHAR(10),
utin_gd_prev_cash_metal_rec_paid                        VARCHAR(10),
utin_gd_prev_cash_metal_rec_paid_CRDR                   VARCHAR(10),
utin_gd_cash_metal_rec_paid_rate                        VARCHAR(10),
utin_gd_cash_metal_rec_paid_purity                      VARCHAR(10),
utin_gd_cash_metal_rec_paid_wt                          VARCHAR(10),
utin_gd_cash_metal_rec_paid_wt_CRDR                     VARCHAR(10)," .
// CASH TO METAL FUNCTIONALITY COLUMNS @Author:PRIYANKA-07APR18         
        "utin_sl_prev_cash_opening                              VARCHAR(10),
utin_sl_prev_cash_opening_CRDR                          VARCHAR(10),
utin_sl_cash_to_metal                                   VARCHAR(10),
utin_sl_prev_cash_balance                               VARCHAR(10),
utin_sl_prev_cash_bal_CRDR                              VARCHAR(10),
utin_sl_cash_metal_rate                                 VARCHAR(10),
utin_sl_cash_metal_purity                               VARCHAR(10),
utin_sl_cash_to_metalwt                                 VARCHAR(10),
utin_sl_cash_to_metalwt_CRDR                            VARCHAR(10)," .
// CASH TO METAL FUNCTIONALITY COLUMNS @Author:PRIYANKA-08APR18  
        "utin_sl_cash_metal_rec_paid                            VARCHAR(10),
utin_sl_prev_cash_metal_rec_paid                        VARCHAR(10),
utin_sl_prev_cash_metal_rec_paid_CRDR                   VARCHAR(10),
utin_sl_cash_metal_rec_paid_rate                        VARCHAR(10),
utin_sl_cash_metal_rec_paid_purity                      VARCHAR(10),
utin_sl_cash_metal_rec_paid_wt                          VARCHAR(10),
utin_sl_cash_metal_rec_paid_wt_CRDR                     VARCHAR(10)," .
// CASH TO METAL FUNCTIONALITY COLUMNS @Author:darshana        
        "utin_st_prev_cash_opening                              VARCHAR(10),
utin_st_prev_cash_opening_CRDR                          VARCHAR(10),
utin_st_cash_to_metal                                   VARCHAR(10),
utin_st_prev_cash_balance                               VARCHAR(10),
utin_st_prev_cash_bal_CRDR                              VARCHAR(10),
utin_st_cash_metal_rate                                 VARCHAR(10),
utin_st_cash_metal_purity                               VARCHAR(10),
utin_st_cash_to_metalwt                                 VARCHAR(10),
utin_st_cash_to_metalwt_CRDR                            VARCHAR(10)," .
// CASH TO METAL FUNCTIONALITY COLUMNS @Author:darshana  
        "utin_st_cash_metal_rec_paid                            VARCHAR(10),
utin_st_prev_cash_metal_rec_paid                        VARCHAR(10),
utin_st_prev_cash_metal_rec_paid_CRDR                   VARCHAR(10),
utin_st_cash_metal_rec_paid_rate                        VARCHAR(10),
utin_st_cash_metal_rec_paid_purity                      VARCHAR(10),
utin_st_cash_metal_rec_paid_wt                          VARCHAR(10),
utin_st_cash_metal_rec_paid_wt_CRDR                     VARCHAR(10)," .
//
// CASH TO METAL FUNCTIONALITY COLUMNS @Author:PRIYANKA-07APR18         
"utin_pt_prev_cash_opening                              VARCHAR(10),
utin_pt_prev_cash_opening_CRDR                          VARCHAR(10),
utin_pt_cash_to_metal                                   VARCHAR(10),
utin_pt_prev_cash_balance                               VARCHAR(10),
utin_pt_prev_cash_bal_CRDR                              VARCHAR(10),
utin_pt_cash_metal_rate                                 VARCHAR(10),
utin_pt_cash_metal_purity                               VARCHAR(10),
utin_pt_cash_to_metalwt                                 VARCHAR(10),
utin_pt_cash_to_metalwt_CRDR                            VARCHAR(10)," .
// CASH TO METAL FUNCTIONALITY COLUMNS @Author:PRIYANKA-08APR18  
        "utin_pt_cash_metal_rec_paid                            VARCHAR(10),
utin_pt_prev_cash_metal_rec_paid                        VARCHAR(10),
utin_pt_prev_cash_metal_rec_paid_CRDR                   VARCHAR(10),
utin_pt_cash_metal_rec_paid_rate                        VARCHAR(10),
utin_pt_cash_metal_rec_paid_purity                      VARCHAR(10),
utin_discount_coupon                                    VARCHAR(16),
utin_pt_cash_metal_rec_paid_wt                          VARCHAR(10),
utin_pt_cash_metal_rec_paid_wt_CRDR                     VARCHAR(10)," .
//        
// ADDED utin_upd_process column to check procssed udhaar and advance money entry
// For new entries from 25 FEB 2018 - 'utin_inv_disc_option' store 'discUp' for old payment panel
// now this utin_inv_disc_option value is null but in future utin_inv_disc_option value will be
// 'discDown' and we will provide customer to choose payment panel option        
        "utin_upd_process                                       VARCHAR(10), 
utin_inv_disc_option                                    VARCHAR(10)," .
//        
// BELOW COLUMNS ADDED FOR UDHAAR INTEREST AMOUNT @AUHTOR:DEEPAK21DEC19
"utin_udhaar_int_amt                                    VARCHAR(50),
 utin_udhaar_main_int_amt                               VARCHAR(50),
utin_udhaar_roi                                         FLOAT,
utin_udhaar_int_type                                    VARCHAR(15),
utin_udhaar_int_chk                                     VARCHAR(10),
utin_gold_item_pur_value                                VARCHAR(10),
utin_silver_item_pur_value                              VARCHAR(16),
utin_stone_item_pur_value                               VARCHAR(16)," .
// COLUMN ADDED TO STORE INSURANCE OPTION CHECKED OR NOT @AUTHOR:SHRI08SEP20
        "utin_pay_jew_insurance_chk                             VARCHAR(20)," .
        "utin_reverse_cal_by                                    VARCHAR(10)," . //COLUMN ADDED TO STORE REVERSE CALCULATION BY VALUE @AUTHOR:MADHUREE-16JULY2021
        "utin_amt_return_status                                 VARCHAR(10)," . //COLUMN ADDED TO STORE AMOUNT RETURN STATUS @AUTHOR:MADHUREE-10FEB2022
        "utin_notification_count                                VARCHAR(10)," . //COLUMN ADDED TO STORE NOTIFICATION COUNT @AUTHOR:CHETAN-24MAR2022
        "utin_notification_sent_date                            VARCHAR(0)," . //COLUMN ADDED TO STORE NOTIFICATION SENT DATE @AUTHOR:CHETAN-24MAR2022
        "utin_display_counter                                   INT        ," .
//
        "utin_eway_bill_transid                                 VARCHAR(15)," . //COLUMN ADDED TO STORE  E-WAY BILL FORM DETAILS @AUTHOR: RENUKA-AUG2022
        "utin_eway_bill_transname                               VARCHAR(100)," . //COLUMN ADDED TO STORE  E-WAY BILL FORM DETAILS @AUTHOR: RENUKA-AUG2022 
        "utin_eway_bill_distance                                VARCHAR(4)," . //COLUMN ADDED TO STORE E-WAY BILL FORM DETAILS @AUTHOR: RENUKA-AUG2022
        "utin_eway_bill_transdocno                              VARCHAR(15)," . //COLUMN ADDED TO STORE E-WAY BILL FORM DETAILS @AUTHOR: RENUKA-AUG2022
        "utin_eway_bill_transdocDt                              VARCHAR(50)," . //COLUMN ADDED TO STORE E-WAY BILL FORM DETAILS @AUTHOR: RENUKA-AUG2022
        "utin_eway_bill_vehno                                   VARCHAR(20)," . //COLUMN ADDED TO STORE  E-WAY BILL FORM DETAILS @AUTHOR: RENUKA-AUG2022
        "utin_eway_bill_vehtype                                 VARCHAR(1)," . //COLUMN ADDED TO STORE  E-WAY BILL FORM DETAILS @AUTHOR: RENUKA-AUG2022
        "utin_eway_bill_transMode                               VARCHAR(1)," . //COLUMN ADDED TO STORE  E-WAY BILL FORM DETAILS @AUTHOR: RENUKA-AUG2022
//        
        "utin_einvoice_ack_no                                   VARCHAR(25)," . //COLUMN ADDED TO STORE EINVOICE  DETAILS @AUTHOR: RENUKA-JULY2022
        "utin_einvoice_ack_date                                 VARCHAR(20)," . //COLUMN ADDED TO STORE EINVOICE  DETAILS @AUTHOR: RENUKA-JULY2022
        "utin_einvoice_irn_no                                   VARCHAR(100)," . //COLUMN ADDED TO STORE EINVOICE DETAILS @AUTHOR: RENUKA-JULY2022
        "utin_einvoice_signed_inv                               VARCHAR(500)," . //COLUMN ADDED TO STORE EINVOICE DETAILS @AUTHOR: RENUKA-JULY2022
        "utin_einvoice_signed_qrcode                            VARCHAR(500)," . //COLUMN ADDED TO STORE EINVOICE DETAILS @AUTHOR: RENUKA-JULY2022
        "utin_eway_bill_no                                      VARCHAR(25)," . //COLUMN ADDED TO STORE E-WAY BILL DETAILS @AUTHOR: RENUKA-JULY2022
        "utin_eway_bill_date                                    VARCHAR(20)," . //COLUMN ADDED TO STORE E-WAY BILL DETAILS @AUTHOR: RENUKA-JULY2022
        "utin_eway_bill_validity                                VARCHAR(25)," . //COLUMN ADDED TO STORE E-WAY BILL DETAILS @AUTHOR: RENUKA-JULY2022
        "utin_request_id                                        VARCHAR(50)," . //COLUMN ADDED TO STORE E-WAY BILL DETAILS @AUTHOR: RENUKA-JULY2022
        "utin_razorpay_payment_id                               VARCHAR(20)," . //COLUMN ADDED TO STORE ECOM RAZORPAY PAYMENT ID @AUTHOR:MADHUREE-06AUGUST2022
        "utin_razorpay_order_id                                 VARCHAR(25)," . //COLUMN ADDED TO STORE ECOM RAZORPAY ORDER ID @AUTHOR:MADHUREE-06AUGUST2022
        "utin_razorpay_signature                                VARCHAR(50)," . //COLUMN ADDED TO STORE ECOM RAZORPAY SIGNATURE @AUTHOR:MADHUREE-06AUGUST2022
        "utin_tally_voucher_no                                  VARCHAR(10)," .
        "utin_late_pay_wstg_date                                VARCHAR(12)," .//COLUMN ADDED TO STORE LATE PAYMENT DUE DATE @AUTHOR:RENUKA_SHARMA-06FEB2023
        "utin_scheme_deposit                                    VARCHAR(20),". //COLUMN ADDED TO STORE SCHEME DEPOSIT BY CHETAN@14JUN2023
        "utin_scheme_bonus_amt                                  VARCHAR(20),". //COLUMN ADDED TO STORE SCHEME DEPOSIT BY CHETAN@19JUN2023
        "utin_scheme_bonus_gold                                 VARCHAR(20),". //COLUMN ADDED TO STORE SCHEME DEPOSIT BY CHETAN@20JUN2023
        "utin_scheme_bonus_silver                               VARCHAR(20),". //COLUMN ADDED TO STORE SCHEME DEPOSIT BY CHETAN@20JUN2023
        "utin_email_sent_status                                 VARCHAR(2)," .
        "utin_scheme_gold_valuation                             VARCHAR(20),".
        "utin_scheme_mkg_disc_per                               VARCHAR(10),".
        "utin_kitty_id                                          VARCHAR(16),".
        // 
        "utin_paytm_order_id                                    VARCHAR(50)," .
        "utin_paytm_pay_amt                                     VARCHAR(30)," .
        "utin_paytm_card_no                                     VARCHAR(20),".
        "utin_paytm_bank_name                                   VARCHAR(50),".
        "utin_paytm_bank_mid                                    VARCHAR(20)," .
        "utin_paytm_bank_tid                                    VARCHAR(20),".
        "utin_paytm_aid                                         VARCHAR(40),".
        "utin_paytm_pay_method                                  VARCHAR(20)," .
        "utin_paytm_pay_card_type                               VARCHAR(30),".
        "utin_paytm_pay_card_scheme                             VARCHAR(30),".
        "utin_paytm_prod_code                                   VARCHAR(40),".
        "utin_paytm_values                                      VARCHAR(2056),".
        //
        "utin_advance_rate                                      VARCHAR(8),".//added get rate when deposite advance money PRATHAMESH
        "utin_advance_wt                                        VARCHAR(8),".//added get rate when deposite advance money PRATHAMESH 
        "utin_panel_name                                        VARCHAR(16),".//added for differenciate payments PRATHAMESH 
        "utin_gd_total_mkg                                      VARCHAR(16),".
        "utin_sl_total_mkg                                      VARCHAR(16),".
        "utin_pl_total_mkg                                      VARCHAR(16),".
        "utin_gd_value_added                                    VARCHAR(16),".
        "utin_sl_value_added                                    VARCHAR(16),".
        "utin_counter_name                                      VARCHAR(32),".
        "utin_amt_settled_date                                  VARCHAR(16)," .
        "utin_system_type                                       VARCHAR(16),".//added for diff. entries from device Prathamesh
        "utin_metal_purity                                      VARCHAR(100),".
        "utin_order_status                                      VARCHAR(25),".//added for diff. entries from device Prathamesh
        "utin_order_status_history                            VARCHAR(255),".//added for diff. entries from device Prathamesh
        "utin_order_date_history                              VARCHAR(255),".//added for diff. entries from device Prathamesh
        "utin_omecom_prod_type                                VARCHAR(25),".
        "utin_ship_order_id                                   VARCHAR(25),".
         // Raw Metal val by Column @Author:JAY-27FEB25
        "utin_raw_met_val_by				        VARCHAR(16),".
        "utin_last_column                                       VARCHAR(16))";
//
if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
} 
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>