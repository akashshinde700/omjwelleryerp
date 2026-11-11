<?php

/*
 * Created on Aug 24, 2016 
 *
 * @FileName: omtbkttb.php
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

//AUTHOR:GAUR24AUG16
//include 'omssopin.php';
$query = "CREATE TABLE IF NOT EXISTS kitty (
kitty_id			        INT NOT NULL PRIMARY KEY AUTO_INCREMENT, 
kitty_kitty_id				VARCHAR(16),
kitty_cust_id				VARCHAR(16),
kitty_own_id				VARCHAR(16), 
kitty_jrnlid     			INT,
kitty_jrmnid                            INT,
kitty_firm_id 				VARCHAR(16),
kitty_firm_kitty_no			INT,
kitty_min_amt                           INT,
kitty_lucky_draw_amt                    INT,
kitty_no_of_lucky_draw                  INT,
kitty_multiplier                        INT,
kitty_winner_no                         INT,
kitty_winner_amount                     FLOAT,
kitty_disc                              FLOAT,
kitty_emi_late_fee_mkg_gold             VARCHAR(50),
kitty_emi_late_fee_mkg_diamond          VARCHAR(50),
kitty_emi_late_mkg_chk                 VARCHAR(50),
kitty_pre_due_days                      INT,
kitty_post_due_days                     INT,
kitty_cust_fname 			VARCHAR(50),
kitty_cust_lname 			VARCHAR(50),
kitty_cust_mobile_no			VARCHAR(50),
kitty_cust_Address 			VARCHAR(500),
kitty_cust_city				VARCHAR(50),
kitty_stock_prod_id                     VARCHAR(12),
kitty_stock_image_id			VARCHAR(12),
kitty_EMI_amt			        INT,
kitty_EMI_tot_amt			INT,
kitty_bonus_amt			        VARCHAR(10),
kitty_EMI_multiple                      INT," //ADDED FOR KITTY EMI MULTIPLE AMOUNT @AUTHOR:MADHUREE-08JUN2020
."kitty_gift_item                       VARCHAR(100),
kitty_gift_item_del_sts                 VARCHAR(5),
kitty_main_prin_amt			INT,
kitty_prin_amt				INT,
kitty_pre_serial_num			VARCHAR(5),
kitty_serial_num			INT,
kitty_token_num                         INT,
kitty_start_token_num                   INT,
kitty_end_token_num                     INT,
kitty_barcode                           VARCHAR(50),
kitty_no_of_users                       VARCHAR(50),
kitty_staff_id                          INT,
kitty_DOB				VARCHAR(50),
kitty_end_DOB				VARCHAR(50),
kitty_new_DOB				VARCHAR(50),
kitty_DOR				VARCHAR(50),
kitty_scheme                            VARCHAR(100),
kitty_group                             VARCHAR(100),
kitty_metal_type                        VARCHAR(50),
kitty_ent_dat 				DATETIME,
kitty_upd_sts				VARCHAR(50),
kitty_final_sts				VARCHAR(100),
kitty_win_date				VARCHAR(50),
kitty_EMI_days                          VARCHAR(40),
kitty_EMI_occurrences                   VARCHAR(40),
kitty_scheme_prd_typ                    VARCHAR(20),
kitty_scheme_occ_prd_typ                VARCHAR(20),
kitty_EMI_status                        VARCHAR(20),
kitty_Close_Date                        VARCHAR(50),
kitty_comm 				VARCHAR(2000),
kitty_total_amt				FLOAT,
kitty_paid_amt				FLOAT,
kitty_paid_bonus_amt			FLOAT,
kitty_bonus_percent                     FLOAT,
kitty_rate_amt				FLOAT,
kitty_wt_amt				FLOAT,".
        //kitty_bonus_wt
"kitty_bonus_metal_wt                   FLOAT,
kitty_cr_acc_id				VARCHAR(50),
kitty_dr_acc_id				VARCHAR(50),
kitty_pay_other_info			VARCHAR(100),
kitty_frequency                         INT,
kitty_period                            VARCHAR(50),
kitty_csv_reference_no                  INT,
kitty_EMI_auto_SMS                      VARCHAR(10),"
//COLUMN ADDED TO ADD KITTY ECOM STATUS, KITTY DEFAULT STATUS AND KITTY PLAN,@AUTHOR:HEMA-3SEP2020
."kitty_ecom_status                     VARCHAR(10),
 kitty_default_status                   VARCHAR(10),"
        //Adding these 2 columns for GST checking for cash to gold amount in gold scheme and emi late fee after scheme closed
."kitty_emi_late_fee                    INT,"
."kitty_cash_to_gold                    VARCHAR(10)," 
 //       
. "kitty_late_fee_days                  VARCHAR(20),"
 //Adding this column for GST checking for adding in EMI amount
 ."kitty_gst_check_status               VARCHAR(10),
 kitty_plan                             VARCHAR(100),"
//COLUMN ADDED TO ADD KITTY REQUEST ID WHEN ONLINE KITTY IS ADDED,@AUTHOR:HEMA-23SEP2020
."kitty_request_id                      VARCHAR(50),
kitty_indicator                         VARCHAR(20)," //COLUMN ADDED TO STORE SCHEME INDICATOR @AUTHOR:MADHUREE-6APRIL2021
."kitty_other_info			VARCHAR(100),"
."kitty_gold_bonus_per                  FLOAT," 
."kitty_diamond_bonus_per               FLOAT," 
."kitty_bullion_bonus_per               FLOAT,"
."kitty_gold_making_per                 FLOAT," 
."kitty_diamond_making_per              FLOAT," 
."kitty_bullion_making_per              FLOAT,"
."kitty_dep_metal_wt                    VARCHAR(16),"          
."kitty_metal_tunch                     VARCHAR(16),"//Prathamesh Added To Decide Metal tunch while booking
."kitty_lucky_draw                      VARCHAR(16),"//Prathamesh Added Set Lucky draw
."kitty_paid_EMI                        VARCHAR(16),"//Prathamesh Added Set Lucky draw
. "last_column                VARCHAR(1))";


if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>