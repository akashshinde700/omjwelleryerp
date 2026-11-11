<?php

/* //To create table ml_loan @AUTHOR:SANDY14NOV13
 * Created on Mar 13, 2011 6:53:20 PM
 *
 * @FileName: omtbmlln.php
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

$query = "CREATE TABLE IF NOT EXISTS ml_loan (
ml_id					INT NOT NULL PRIMARY KEY AUTO_INCREMENT, 
ml_lender_id				VARCHAR(16),
ml_type                                 VARCHAR(16),
ml_own_id				VARCHAR(16), 
ml_jrnlid                               INT,
ml_firm_id 				VARCHAR(16),
ml_firm_mli_no                          INT,
ml_lender_fname 			VARCHAR(50),
ml_lender_lname 			VARCHAR(50),
ml_lender_Address 			VARCHAR(500),
ml_lender_city				VARCHAR(50),
ml_main_prin_amt			INT,
ml_prin_amt				INT,
ml_ROI                                  FLOAT,
ml_IROI                                 FLOAT,
ml_ROI_Id				INT,
ml_ROI_typ				VARCHAR(30),
ml_cust_mli_num                         INT,
ml_pre_serial_num			VARCHAR(5),
ml_serial_num				INT,
ml_packet_num				INT,
ml_DOB                                  VARCHAR(50),
ml_new_DOB				VARCHAR(50),
ml_DOR                                  VARCHAR(50),
ml_loan_type                            VARCHAR(30),
ml_int_opt				VARCHAR(10),
ml_monthly_intopt                       VARCHAR(30),
ml_compounded_opt			VARCHAR(15),
ml_total_time				VARCHAR(50),
ml_total_int				FLOAT,
ml_total_amt				FLOAT,
ml_paid_amt				FLOAT,
ml_paid_int				FLOAT,
ml_discount_amt                         FLOAT,
ml_ent_dat 				DATETIME,
ml_upd_sts				VARCHAR(50),
ml_transfer_id                          INT,
ml_comm 				VARCHAR(2000),
ml_acc_id				VARCHAR(50),
ml_cheque_no				VARCHAR(50),
ml_pay_other_info			VARCHAR(100), 
ml_ln_cr_dr                             VARCHAR(10),
ml_cr_acc_id				VARCHAR(16),
ml_cash_acc_id                          VARCHAR(16),
ml_loan_acc_id                          VARCHAR(16),
ml_int_acc_id                           VARCHAR(16),
ml_disc_acc_id                          VARCHAR(16),
ml_staff_id                             VARCHAR(16),
last_column                VARCHAR(1),UNIQUE KEY (ml_pre_serial_num,ml_serial_num))AUTO_INCREMENT=1";//change in auto inc @AUTHOR: SANDY27DEC13
if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>
