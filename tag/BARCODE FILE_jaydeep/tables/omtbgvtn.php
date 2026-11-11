<?php

/*
 * **************************************************************************************
 * @tutorial: Girvi Transfer Table
 * **************************************************************************************
 * 
 * Created on Jun 17, 2012 2:20:39 PM
 *
 * @FileName: omtbgvtn.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: OMREVO
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

//TO ADD NEW FIELDS AND REMOVE UNIQUE KEY @AUTHOR: SANDY17DEC13
//START CODE TO ADD COLUMN gtrans_setl_sts @OMMODTAG SHRI_12AUG15
$query = "CREATE TABLE IF NOT EXISTS girvi_transfer(
gtrans_id				INT NOT NULL PRIMARY KEY AUTO_INCREMENT, 
gtrans_cust_id				VARCHAR(16),
gtrans_girvi_id				VARCHAR(16),
gtrans_prin_id                          VARCHAR(30),
gtrans_own_id				VARCHAR(16), 
gtrans_firm_id 				VARCHAR(16),
gtrans_jrnlid     			INT,
gtrans_firm_type                        VARCHAR(100),
gtrans_firm_girvi_no			INT,
gtrans_exist_firm_id 			VARCHAR(16),
gtrans_prin_amt 			INT,
gtrans_ROI				FLOAT,
gtrans_IROI				FLOAT,
gtrans_ROI_Id				INT,
gtrans_ROI_typ				VARCHAR(30),
gtrans_pre_serial_num                   VARCHAR(10),
gtrans_serial_num			INT,
gtrans_packet_num			VARCHAR(30),
gtrans_token_num			VARCHAR(50),
gtrans_DOB				VARCHAR(50),
gtrans_DOR				VARCHAR(50),
gtrans_total_time			VARCHAR(50),
gtrans_total_int			FLOAT,
gtrans_total_amt			FLOAT,
gtrans_paid_amt				FLOAT,
gtrans_paid_int				FLOAT,
gtrans_discount_amt			FLOAT,
gtrans_ent_dat 				DATETIME,
gtrans_upd_sts				VARCHAR(50),
gtrans_monthly_intopt                   VARCHAR(10),
gtrans_compounded_opt                   VARCHAR(15),
gtrans_int_opt                          VARCHAR(10),
gtrans_comm 				VARCHAR(2000),
gtrans_time_period                      VARCHAR(30),
gtrans_acc_id                           VARCHAR(30),
gtrans_cheque_no                        VARCHAR(30),
gtrans_pay_oth_info                     VARCHAR(100),
gtrans_prin_typ                         VARCHAR(20),
gtrans_trans_loan_id                    VARCHAR(30),
gtrans_cr_acc_id		        VARCHAR(50),
gtrans_cash_acc_id                      VARCHAR(16),
gtrans_loan_acc_id                      VARCHAR(16),
gtrans_int_rec_acc_id                   VARCHAR(16),
gtrans_disc_acc_id                      VARCHAR(16),
global_gt_pre_serial_num                VARCHAR(10),
global_gt_serial_num			INT,
gtrans_staff_id                       	VARCHAR(16),
gtrans_hindi_DOB                        VARCHAR(50),
gtrans_hindi_DOR                        VARCHAR(50),
gtrans_ltran_id                         INT,
gtrans_lstran_id                        VARCHAR(50),
gtrans_act_sts                          VARCHAR(16),
gtrans_trans_type                       VARCHAR(30),
gtrans_rel_sts                          VARCHAR(16),
gtrans_fst_mn_int                       VARCHAR(16),
gtrans_interest_amt                     FLOAT, 
last_column                VARCHAR(1),UNIQUE KEY (gtrans_pre_serial_num,gtrans_serial_num))AUTO_INCREMENT=1001"; //unique key added @Author:PRIYA06DEC14
//START CODE TO ADD COLUMN gtrans_setl_sts @OMMODTAG SHRI_12AUG15
if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
//gtrans_trans_loan_id added @Author:PRIYA09DEC14
?>