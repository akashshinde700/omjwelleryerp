<?php

/*
 * **************************************************************************************
 * @tutorial: 
 * **************************************************************************************
 * 
 * Created on 7 Aug, 2017 5:50:20 PM
 *
 * @FileName: omstoctransdel.php
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

// Create new table stock transaction @PRIYANKA-29-05-17
$query = "CREATE TABLE IF NOT EXISTS stock_transaction_del (
sttr_id                                                         INT NOT NULL," .
// For Main Entry Reference Id
"sttr_sttr_id                                                   VARCHAR(16),
sttr_st_id                                                      VARCHAR(16),
sttr_sttrin_id                                                  VARCHAR(16),
sttr_trans_id                                                   VARCHAR(20),
sttr_transaction_id                                             VARCHAR(20),
sttr_main_entry                                                 VARCHAR(2),
sttr_main_entry_count                                           VARCHAR(3),
sttr_sub_entry_count                                            VARCHAR(3),
sttr_panel_name                                                 VARCHAR(64)," .
// SHOPIFY PROD ID @PRIYANKA-27MAR19
"sttr_shopify_prod_id                                           VARCHAR(60),
sttr_owner_id                                                   VARCHAR(16),
sttr_jrnl_id                                                    INT,
sttr_firm_id                                                    VARCHAR(16),
sttr_melt_id                                                    VARCHAR(16),
sttr_user_id                                                    VARCHAR(16),
sttr_user_billing_name                                          VARCHAR(75),". // ADDED TO STORE USER BILLING NAME
"sttr_account_id                                                 VARCHAR(10),
sttr_stock_account_id                                           VARCHAR(10),
sttr_utin_id 							VARCHAR(16),
sttr_staff_id 							VARCHAR(16),
sttr_staff_sale_month						VARCHAR(6),
sttr_transaction_type                                           VARCHAR(20),
sttr_item_pre_id 						VARCHAR(20),
sttr_item_id 							VARCHAR(16)," .
// Barcode Related Fields        
"sttr_metal_type 						VARCHAR(30),
sttr_product_type                                               VARCHAR(30),
sttr_add_on_weight_product_type                                 VARCHAR(35),
sttr_stock_type                                                 VARCHAR(16),
sttr_item_category 						VARCHAR(80),
sttr_item_name 							VARCHAR(80)," .
//column added sttr_item_name_online to add product name for online option,@AUTHOR:HEMA-1DEC2020 
"sttr_item_name_online                                          VARCHAR(80),
sttr_rfid_no                                                    VARCHAR(64),
sttr_rfid_tally_profile                                         VARCHAR(24),
sttr_rfid_tally_status                                          VARCHAR(2),
sttr_rfid_tally_date                                            VARCHAR(20),
sttr_rfid_tally_time                                            VARCHAR(20),
sttr_location                                                   VARCHAR(64),
sttr_barcode_prefix 						VARCHAR(4),
sttr_barcode 							VARCHAR(64),
sttr_add_barcode_date                                           VARCHAR(24)," .
// Item Combind Code        
"sttr_item_code                                                 VARCHAR(30)," .
// Item Description (Indicator) like Stock, Crystal, Imitation
"sttr_indicator                                                 VARCHAR(30)," .
// Supplier Name reference with Id
"sttr_brand_id 							VARCHAR(16),
sttr_brand_name 					        VARCHAR(32)," .
// Counter Name @PRIYANKA-16OCT18
"sttr_counter_name 						VARCHAR(30)," .
// Barcode Related Fields        
"sttr_bis_mark 							VARCHAR(10)," .
// STOCK HALLMARK UID @AUTHOR:MADHUREE-28JUNE2021     
"sttr_hallmark_uid 						VARCHAR(32),
sttr_image_id 							VARCHAR(10)," .
// Date Fields       
"sttr_add_date 							VARCHAR(32),
 sttr_other_lang_add_date 					VARCHAR(32),
sttr_bill_date 							VARCHAR(32),
sttr_delivery_date 						VARCHAR(32),
sttr_mfg_date 							VARCHAR(32),
sttr_exp_date 							VARCHAR(32),
sttr_tally_date 						VARCHAR(32),
sttr_del_date 						        VARCHAR(50),
sttr_del_reason                                                 VARCHAR(100),
sttr_del_log                                                    VARCHAR(80)," .
/* START CODE TO ADD NEW COLUMN FOR sttr_tally_status CHECKING TALLY STATUS @AUTHOR:MADHUREE-25FEB2020 */
"sttr_tally_status                                              VARCHAR(32),
sttr_tally_quantity 	                                        VARCHAR(20)," .
/* END CODE TO ADD NEW COLUMN FOR sttr_tally_status CHECKING TALLY STATUS @AUTHOR:MADHUREE-25FEB2020 */
// Prod HSN number
"sttr_hsn_no                                                    VARCHAR(25)," .
// Prod Category, Name and Other Fields        
"sttr_gender 							VARCHAR(15),
sttr_size 							VARCHAR(15),
sttr_shape 							VARCHAR(15),
sttr_color 							VARCHAR(15),
sttr_quantity 							INT,
sttr_clarity 							VARCHAR(10),
sttr_metal_rate 						VARCHAR(10),
sttr_metal_rate_id 						VARCHAR(10),
sttr_product_purchase_rate                                      VARCHAR(10),
sttr_product_purchase_rate_type                                 VARCHAR(10),
sttr_purity 							VARCHAR(15),".
// sttr_purity_ct ADDED FOR PURITY IN CARAT @AUTHOR:MADHUREE-04MAR2020
"sttr_purity_ct                                                 VARCHAR(15),
sttr_wastage 							VARCHAR(10),
sttr_final_purity 						VARCHAR(16),
sttr_cust_wastage						VARCHAR(10),
sttr_cust_wastage_wt						VARCHAR(10)," .
// Weight Related  
//sttr_pkt_weight - Used this for stock less weight
//sttr_less_weight - Used this for stock pkt weight
"sttr_gs_weight 					        VARCHAR(15),
sttr_gs_weight_type                                             VARCHAR(10),
sttr_pkt_weight 						VARCHAR(15),
sttr_pkt_weight_type                                            VARCHAR(10),
sttr_less_weight 						VARCHAR(15),
sttr_less_weight_type                                           VARCHAR(10),
sttr_stone_less_weight 						VARCHAR(15),
sttr_nt_weight 							VARCHAR(15),
sttr_nt_weight_type                                             VARCHAR(10),
sttr_add_weight 						VARCHAR(15),
sttr_add_weight_type                                            VARCHAR(10),
sttr_avg_weight 						VARCHAR(15),
sttr_avg_weight_type                                            VARCHAR(10),
sttr_fine_weight						VARCHAR(15),
sttr_final_fine_weight 						VARCHAR(10),
sttr_final_fine_wt_by                                           VARCHAR(10)," .
// FINAL FINE WEIGHT BY @AUTHOR:MADHUREE-15DEC2020
"sttr_sell_final_fine_weight 				        VARCHAR(10),
sttr_add_on_weight 					        VARCHAR(15),
sttr_add_on_weight_type                                         VARCHAR(10)," .
// Charges
"sttr_lab_charges 						VARCHAR(15),
sttr_lab_charges_type                                           VARCHAR(10),
sttr_total_lab_charges                                          VARCHAR(15),
sttr_making_charges 						VARCHAR(15),
sttr_total_making_charges					VARCHAR(15),
sttr_making_charges_type                                        VARCHAR(10)," .
// Other Charges @Author:PRIYANKA-12OCT2018
"sttr_other_charges 						VARCHAR(15),
sttr_other_charges_type                                         VARCHAR(10),
sttr_total_other_charges					VARCHAR(15),".
// PURCHASE LAB CHARGES AND OTHER CHARGES IN STOCK TRANSACTION TABLE @AUTHOR-PRIYANKA-11AUG20
"sttr_pur_lab_chrgs                                             VARCHAR(20),
sttr_pur_other_chrgs                                            VARCHAR(20),
sttr_repair_charges         					VARCHAR(16),
sttr_tax         						VARCHAR(16),
sttr_total_hallmark_charges         				VARCHAR(20),
sttr_other_tax_amt         				        VARCHAR(16),
sttr_tot_tax 							VARCHAR(16)," .
// Stone Wt & Type
"sttr_stone_wt                                                  VARCHAR(15),
sttr_stone_wt_type                                              VARCHAR(10)," .
// Valuation @Author:AMOL
"sttr_final_taxable_amt                                         VARCHAR(30),
sttr_valuation                                                  VARCHAR(30),
sttr_total_price                                                VARCHAR(30),
sttr_tot_val_wo_gst                                             VARCHAR(30),
sttr_stone_valuation                                            VARCHAR(30),
sttr_final_sell_valuation                                       VARCHAR(30),
sttr_final_valuation                                            VARCHAR(30),
sttr_ecom_price                                                VARCHAR(30),
sttr_ecom_max_price                                            VARCHAR(30), 
sttr_ecom_metal_valuation                                      VARCHAR(30),
sttr_ecom_making_charges                                       VARCHAR(30),
sttr_ecom_other_charges                                        VARCHAR(30),
sttr_ecom_value_added                                          VARCHAR(30)," .
// Box Code and Price @Author:PRIYANKA-29JULY19
"sttr_box_code                                                  VARCHAR(50),
sttr_box_valuation                                              VARCHAR(30),
sttr_payment_mode                                               VARCHAR(30),
sttr_melt_valuation                                             VARCHAR(30)," .
// Status
"sttr_status 							VARCHAR(32),
sttr_current_status 						VARCHAR(30),
sttr_sell_status 						VARCHAR(10),
sttr_direct_sell_status 				        VARCHAR(10),
sttr_bc_print_status                                            VARCHAR(50),
sttr_ecomm_status                                               VARCHAR(32),
sttr_jewellers_app_status                                       VARCHAR(40),
sttr_mkg_cgst_per                                               VARCHAR(30),
sttr_mkg_cgst_chrg                                              VARCHAR(30),
sttr_mkg_sgst_per                                               VARCHAR(30),
sttr_mkg_sgst_chrg                                              VARCHAR(30),
sttr_mkg_igst_per                                               VARCHAR(30),
sttr_mkg_igst_chrg                                              VARCHAR(30),
sttr_tot_price_cgst_per                                         VARCHAR(30),
sttr_tot_price_cgst_chrg                                        VARCHAR(30),
sttr_tot_price_sgst_per                                         VARCHAR(30),
sttr_tot_price_sgst_chrg                                        VARCHAR(30),
sttr_tot_price_igst_per                                         VARCHAR(30),
sttr_tot_price_igst_chrg                                        VARCHAR(30),
sttr_other_cgst_per                                             VARCHAR(30),
sttr_other_cgst_chrg                                            VARCHAR(30),
sttr_other_sgst_per                                             VARCHAR(30),
sttr_other_sgst_chrg                                            VARCHAR(30),
sttr_other_igst_per                                             VARCHAR(30),
sttr_other_igst_chrg                                            VARCHAR(30)," .
// Retail/Wholesale
"sttr_stock_add                                                 VARCHAR(16),
sttr_item_ent_type 						VARCHAR(16)," .
// Description
"sttr_other_info 						VARCHAR(100),
sttr_item_other_info                                            VARCHAR(500),
sttr_item_melt_info                                             VARCHAR(100)," .
// Invoice Details
"sttr_pre_invoice_no                                            VARCHAR(20),
sttr_invoice_no 						VARCHAR(10)," .
// Crystal Rate       
"sttr_purchase_rate 						VARCHAR(15),
sttr_purchase_rate_type                                         VARCHAR(10),
sttr_sell_rate                                                  VARCHAR(15),
sttr_sell_rate_type                                             VARCHAR(10),
sttr_product_sell_rate                                          VARCHAR(15),
sttr_product_sell_rate_type                                     VARCHAR(10)," .
// Final QTY,GS WT, NT WT @Author:PRIYANKA-18DEC17   
"sttr_final_quantity 						VARCHAR(10),
sttr_final_gs_weight                                            VARCHAR(15),
sttr_final_nt_weight                                            VARCHAR(15), 
sttr_final_fn_weight                                            VARCHAR(15)," .
// Crystal Y/N
"sttr_crystal_yn 						VARCHAR(10)," .
// lab charges by
"sttr_other_charges_by                                          VARCHAR(10)," .
// Customer Wastage by WT @Author:PRIYANKA-07SEP2018
"sttr_cust_wastg_by                                             VARCHAR(20)," .
// WASTAGE CALCULATION BY @AUTHOR:MADHUREE-22SEP2021
"sttr_wastage_by                                                VARCHAR(20)," .
// VALUE ADDED AMOUNT BY @AUTHOR:MADHUREE-15DEC2020
"sttr_value_added_by                                            VARCHAR(20)," .
// Making charges by @Author:PRIYANKA-28MAR18
"sttr_mkg_charges_by                                            VARCHAR(16)," .
// Fine Weight and Final Fine Weight by Column @Author:PRIYANKA-07MAR19
"sttr_final_val_by 						VARCHAR(16)," .
// Final Valuation by Column @Author:PRIYANKA-07MAR19
"sttr_final_valuation_by                                        VARCHAR(16)," .
// LESS WT OR NOT @Author:PRIYANKA-07APR18
"sttr_main_gross_wt_by                                          VARCHAR(16)," .
// Stone WT Less From GS WT/NT WT
"sttr_stone_less_wt_by 						VARCHAR(16)," .
// Entry Date
"sttr_since 							DATETIME," .
// Comment Field
"sttr_comments 							VARCHAR(40)," .
// In case of Jewellery Sell @Author:PRIYANKA-15JUN17
"sttr_value_added                                               VARCHAR(30),
sttr_item_safe_tray                                             VARCHAR(40)," .
// Columns used in Imitation Panel
// Add New Column for Sell Price Code @Author-PRIYANKA-15JUNE2020
"sttr_cust_itmpricecode                                         VARCHAR(16),
sttr_cust_itmcalby                                              VARCHAR(16),
sttr_cust_itmcode                                               VARCHAR(16),
sttr_cust_itmnum                                                VARCHAR(16),
sttr_item_length                                                VARCHAR(16),
sttr_item_width                                                 VARCHAR(16),
sttr_item_model_no                                              VARCHAR(16),
sttr_item_sales_pkg                                             VARCHAR(16)," .
// Added new columns for OMRETAIL Software @Author-PRIYANKA-28JUNE2020      
"sttr_period                                                    VARCHAR(16),
sttr_period_type                                                VARCHAR(16),
sttr_price                                                      VARCHAR(16),
sttr_price_without_tax                                          VARCHAR(16),
sttr_cust_price                                                 VARCHAR(16),
sttr_unit_price                                                 VARCHAR(16),
sttr_unit_cust_price                                            VARCHAR(16),
sttr_taxincl_checked                                            VARCHAR(10),
sttr_total_cust_price                                           VARCHAR(16)," .
// Added new columns for discount separately apply on making charges, metal & stone @PRIYANKA-12APR18     
"sttr_metal_amt                                                 VARCHAR(10),
sttr_total_making_amt                                           VARCHAR(10),
sttr_total_lab_amt                                              VARCHAR(10),
sttr_total_other_amt                                            VARCHAR(10),
sttr_stone_amt                                                  VARCHAR(10),".
// Added new columns for PURCHASE GOLD, SILVER AND STOCK & INVENTORY AMOUNTS @PRIYANKA-22JULY2020 
"sttr_gd_pur_amt                                                VARCHAR(10),    
sttr_sl_pur_amt                                                 VARCHAR(10),
sttr_stock_pur_amt                                              VARCHAR(10),
sttr_mkg_discount_per                                           VARCHAR(10),
sttr_mkg_discount_type                                          VARCHAR(10),
sttr_mkg_discount_amt                                           VARCHAR(10),
sttr_other_discount_per                                         VARCHAR(10),
sttr_other_discount_type                                        VARCHAR(10),
sttr_other_discount_amt                                         VARCHAR(10),
sttr_lab_discount_per                                           VARCHAR(10),
sttr_lab_discount_type                                          VARCHAR(10),
sttr_lab_discount_amt                                           VARCHAR(10),
sttr_metal_discount_per                                         VARCHAR(10),
sttr_metal_discount_type                                        VARCHAR(10),
sttr_metal_discount_amt                                         VARCHAR(10),
sttr_stone_discount_per                                         VARCHAR(10),
sttr_stone_discount_type                                        VARCHAR(10),
sttr_stone_discount_amt                                         VARCHAR(10),".
// Columns Added For Set Product Discount @PRIYANKA-09NOV2020 
"sttr_disc_start_date                                           VARCHAR(32),
sttr_disc_end_date                                              VARCHAR(32),
sttr_disc_product_amount                                        VARCHAR(10),                                        
sttr_disc_making_discount                                       VARCHAR(10),
sttr_disc_stone_discount                                        VARCHAR(10),
sttr_disc_product_discount                                      VARCHAR(10),
sttr_disc_active                                                VARCHAR(10)," .
// Product purchase price in case of sell
"sttr_purchase_price                                            VARCHAR(30)," .
// Packet Weight Field
// START CODE TO ADD COLUMNS FOR PKT WEIGHT DESCRIPTION @AUTHOR:MADHUREE-07SEP2021
"sttr_pkt_desc1                                                 VARCHAR(30),
sttr_pkt_desc2 							VARCHAR(30),
sttr_pkt_desc3 							VARCHAR(30),
sttr_pkt_desc4 							VARCHAR(30),
sttr_pkt_desc5 							VARCHAR(30),".
// END CODE TO ADD COLUMNS FOR PKT WEIGHT DESCRIPTION @AUTHOR:MADHUREE-07SEP2021
"sttr_pkt_qty1 							INT,
sttr_pkt_qty2 							INT,
sttr_pkt_qty3 							INT,
sttr_pkt_qty4 							INT,
sttr_pkt_qty5 							INT,
sttr_pkt_weight1 						VARCHAR(15),
sttr_pkt_weight2 						VARCHAR(15),
sttr_pkt_weight3 						VARCHAR(15),
sttr_pkt_weight4 						VARCHAR(15),
sttr_pkt_weight5 						VARCHAR(15),
sttr_lab_chrg_type1 						VARCHAR(10),
sttr_lab_chrg_type2 						VARCHAR(10),
sttr_lab_chrg_type3 						VARCHAR(10),
sttr_lab_chrg_type4 						VARCHAR(10),
sttr_lab_chrg_type5 						VARCHAR(10),
sttr_lab_chrg_qty1 						INT,
sttr_lab_chrg_qty2 						INT,
sttr_lab_chrg_qty3 						INT,
sttr_lab_chrg_qty4 						INT,
sttr_lab_chrg_qty5 						INT,
sttr_lab_chrg_val1 						VARCHAR(15),
sttr_lab_chrg_val2 						VARCHAR(15),
sttr_lab_chrg_val3 						VARCHAR(15),
sttr_lab_chrg_val4 						VARCHAR(15),
sttr_lab_chrg_val5 						VARCHAR(15),
sttr_lab_chrg_tot1                                              VARCHAR(15),
sttr_lab_chrg_tot2 						VARCHAR(15),
sttr_lab_chrg_tot3 						VARCHAR(15),
sttr_lab_chrg_tot4 						VARCHAR(15),
sttr_lab_chrg_tot5 						VARCHAR(15),
sttr_wt_auto_less 						VARCHAR(50),
sttr_melting_status 						VARCHAR(3),
sttr_melting_date 						VARCHAR(32),
sttr_fixed_price_status 					VARCHAR(5),".
// 
// FOR ASSIGN ORDER @AUTHOR:PRIYANKA-14AUG2021        
"sttr_direct_assign_status                                      VARCHAR(30),
sttr_assign_status                                              VARCHAR(30),
sttr_assign_user_id                                             VARCHAR(16),
sttr_assign_pre_invoice_no                                      VARCHAR(20),
sttr_assign_invoice_no                                          VARCHAR(10),
sttr_assign_date 						VARCHAR(32)," .
// 
// FOR RETURN ORDER @AUTHOR:PRIYANKA-14AUG2021       
"sttr_return_status                                             VARCHAR(30),
sttr_return_user_id                                             VARCHAR(16),
sttr_return_pre_invoice_no                                      VARCHAR(20),
sttr_return_invoice_no                                          VARCHAR(10),
sttr_return_date 						VARCHAR(32),". 
//
// Column added for online options:HEMA-19NOV2019        
"sttr_online_option                                             VARCHAR(100),
sttr_online_qty                                                 INT,
sttr_omecom_status                                              VARCHAR(10),
sttr_online_desc                                                VARCHAR(300)," .
//
//added column for store history of transfered firm for stock transfer@AUTHOR:MADHUREE-25OCT2019
"sttr_stock_trans_history                                       VARCHAR(300),
sttr_stock_trans_type                                           VARCHAR(25),
sttr_stock_trans_prev_id                                        VARCHAR(300),".
//COLUMN ADDED FOR ECOM ORDER DELIVERY STATUS,ECOM ORDER FROM STATUS @AUTHOR:MADHUREE-06JAN2020
"sttr_delivery_status                                           VARCHAR(100),
sttr_order_from                                                 VARCHAR(50),".
//COLUMN ADDED FOR PACKING LIST REFERENCE NUMBER FOR IDENTIFYING LAST ADDED ELEMENT @AUTHOR:MADHUREE-06JAN2020
"sttr_packing_list_ref                                          VARCHAR(15),                                
sttr_trans_date                                                 VARCHAR(150)," .
//COLUMN ADDED FOR VALUATION OF PRODUST WITH GST AMOUNT BY TODAY RATE FOR ECOM,@AUTHOR:HEMA-10JUN2020
"sttr_today_valuation                                           VARCHAR(30),".
//COLUMN ADDED TO ADD PRODUCT VIEW COUNTER,@AUTHOR:HEMA-10JUN2020     
"sttr_view_counter                                              INT,".
//COLUMN ADDED TO ADD DIFFERECE IN WT BY SIZE,@AUTHOR:HEMA-6AUG2020
"sttr_Wt_diff_by_size                                           VARCHAR(15),".
//
// For Hall Marking Stock Return User Id and Status @AUTHOR:PRIYANKA-06SEP2021
"sttr_hallmark_user_id                                          VARCHAR(16),
sttr_hallmark_status                                            VARCHAR(32),".
//        
//JEWELLERY INSURANCE POLICY NUMBER - @AUTHOR:SHRI28AUG20
"sttr_insurance_policy_no                                       VARCHAR(200),".
//JEWELLERY INSURANCE CERTIFICATE PDF URL - @AUTHOR:SHRI28AUG20
"sttr_insurance_pdf_url                                         VARCHAR(200),".
//JEWELLERY INSURANCE API - @AUTHOR:SHRI01SEP20
"sttr_insurance_api                                             VARCHAR(20),".
//COLUMN ADDED TO ADD CERTIFICATE NUMBER : AUTHOR @DARSHANA 22 JUNE 2021
"sttr_certificate_no                                            VARCHAR(20),".
"sttr_omprocess_date                                            VARCHAR(12),".
"sttr_pay_cash_amt                                              VARCHAR(12)," .
"sttr_pay_online_amt                                            VARCHAR(12)," .
"sttr_pay_cheque_amt                                              VARCHAR(12)," .
"sttr_pay_card_amt                                              VARCHAR(12)," .
"sttr_product_details                                            VARCHAR(50),".
"sttr_previous_invoices                                         VARCHAR(128)," .
"sttr_other_charges_desc                                        VARCHAR(256)," .
"sttr_other_charges_amt                                         VARCHAR(256)," .
"sttr_dia_wt                                                    VARCHAR(16)," .
"sttr_tunch_code                                                VARCHAR(16)," .
"last_column                                                     VARCHAR(1))";

if (!mysqli_query($conn, $query)) {
   die('Error: ' . mysqli_error($conn));
}

//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>