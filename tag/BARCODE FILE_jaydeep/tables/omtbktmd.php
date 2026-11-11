<?php

/*
 * Created on Aug 17, 2016
 *
 * @FileName: omtbktmd.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: oMunim
 * @version 1.0
 * @Copyright (c) 2010 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2010 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php

//AUTHOR:GAUR24AUG16
//include 'omssopin.php';
$query = "CREATE TABLE IF NOT EXISTS kitty_money_deposit (
kitty_mondep_id	 				INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
kitty_mondep_kitty_id				VARCHAR(16),
kitty_mondep_kt_mon_id   			VARCHAR(16), 
kitty_mondep_utin_id				VARCHAR(16), 
kitty_mondep_cust_id				VARCHAR(16),
kitty_mondep_own_id				VARCHAR(16),
kitty_mondep_firm_id				VARCHAR(16),
kitty_mondep_prin_amt 				INT,
kitty_mondep_amt 				VARCHAR(16),
kitty_mondep_win_id 				VARCHAR(16),
kitty_mondep_win_cust_id 			VARCHAR(16),
kitty_mondep_win_name 				VARCHAR(50),
kitty_mondep_paid_amt 				VARCHAR(16),
kitty_mondep_win_amt 				VARCHAR(16),
kitty_mondep_loss_amt 				VARCHAR(16),
kitty_mondep_cpaid_amt 				VARCHAR(16),
kitty_mondep_cleft_amt 				VARCHAR(16),
kitty_mondep_win_date                           VARCHAR(50),
kitty_mondep_tpaid_amt 				VARCHAR(16),
kitty_mondep_tleft_amt 				VARCHAR(16),
kitty_mondep_date				VARCHAR(50),
kitty_mondep_DOR                                 VARCHAR(50),
kitty_mondep_ent_dat 				DATETIME,
kitty_mondep_upd_sts				VARCHAR(50),
kitty_mondep_comm				VARCHAR(500),
kitty_mondep_jrnlid				INT,
kitty_mondepd_sts				VARCHAR(50),
kitty_mondepd_comm_id				INT,
kitty_mondepd_dr_acc_id                         VARCHAR(16),
kitty_mondepd_cr_acc_id                         VARCHAR(16),
kitty_mondepd_dr_cash_acc_id                    VARCHAR(16),
kitty_mondepd_loan_acc_id                       VARCHAR(16),
kitty_mondepd_disc_acc_id                       VARCHAR(16),
kitty_mondepd_cgst_acc_id                       VARCHAR(16),"// COL ADDED FOR GST ACC ID BY CHETAN@30MAY2023
."kitty_mondepd_sgst_acc_id                     VARCHAR(16)," // COL ADDED FOR GST ACC ID BY CHETAN@30MAY2023
."kitty_mondepd_igst_acc_id                     VARCHAR(16)," // COL ADDED FOR GST ACC ID BY CHETAN@30MAY2023
."kitty_mondepd_staff_id                   	VARCHAR(16),
kitty_mondepd_recipit_no                   	VARCHAR(16),
kitty_mondep_hindi_date                   	VARCHAR(50),
kitty_mondep_hindi_DOR                          VARCHAR(50),
kitty_mondep_tithi                        	VARCHAR(16),
kitty_mondep_tithi_DOR                          VARCHAR(16),
kitty_mondep_paksh                       	VARCHAR(16),
kitty_mondep_paksh_DOR                          VARCHAR(16),
kitty_mondep_EMI_no                       	VARCHAR(40),
kitty_mondep_EMI_start_DOB                      VARCHAR(40),
kitty_mondep_EMI_end_DOB                       	VARCHAR(40),
kitty_mondep_EMI_status                       	VARCHAR(40),
kitty_mondep_EMI_paid_date                      VARCHAR(40),
kitty_mondep_EMI_total_amt                     	VARCHAR(40),
kitty_mondep_taxable_amt                    	VARCHAR(40),"
."kitty_mondep_gst_amt                    	VARCHAR(40),
kitty_mondep_EMI_disc_amt                       VARCHAR(20),"
. "kitty_mondep_EMI_amt                      	VARCHAR(40),
kitty_mondep_EMI_staff_id                      	VARCHAR(40),
kitty_mondep_col_user_id                        VARCHAR(16),
kitty_mondep_col_user_type      		VARCHAR(16),
kitty_final_sts				        VARCHAR(100)," .
/* START CODE TO ADD kitty_mondep_online_pay_mob_no COLUMN FOR STORING THE PAYMENT MODE BY ECOM @AUTHOR:HEMA-4MARCH2020 */
"kitty_mondep_online_pay_mob_no                 VARCHAR(16),   
kitty_pay_mode				        VARCHAR(32)," .
/* START CODE TO ADD kitty_mondep_payment_history COLUMN FOR STORING THE PAYMENT DETAILS HISTORY PAID BY ECOM @AUTHOR:MADHUREE-21JAN2020 */
"kitty_mondep_payment_history			VARCHAR(1200)," .
/* START CODE TO ADD COLUMNS FOR STORING THE MSG SENT STATUS & SENT DATE @AUTHOR:MADHUREE-07JUNE2020 */
"kitty_mondep_msg_sent_status			VARCHAR(10),
kitty_mondep_msg_sent_date			VARCHAR(20),
kitty_mondep_omprocess_date			VARCHAR(12),"//ADDED TO STORE OMPROCESS DATE @AUTHOR:MADHUREE-10NOV2021
/* END CODE TO ADD COLUMNS FOR STORING THE MSG SENT STATUS & SENT DATE @AUTHOR:MADHUREE-07JUNE2020 */
."kitty_mondep_approve_status                     VARCHAR(40),
kitty_mondep_admin_approve_status               VARCHAR(40),
kitty_paid_amt                                  FLOAT,
kitty_rate_amt                                  FLOAT,
kitty_wt_amt                                    FLOAT,
kitty_mondep_EMI_due_amt                        VARCHAR(40),
kitty_mondep_EMI_month                          VARCHAR(8),
last_column                VARCHAR(1))";


if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>