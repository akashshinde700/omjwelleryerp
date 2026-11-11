<?php

/*
 * Created on Mar 13, 2011 6:53:20 PM
 *
 * @FileName: omtbgvtb.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: eMunim
 * @version 1.0
 * @Copyright (c) 2010 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2010 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE: Modified by @Author: KHUSH24JAN13
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php

$query = "CREATE TABLE IF NOT EXISTS girvi (
girv_id					INT NOT NULL PRIMARY KEY AUTO_INCREMENT, 
girv_cust_id				VARCHAR(16),
girv_type				VARCHAR(16),".
//  
// ADDED CODE FOR TRANSACTION TYPE @AUTHOR:PRIYANKA-17MAR2023        
"girv_trans_type			VARCHAR(16),
girv_own_id				VARCHAR(16), 
girv_jrnlid     			INT,
girv_jrmnid                             INT,
girv_firm_id 				VARCHAR(16),
girv_firm_girvi_no			INT,
girv_cust_fname 			VARCHAR(50),
girv_cust_lname 			VARCHAR(50),
girv_cust_Address 			VARCHAR(500),
girv_cust_city				VARCHAR(50),
girv_main_prin_amt			INT,
girv_prin_amt				VARCHAR(50),".
"girv_cash_paid_amt                     INT," . //ADDED TO STORE CASH PAID AMOUNT @AUTHOR:MADHUREE-20NOV2021
"girv_cheque_paid_amt                   INT," . //ADDED TO STORE CHEQUE PAID AMOUNT @AUTHOR:MADHUREE-20NOV2021
"girv_card_paid_amt                     INT," . //ADDED TO STORE CARD PAID AMOUNT @AUTHOR:MADHUREE-20NOV2021
"girv_online_paid_amt                   INT," . //ADDED TO STORE ONLINE PAID AMOUNT @AUTHOR:MADHUREE-20NOV2021
"girv_main_prin_amt_int			INT,
girv_prin_amt_int		        INT,
girv_processing_per                     INT," . //ADDED TO STORE PROCESSING AMOUNT PERCENTAGE @AUTHOR:MADHUREE-10MARCH2021
"girv_charge_per                        INT," . //ADDED TO STORE EXTRA CHARGES AMOUNT PERCENTAGE @AUTHOR:MADHUREE-10MARCH2021
"girv_processing_amt                    INT,
girv_charge_amt                         INT,
girv_main_prin_final_amt                INT,
girv_ROI				FLOAT,
girv_IROI				FLOAT,
girv_custody_ROI                        FLOAT,
girv_ROI_Id				INT,
girv_ROI_typ				VARCHAR(30),
girv_cust_girvi_num			INT,
girv_pre_serial_num			VARCHAR(5),
girv_serial_num				INT,
girv_serial_code			VARCHAR(30),
girv_pre_rel_serial_num			VARCHAR(5),
girv_rel_serial_num			INT,
girv_packet_num				VARCHAR(30),
girv_grace_period_day			VARCHAR(30),
girv_DOB				VARCHAR(50),
girv_other_lang_DOB			VARCHAR(50),". //ADDED TO STORE OTHER LANGUAGE DATE @AUTHOR:MADHUREE-01DEC2021
"girv_new_DOB				VARCHAR(50),
girv_updated_roi_DOB                    VARCHAR(50),". //ADDED COLUMN FOR STORE UPDATED DATE OF ROI : AUTHOR @DARSHANA 10 NOV 2021
"girv_DOR				VARCHAR(50),
girv_int_opt				VARCHAR(10),
girv_monthly_intopt                     VARCHAR(10),
girv_compounded_opt			VARCHAR(15),
girv_total_time				VARCHAR(50),
girv_total_princ                        FLOAT, 
girv_total_int				FLOAT,
girv_total_iint				FLOAT,
girv_total_amt				FLOAT,
girv_total_iamt				FLOAT,
girv_paid_amt				FLOAT,
girv_paid_iamt				FLOAT,
girv_paid_int				FLOAT,
girv_paid_iint				FLOAT,
girv_discount_amt			FLOAT,
girv_discount_iamt			FLOAT,
girv_extra_amt                          FLOAT,
girv_extra_oamt                         FLOAT,"//ADDED TO STORE EXTRA AMOUNT WHILE RELEASEING LOAN @AUTHOR:MADHUREE-15NOV2021
."girv_total_oint			FLOAT,
girv_total_oamt				FLOAT,
girv_paid_oamt				FLOAT,".
"girv_cash_rec_amt                      INT," . //ADDED TO STORE CASH RECEIVED AMOUNT @AUTHOR:MADHUREE-20NOV2021
"girv_cheque_rec_amt                    INT," . //ADDED TO STORE CHEQUE RECEIVED AMOUNT @AUTHOR:MADHUREE-20NOV2021
"girv_card_rec_amt                      INT," . //ADDED TO STORE CARD RECEIVED AMOUNT @AUTHOR:MADHUREE-20NOV2021
"girv_online_rec_amt                    INT," . //ADDED TO STORE ONLINE RECEIVED AMOUNT @AUTHOR:MADHUREE-20NOV2021
"girv_paid_oint				FLOAT,
girv_discount_oamt			FLOAT,
girv_total_valuation			FLOAT,
girv_auction_amt			FLOAT,
girv_ent_dat 				DATETIME,
girv_upd_sts				VARCHAR(50),
girv_rel_upd_sts			VARCHAR(50),
girv_rel_ipass_sts			VARCHAR(50),
girv_transfer_id			INT,
girv_trans_firm_id                      VARCHAR(10),
girv_transfer_ml_id                     VARCHAR(100),
girv_trans_loan_id                      VARCHAR(30),
girv_comm 				VARCHAR(2000),
girv_time_period                        VARCHAR(6),
girv_sms_id                             VARCHAR(16),
girv_cr_acc_id				VARCHAR(50),".
"girv_cr_cheque_acc_id                  VARCHAR(50)," . //ADDED TO STORE CHEQUE AMOUNT ACC ID @AUTHOR:MADHUREE-20NOV2021
"girv_cr_card_acc_id                    VARCHAR(50)," . //ADDED TO STORE CARD AMOUNT ACC ID @AUTHOR:MADHUREE-20NOV2021
"girv_cr_online_acc_id                  VARCHAR(50)," . //ADDED TO STORE ONLINE AMOUNT ACC ID @AUTHOR:MADHUREE-20NOV2021
"girv_dr_acc_id				VARCHAR(50),
girv_cr_acc_id_int			VARCHAR(50),
girv_dr_acc_id_int			VARCHAR(50),
girv_cheque_no				VARCHAR(50),
girv_pay_other_info			VARCHAR(100),
girv_cash_narration                     VARCHAR(25),
girv_cheque_narration                   VARCHAR(25),
girv_card_narration                     VARCHAR(25),
girv_online_narration                   VARCHAR(25),
girv_tally_date                         VARCHAR(100),
girv_MonthIntOpt                        VARCHAR(10),
girv_fst_mn_int			        VARCHAR(10), 
girv_prin_pre_id                        VARCHAR(16),
girv_prin_post_id                       INT,
girv_dr_cash_acc_id                     VARCHAR(16),".
"girv_dr_cheque_acc_id                  VARCHAR(50)," . //ADDED TO STORE CHEQUE AMOUNT RECEIVED ACC ID @AUTHOR:MADHUREE-20NOV2021
"girv_dr_card_acc_id                    VARCHAR(50)," . //ADDED TO STORE CARD AMOUNT RECEIVED ACC ID @AUTHOR:MADHUREE-20NOV2021
"girv_dr_online_acc_id                  VARCHAR(50)," . //ADDED TO STORE ONLINE AMOUNT RECEIVED ACC ID @AUTHOR:MADHUREE-20NOV2021
"girv_loan_acc_id                        VARCHAR(16),
girv_int_rec_acc_id                     VARCHAR(16),
girv_disc_acc_id                        VARCHAR(16),
girv_extra_amt_acc_id                   VARCHAR(16),"//ADDED TO STORE EXTRA AMOUNT ACCOUNT ID @AUTHOR:MADHUREE-15NOV2021
."girv_staff_id                         VARCHAR(16),
girv_hindi_DOB                          VARCHAR(50),
girv_hindi_new_DOB                      VARCHAR(50),
girv_hindi_DOR                          VARCHAR(50),
girv_hindi_tithi                        VARCHAR(16),
girv_hindi_new_tithi                    VARCHAR(16),
girv_hindi_paksh                        VARCHAR(16),
girv_hindi_new_paksh                    VARCHAR(16),
girv_hindi_rel_tithi                    VARCHAR(16),
girv_hindi_rel_paksh                    VARCHAR(16),
girv_date_type                          VARCHAR(40),
girv_EMI_days                           VARCHAR(40),
girv_EMI_occurrences                    VARCHAR(40),
girv_fin_interest                       VARCHAR(40),
girv_fin_final_amount                   VARCHAR(40),
girv_fin_process_amt                    VARCHAR(40)," .
// Added By @PRIYANKA-06JULY18
"girv_fin_prd_typ                        VARCHAR(20),
girv_EMI_status                         VARCHAR(20),
girv_fin_collect_amt                    VARCHAR(40),
girv_pl_total_prin_amt                  VARCHAR(30),
girv_pl_total_final_intrest             VARCHAR(30),
girv_pl_total_iamt                      double,
girv_pl_total_final_iintrest            VARCHAR(30),
girv_pl_total_amt                       double,
girv_pl_total_value                     double,
girv_pl_amt                             double,
girv_pl_sts                             varchar(3),
girv_pl_month                           INT,
girv_locker_no                          INT,
girv_image_id                           INT, 
girv_locker_status                      VARCHAR(10),
girv_rel_loan_by_userid                 VARCHAR(32),
girv_rel_loan_by_user_details           VARCHAR(100),
girv_omprocess_date                     VARCHAR(100),"//ADDED TO STORE OMPROCESS DATE @AUTHOR:MADHUREE-10NOV2021
."girvi_location                        VARCHAR(100)," . //ADDED TO STORE BOX ITEM LOCATION FOR LOAN @AUTHOR:MADHUREE-04MARCH2021
"girvi_sms_status                       VARCHAR(10)," .  //ADDED TO STORE LOAN DUE MSG SENT STATUS @AUTHOR:MADHUREE-04MARCH2021
"girvi_last_sms_date            	VARCHAR(50)," .
"girvi_fine_emi_amt                     VARCHAR(20),". //ADDED TO FINE AMOUNT AND EMI ON FINANCE @AUTHOR @DARSHANA 25 OCT 2021
"girv_auction_chrg                      VARCHAR(20),". // ADDED FOR AUCTION CHARGES : @AUTHOR DARSHANA 1 APRIL 2022
"girv_auction_chrg_acc                      INT(20),". // ADDED FOR AUCTION CHARGES : @AUTHOR DARSHANA 1 APRIL 2022       
"girv_auction_extra_chrg                VARCHAR(20),". // ADDED FOR AUCTION EXTRA CHARGES : @AUTHOR DARSHANA 1 APRIL 2022
"girv_auction_extra_chrg_acc               INT(20),". // ADDED FOR AUCTION EXTRA CHARGES : @AUTHOR DARSHANA 1 APRIL 2022
"girv_fin_staff_id                      VARCHAR(50),".
"girv_voucher_no                      VARCHAR(20),".
"girv_monthly_compounded_opt          VARCHAR(8),".//PRATHAMESH ADDED FOR store compound interest monthly options
"girv_joint_loan_sr_no                VARCHAR(16),".//PRATHAMESH ADDED FOR store GIRVI joint loan serial no
"girv_loan_box_name                        VARCHAR(16),".//AKSHAY ADDED FOR store GIRVI loan box name  
"girv_loan_packet_wt                        VARCHAR(16),".//AKSHAY ADDED FOR store GIRVI loan box name    
"girv_box_pouch_no                        VARCHAR(20),".//AKSHAY ADDED FOR store GIRVI loan box name   
"girv_box_other_info                      VARCHAR(20),". //SALONI ADDED FOR store GIRVI loan box other info 
"girv_roi_type                      VARCHAR(20),".
"girv_tpp_no                   VARCHAR(50),".
"girv_old_gl_no                VARCHAR(50),".
"girv_crm_code                 VARCHAR(50),".
"girv_selected_scheme          VARCHAR(100),".
"girv_purpose                  VARCHAR(200),".
"girv_penal_charges            VARCHAR(50),".
"girv_effective_annualized_rate VARCHAR(50),".
"girv_interest_mode            VARCHAR(50),".
"girv_min_interest_days        VARCHAR(10),".
"girv_effective_rate           VARCHAR(50),".
"girv_rebate                   VARCHAR(20),".
"girv_paid_within              VARCHAR(20),"
        . "last_column                VARCHAR(1),UNIQUE KEY (girv_pre_serial_num,girv_serial_num))AUTO_INCREMENT=100001";

if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>