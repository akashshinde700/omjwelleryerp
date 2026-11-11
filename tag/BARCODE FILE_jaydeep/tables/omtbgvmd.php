<?php

/*
 * Created on Mar 13, 2011 6:54:14 PM
 *
 * @FileName: omtbgvmd.php
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

//Start Code To Alter Girvi Table for girvi girv_mondep_EMI_no, girv_mondep_EMI_end_DOB,girv_mondep_EMI_status,girv_mondep_EMI_int_amt  @AUTHOR:ANUJA06OCT15
$query = "CREATE TABLE IF NOT EXISTS girvi_money_deposit (
girv_mondep_id	 				INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
girv_mondep_girv_id				VARCHAR(16), 
girv_mondep_cust_id				VARCHAR(16),
girv_mondep_own_id				VARCHAR(16),
girv_mondep_firm_id				VARCHAR(16),
girv_mondep_prin_amt 				VARCHAR(16),
girv_mondep_int_amt 				VARCHAR(16),
girv_mondep_oint_amt                            VARCHAR(16),
girv_mondep_custody_int_amt 			INT," //ADDED COLUMN TO STORE ORDINARY INTEREST AMT @AUTHOR:MADHUREE-08MAY2021
."girv_mondep_disc_amt                          INT," //ADDED COLUMN TO STORE ORDINARY INTEREST AMT @AUTHOR:MADHUREE-08MAY2021
."girv_mondep_extra_amt                         INT," //ADDED COLUMN TO STORE EXTRA AMOUNT @AUTHOR:MADHUREE-19NOV2021
."girv_mondep_oextra_amt                         INT,"
."girv_mondep_odisc_amt                         INT,"
."girv_mondep_grace_fine_amt                         INT,"
."girv_mondep_amt 				VARCHAR(16),
girv_mondep_oamt                                VARCHAR(16)," //ADDED COLUMN TO STORE ORDINARY DEPOSITED TOTAL AMT @AUTHOR:MADHUREE-08MAY2021
."girv_mondep_cash_paid_amt                     VARCHAR(16)," . //ADDED TO STORE CASH PAID AMOUNT FOR LOAN MONEY DEPOSIT @AUTHOR:MADHUREE-20NOV2021
"girv_mondep_ocash_paid_amt                     VARCHAR(16)," .
"girv_mondep_cheque_paid_amt                    VARCHAR(16)," . //ADDED TO STORE CHEQUE PAID AMOUNT FOR LOAN MONEY DEPOSIT @AUTHOR:MADHUREE-20NOV2021
"girv_mondep_ocheque_paid_amt                     VARCHAR(16)," .
"girv_mondep_card_paid_amt                      VARCHAR(16)," . //ADDED TO STORE CARD PAID AMOUNT FOR LOAN MONEY DEPOSIT @AUTHOR:MADHUREE-20NOV2021
"girv_mondep_ocard_paid_amt                     VARCHAR(16)," .
"girv_mondep_online_paid_amt                    VARCHAR(16)," . //ADDED TO STORE ONLINE PAID AMOUNT FOR LOAN MONEY DEPOSIT @AUTHOR:MADHUREE-20NOV2021
"girv_mondep_oonline_paid_amt                     VARCHAR(16)," .
"girv_mondep_prin_amt_int 			INT,
girv_mondep_int_amt_int 			INT,
girv_mondep_amt_int 				VARCHAR(16),
girv_mondep_date				VARCHAR(50),
girv_mondep_other_lang_date			VARCHAR(50)," //COLUMN ADDED TO STORE OTHER LANGAUAGE MONEY DEPOSITE DATE @AUTHOR:MADHUREE-03JAN2022
."girv_mondep_months				VARCHAR(20),
girv_mondep_DOR                                 VARCHAR(50),
girv_mondep_ent_dat 				DATETIME,
girv_mondep_upd_sts				VARCHAR(50),
girv_mondep_comm				VARCHAR(2000),
girv_mondep_jrnlid				INT,
girv_mondepd_sts				VARCHAR(50),
girv_mondepd_entry_code				VARCHAR(24),
girv_mondepd_comm_id				INT,
girv_mondepd_dr_acc_id                          VARCHAR(16),".
"girv_mondepd_dr_cheque_acc_id                  VARCHAR(16)," . //ADDED TO STORE CHEQUE AMOUNT DEPOSIT ACC ID @AUTHOR:MADHUREE-20NOV2021
"girv_mondepd_dr_card_acc_id                    VARCHAR(16)," . //ADDED TO STORE CARD AMOUNT DEPOSIT ACC ID @AUTHOR:MADHUREE-20NOV2021
"girv_mondepd_dr_online_acc_id                  VARCHAR(16)," . //ADDED TO STORE ONLINE AMOUNT DEPOSIT ACC ID @AUTHOR:MADHUREE-20NOV2021
"girv_mondepd_cr_acc_id                         VARCHAR(16),
girv_mondepd_dr_cash_acc_id                     VARCHAR(16),
girv_mondepd_loan_acc_id                        VARCHAR(16),
girv_mondepd_int_rec_acc_id                     VARCHAR(16),
girv_mondepd_disc_acc_id                        VARCHAR(16),
girv_mondepd_extra_amt_acc_id                   VARCHAR(16),
girv_mondepd_cust_amt_acc_id                   VARCHAR(16),
girv_mondepd_dr_acc_id_int                      VARCHAR(16),
girv_mondepd_cr_acc_id_int                      VARCHAR(16),
girv_mondepd_dr_cash_acc_id_int                 VARCHAR(16),
girv_mondepd_loan_acc_id_int                    VARCHAR(16),
girv_mondepd_int_rec_acc_id_int                 VARCHAR(16),
girv_mondepd_disc_acc_id_int                    VARCHAR(16),
girv_mondepd_staff_id                   	VARCHAR(16),
girv_mondep_hindi_date                   	VARCHAR(50),
girv_mondep_hindi_DOR                           VARCHAR(50),
girv_mondep_tithi                        	VARCHAR(16),
girv_mondep_tithi_DOR                           VARCHAR(16),
girv_mondep_paksh                       	VARCHAR(16),
girv_mondep_paksh_DOR                           VARCHAR(16),
girv_mondep_EMI_no                       	VARCHAR(40),
girv_mondep_EMI_start_DOB                       VARCHAR(40),
girv_mondep_EMI_end_DOB                       	VARCHAR(40),
girv_mondep_EMI_status                       	VARCHAR(40),
girv_mondep_EMI_paid_date                       VARCHAR(40),
girv_mondep_EMI_total_amt                     	VARCHAR(40),
girv_mondep_EMI_amt                      	VARCHAR(40),
girv_mondep_fine_amt                            VARCHAR(255),
girv_mondep_paid_fine_amt                       VARCHAR(255),
girv_mondep_fine_jrnlid                              VARCHAR(255),
girv_mondep_fine_jrtr                           VARCHAR(255),
girv_mondep_EMI_staff_id                      	VARCHAR(40),
girv_mondep_voucher_no                      	VARCHAR(10),".
//  
// ADDED CODE FOR TRANSACTION TYPE @AUTHOR:PRIYANKA-17MAR2023        
"girv_mondep_trans_type			        VARCHAR(16),
girv_mondep_date_history                      	VARCHAR(50),". //ADDED TO STORE DATE HISTORY FINACE @AUTHOR:YUVRAJ -03012023
"girv_mondep_amt_history                      	VARCHAR(50),". //ADDED TO STORE AMT HISTORY FINACE @AUTHOR:YUVRAJ -03012023
"girv_mondep_rollbacked_amt_history             VARCHAR(255),". //ADDED TO STORE RollBack HISTORY FINACE @AUTHOR:VINOD-04-APR2023
"girv_mondep_rollbacked_date_history             VARCHAR(255),". //ADDED TO STORE RollBack HISTORY FINACE @AUTHOR:VINOD-04-APR2023
"girv_mondep_fine_amt_history                   VARCHAR(255),".
"girv_mondep_paid_emi_history                   VARCHAR(255),".
"girv_mondep_payment_mode_history               VARCHAR(100),". //ADDED TO STORE trans Mode HISTORY FINACE @AUTHOR:VINOD-27-FEB2023
"last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
//Start Code To Alter Girvi Table for girvi girv_mondep_EMI_no, girv_mondep_EMI_end_DOB,girv_mondep_EMI_status,girv_mondep_EMI_int_amt  @AUTHOR:ANUJA06OCT15
//echo "Girvi Money Deposit Table Created Successfully.\n";
?>