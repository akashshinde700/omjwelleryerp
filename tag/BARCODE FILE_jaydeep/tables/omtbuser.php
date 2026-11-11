<?php

/*
 * Created on 22-Dec-2015 15:45:17 PM
 *
 * @FileName: omtbuser.php
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

// include 'omssopin.php';
$query = "CREATE TABLE IF NOT EXISTS user (
user_id 		INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
user_owner_id		VARCHAR(16),
user_firm_id		VARCHAR(16), 
user_type               VARCHAR(16),
user_type_status        VARCHAR(16),
user_pid	        VARCHAR(10),
user_uid	        INT,
user_unique_code        VARCHAR(10),
user_counter_id         VARCHAR(12),
user_otp                VARCHAR(40),
user_prefix_name         VARCHAR(5),
user_fname 		VARCHAR(50),
user_ship_fname 	VARCHAR(50)," . //added for omecom shipping fname:@AUTHOR-MADHUREE:04-DEC-19
        "user_bill_fname 	VARCHAR(50)," . //added for omecom billing fname:@AUTHOR-MADHUREE:04-DEC-19
        "user_lname 		VARCHAR(50),
user_ship_lname 	VARCHAR(50)," . //added for omecom shipping lname:@AUTHOR-MADHUREE:04-DEC-19
        "user_bill_lname 	VARCHAR(50)," . //added for omecom billing lname:@AUTHOR-MADHUREE:04-DEC-19
        "user_father_name 	VARCHAR(50),
user_mother_name 	VARCHAR(50),
user_DOB		VARCHAR(50),
user_sex		VARCHAR(2),
user_marriage_any	VARCHAR(50),
user_marital_status	VARCHAR(50),
user_spouse_name	VARCHAR(50),".
//add spouse relation by CHETAN@22FEB2023        
"user_spouse_relation    VARCHAR(10),        
user_nominee_name       VARCHAR(50),
user_rel_with_nominee	VARCHAR(50),
user_spouse_dob         VARCHAR(50),
user_occupation         VARCHAR(100),
user_qualification	VARCHAR(50),
user_add 		VARCHAR(100),
user_ship_add 		VARCHAR(100)," . //added for omecom shipping address:@AUTHOR-MADHUREE:04-DEC-19
"user_bill_add          VARCHAR(100)," . //added for omecom billing address:@AUTHOR-MADHUREE:04-DEC-19
"user_city 		VARCHAR(50),
user_ship_city 		VARCHAR(50)," . //added for omecom shipping city:@AUTHOR-MADHUREE:04-DEC-19
"user_bill_city 	VARCHAR(50)," . //added for omecom billing city:@AUTHOR-MADHUREE:04-DEC-19 
"user_village 		VARCHAR(50),
user_tehsil		VARCHAR(50),
user_pincode 		VARCHAR(6),
user_ship_pincode 	VARCHAR(6)," . //added for omecom shipping pincode:@AUTHOR-MADHUREE:04-DEC-19
"user_bill_pincode 	VARCHAR(6)," . //added for omecom billing pincode:@AUTHOR-MADHUREE:04-DEC-19
"user_state_code 	VARCHAR(6),
user_state 		VARCHAR(50),
user_ship_state 	VARCHAR(50)," . //added for omecom shipping state:@AUTHOR-MADHUREE:04-DEC-19
"user_bill_state 	VARCHAR(50)," . //added for omecom billing state:@AUTHOR-MADHUREE:04-DEC-19
"user_country 		VARCHAR(50),
user_country_code 	VARCHAR(5),
user_ship_country 	VARCHAR(50)," . //added for omecom shipping country:@AUTHOR-MADHUREE:04-DEC-19
"user_bill_country 	VARCHAR(50)," . //added for omecom billing country:@AUTHOR-MADHUREE:04-DEC-19
"user_phone 		VARCHAR(16),
user_mobile		VARCHAR(20),
user_ship_mobile	VARCHAR(16)," . //added for omecom shipping mobile number:@AUTHOR-MADHUREE:04-DEC-19 
"user_bill_mobile 	VARCHAR(16)," . //added for omecom billing mobile number:@AUTHOR-MADHUREE:04-DEC-19
"user_email 		VARCHAR(100)," .
"user_bill_email 	VARCHAR(100)," . //added for omecom billing email:@AUTHOR-MADHUREE:04-DEC-19
"user_membership 	VARCHAR(60),
user_ward_no            VARCHAR(30),
user_lty_no             VARCHAR(30),
user_caste              VARCHAR(30),
user_acc_id             VARCHAR(10),
user_pacc_id 		VARCHAR(16),
user_sacc_id 		VARCHAR(16),
user_gd_gs_wt           VARCHAR(16),
user_gd_gs_wt_type      VARCHAR(10),
user_gd_bal_crdr        VARCHAR(10),
user_gd_nt_wt           VARCHAR(16),
user_gd_nt_wt_type      VARCHAR(10),
user_gd_fn_wt           VARCHAR(16),
user_gd_fn_wt_type      VARCHAR(10),
user_gd_ffn_wt          VARCHAR(16),
user_gd_ffn_wt_type     VARCHAR(10),
user_sl_gs_wt           VARCHAR(16),
user_sl_gs_wt_type      VARCHAR(10),
user_sl_bal_crdr        VARCHAR(10),
user_sl_nt_wt           VARCHAR(16),
user_sl_nt_wt_type      VARCHAR(10),
user_sl_fn_wt           VARCHAR(16),
user_sl_fn_wt_type      VARCHAR(10),
user_sl_ffn_wt          VARCHAR(16),
user_sl_ffn_wt_type     VARCHAR(10),
user_cash_balance       VARCHAR(16), 
user_cash_bal_crdr       VARCHAR(16), 
user_shop_name         	VARCHAR(200),
user_website 		VARCHAR(100)," .
"user_wishlist_product   VARCHAR(1000),
user_pan_it_no		VARCHAR(50),
user_sale_tax_no	VARCHAR(50),
user_interest		VARCHAR(20),
user_cst_no		VARCHAR(50),
user_staff_id           VARCHAR(16),
user_sec_staff_id       VARCHAR(16),"
        . "user_staff_name         VARCHAR(20),
user_sec_staff_name       VARCHAR(20),"
. "user_comm_upd_date      VARCHAR(100),
user_relation_circle	VARCHAR(500),
user_login_id		VARCHAR(100), 
user_password		VARCHAR(40),
user_ipassword		VARCHAR(40),
user_category           VARCHAR(50),
user_reference		VARCHAR(50),
user_priority 		VARCHAR(16),
user_loyal_points	VARCHAR(50),
user_monthly_income	VARCHAR(16),
user_no_of_loans        INT,
user_status 		VARCHAR(16),
user_block_status       VARCHAR(16),
user_last_lead          VARCHAR(16),"
        . "user_since 		DATETIME,
user_image_status       VARCHAR(16),
user_image_id           VARCHAR(16),
user_pan_adhr_img_id    VARCHAR(40),
user_edu_cert_img_id    VARCHAR(50),
user_exp_cert_img_id    VARCHAR(35),
user_sal_cert_img_id    VARCHAR(35),
user_offers_email 	VARCHAR(10),
user_offers_sms_status 	VARCHAR(10),
user_nominee_cust_id 	VARCHAR(100),
user_prod_login_id 	VARCHAR(30),
user_prod_key        	VARCHAR(30),
user_adhaar_card        VARCHAR(30),
user_sign_snap          LONGBLOB,
user_sign_snap_thumb    LONGBLOB,
user_sign_snap_fname    VARCHAR(150),
user_sign_snap_fsize    VARCHAR(150),
user_sign_snap_fszMB    VARCHAR(150),
user_sign_update_date   DATETIME,
user_mobile1		VARCHAR(16), 
user_mobile2		VARCHAR(16), 
user_mobile3		VARCHAR(16), 
user_official_address   VARCHAR(100),
user_current_address    VARCHAR(100),
user_shipping_address    VARCHAR(100),
user_salary_date	VARCHAR(50),
user_bank_details       VARCHAR(100),
user_other_info		VARCHAR(500),
user_extended_access    VARCHAR(500),
user_service            VARCHAR(20),
user_contact_website    VARCHAR(50),
user_contact_date       VARCHAR(16),
user_indicator          VARCHAR(20),
user_req_type           VARCHAR(20),
user_prod_reg_date      VARCHAR(20),
user_prod_exp_date      VARCHAR(20),
user_entry_date         VARCHAR(20),
user_next_date          VARCHAR(20),
user_last_comment       VARCHAR(20),
user_last_comment_date  VARCHAR(20),
user_last_comment_time  VARCHAR(16), " . // COLUMN ADDED FOR LAST COMMENT TIME @AUTHOR:MADHUREE-01JULY2020
"user_commission        INT, " . // COLUMN ADDED FOR STAFF SALE COMMISSION @AUTHOR:MADHUREE-02MARCH2020
"user_atm_pin           VARCHAR(16),
user_SMS_approval       VARCHAR(16), 
user_bank_acc_name      VARCHAR(50),
user_bank_acc_number    VARCHAR(20),
user_bank_ifsc_code     VARCHAR(20),".
//add bank type saving / current and adding interview details by CHETAN@23FEB2023
"user_bank_type         VARCHAR(10),
user_interview_date     VARCHAR(20),
user_inter_sr_no        VARCHAR(10),
user_inter_name         VARCHAR(50),
user_inter_contact      VARCHAR(30),
user_inter_profile      VARCHAR(100),
user_inter_qualification  VARCHAR(20),
user_inter_tot_exp      VARCHAR(10),
user_inter_cur_sal      VARCHAR(10),
user_inter_expected_sal  VARCHAR(10),
user_inter_note_period   VARCHAR(10),
user_inter_ref_portal   VARCHAR(50),
user_inter_test_marks   VARCHAR(10),
user_inter_status       VARCHAR(10)," .
// Ends adding interview details columns by CHETAN@23FEB2023       
"user_total_experiance   VARCHAR(20)," .
//    THESE COLUMNS ARE ADDED FOR EMP AND MEDICAL DETAILS BY CHETAN@21FEB2023    
"user_school_name        VARCHAR(50),
user_college_name       VARCHAR(50),
user_degree             VARCHAR(20),
user_ssc_marks          VARCHAR(8),
user_hsc_marks          VARCHAR(8),
user_degree_marks       VARCHAR(8),
user_place_of_birth     VARCHAR(20), 
user_age                VARCHAR(3),
uset_weight             VARCHAR(3),
user_height             VARCHAR(3),
user_blood_group        VARCHAR(15),
user_blood_pressure     VARCHAR(10),
user_diabetes_is        VARCHAR(6),
user_diagnosis          VARCHAR(500),
user_allergies           VARCHAR(500)," .
//END COLUMNS ADDED BY CHETAN@21FEB2023         
"user_current_salary     VARCHAR(50),
user_expected_salary    VARCHAR(50),
user_date_of_joining    VARCHAR(20),
user_date_of_leaving    VARCHAR(20),
user_team               VARCHAR(20),
user_staff_designation  VARCHAR(50),
user_manager            VARCHAR(20),
user_mpassword          VARCHAR(40)," . //ADDED COLUMN TO STORE EMP ID,DEAPRTMENT,SUB DEPARTMENT,EMP TYPE,PROBATION PERIOD,NOTICE PERIOD @AUTHOR:SIMRAN-07DEC2021
"user_emp_id            VARCHAR(20), 
user_department         VARCHAR(40), 
user_sub_department     VARCHAR(40),
user_emp_type           VARCHAR(10),
user_bio_gate_id        VARCHAR(10),
user_probabtion_period  VARCHAR(10),
user_notice_period      VARCHAR(10),
user_band               VARCHAR(15), 
user_level              VARCHAR(15),
user_ip_address          VARCHAR(20),
user_time_zone           VARCHAR(20),
user_currency_code       VARCHAR(5),
user_currency_symbol     VARCHAR(10),
user_latitude            VARCHAR(20),
user_longitude           VARCHAR(20),". // Added columns for band and level by CHETAN@22FEB2023 
//COLUMN ADDED TO STORE RECENTLY VIEW PRODUCT OF USER,@AUTHOR:HEMA-11JUN2020
"user_recent_view_prod  VARCHAR(100), 
user_omprocess_date     VARCHAR(12)," .
"user_referral_code      VARCHAR(32)," . //ADDED TO STORE USER REFERRER CODE @AUTHOR:MADHUREE-30MARCH2022
"user_referral_user_id   VARCHAR(15)," . //ADDED TO STORE USER REFERRER USER ID @AUTHOR:MADHUREE-30MARCH2022
"user_whatsapp_send_status   VARCHAR(25)," . //ADDED TO STORE USER   WHATSAPP MSG SEND STATUS@AUTHOR:SARVESH-28JUN2022
"user_whatsapp_send_date   VARCHAR(25)," . //ADDED TO STORE USER  NEXT DAY  WHATSAPP MSG SEND @AUTHOR:SARVESH-28JUN2022
"user_whatsapp_send_campaign   VARCHAR(25)," . //ADDED TO STORE USER  WHATSAPP MSG CAMPAIGN NAME@AUTHOR:SARVESH-28JUN2022
"user_zodiac_sign          VARCHAR(20)," . //ADDED TO STORE USER ZODIC SIGN @AUTHOR:SARVESH-22NOV2022
"user_random_no            VARCHAR(10),"
. "user_telegram_attend_bot_id    VARCHAR(50),"
. "user_telegram_attend_bot_key   VARCHAR(50),"
. "user_telegram_attend_group_id  VARCHAR(50),"
. "user_telegram_todo_bot_id    VARCHAR(50),"   //ADDED TELEGRAM TODO BOT @AUTHOR:PRATHAMESH-09OCT2023
. "user_telegram_todo_bot_key   VARCHAR(50),"   //ADDED TELEGRAM TODO BOT @AUTHOR:PRATHAMESH-09OCT2023
. "user_telegram_todo_group_id  VARCHAR(50),"   //ADDED TELEGRAM TODO BOT @AUTHOR:PRATHAMESH-09OCT2023
. "user_telegram_ticket_bot_id    VARCHAR(50)," //ADDED TELEGRAM TICKET BOT @AUTHOR:PRATHAMESH-09OCT2023
. "user_telegram_ticket_bot_key   VARCHAR(50)," //ADDED TELEGRAM TICKET BOT @AUTHOR:PRATHAMESH-09OCT2023
. "user_telegram_ticket_group_id  VARCHAR(50)," //ADDED TELEGRAM TICKET BOT @AUTHOR:PRATHAMESH-09OCT2023
. "user_minimum_sales   VARCHAR(50)," //
. "user_target_sales  VARCHAR(50),"
. "user_wstg_charge        VARCHAR(32)," //COLUMN ADDED TO STORE WASTAGE CHARGES ON LATE PAYMENT #AUTHOR:RENUKA SHARMA-31JAN2023
. "user_wstg_no_days       VARCHAR(32)," //COLUMN ADDED TO STORE NO OF DAYS ON LATE PAYMENT #AUTHOR:RENUKA SHARMA-31JAN2023
. "user_wstg_occ           VARCHAR(32)," //COLUMN ADDED TO STORE OCCURENCE OF WASTAGE INCREMENT ON LATE PAYMENT #AUTHOR:RENUKA SHARMA-31JAN2023
// ADDED SHIPPING DETAILS @SIMRAN:28OCT2023
. "user_shipping_prefix		VARCHAR(50),"    
. "user_shipping_fname		VARCHAR(50),"
. "user_shipping_lname 		VARCHAR(50),"
. "user_shipping_gst_no		VARCHAR(50),"
. "user_shipping_pan_no         VARCHAR(50),"
. "user_shipping_city 		VARCHAR(50),"
. "user_shipping_state 		VARCHAR(50),"
. "user_shipping_mob_no 	VARCHAR(50),"
. "user_delete_request          VARCHAR(6),"
. "user_delete_request_at_date    DATETIME,"        
. "last_column             VARCHAR(1),"//ADDED TO STORE OMPROCESS DATE @AUTHOR:MADHUREE-10NOV2021
. "UNIQUE KEY (user_type, user_pid, user_uid), UNIQUE KEY (user_mobile, user_firm_id), UNIQUE KEY (user_email), UNIQUE KEY (user_login_id), UNIQUE KEY (user_referral_code))AUTO_INCREMENT = 10001";
//
if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}

// To check new columns added into table or not 
include 'ommptbauprdwrfl.php';

//$query2 = "ALTER TABLE user MODIFY COLUMN user_whatsapp_send_status VARCHAR(25), MODIFY COLUMN user_whatsapp_send_date VARCHAR(25);";
//if (!mysqli_query($conn, $query2)) {
//    die('Error: ' . mysqli_error($conn));
//}
?>