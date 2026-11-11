<?php

/*
 * Created on Mar 13, 2011 6:54:14 PM
 *
 * @FileName: omtbgvap.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: eMunim
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

//to add new fields and unique key @AUTHOR: SANDY17DEC13
$query = "CREATE TABLE IF NOT EXISTS girvi_principal (
girv_prin_id	 				INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
girv_prin_girv_id				VARCHAR(16), 
girv_prin_cust_id				VARCHAR(16),
girv_prin_own_id				VARCHAR(16), 
girv_prin_firm_id 				VARCHAR(16),
girv_prin_jrnlid                                INT,
girv_prin_main_prin_amt				FLOAT,
girv_prin_prin_amt 				FLOAT,
girv_prin_prin_roi 				FLOAT,
girv_prin_cust_roi 				FLOAT,
girv_prin_prin_oroi 				FLOAT,
girv_prin_prin_roi_id 				VARCHAR(16),
girv_prin_roi_type				VARCHAR(16), 
girv_prin_prin_DOB				VARCHAR(50),
girv_prin_prin_DOR				VARCHAR(50),
girv_prin_total_time				VARCHAR(50),
girv_prin_total_amt				FLOAT,
girv_prin_total_int				FLOAT,
girv_prin_paid_int				FLOAT,
girv_prin_paid_amt				FLOAT,
girv_prin_discount_amt                          FLOAT,
girv_prin_ent_dat 				DATETIME,
girv_prin_upd_sts				VARCHAR(50),
girv_prin_comm 					VARCHAR(2000),
girv_prin_pre_id                                VARCHAR(16),
girv_prin_post_id                               INT,
girv_prin_transfer_id                           VARCHAR(30),
girv_prin_trans_firmId                          VARCHAR(20),
girv_prin_trans_ml_id                           VARCHAR(20),
girv_prin_trans_loan_id                         VARCHAR(20),
girv_prin_comm_id				INT,
girv_prin_cr_cash_acc_id			VARCHAR(16),
girv_prin_cr_cheque_acc_id			VARCHAR(16),
girv_prin_cr_card_acc_id			VARCHAR(16),
girv_prin_cr_online_acc_id			VARCHAR(16),
girv_prin_cash_narratn				VARCHAR(20),
girv_prin_cheque_narratn			VARCHAR(20),
girv_prin_card_narratn			        VARCHAR(20),
girv_prin_online_narratn			VARCHAR(20),
girv_prin_cash_amt				VARCHAR(16),
girv_prin_cheque_amt                            VARCHAR(16),
girv_prin_card_amt                              VARCHAR(16),
girv_prin_online_amt                            VARCHAR(16),
girv_prin_dr_acc_id				VARCHAR(16),
girv_prin_cr_acc_id				VARCHAR(16),
girv_prin_cash_acc_id                           VARCHAR(16),
girv_prin_loan_acc_id                           VARCHAR(16),
girv_prin_int_rec_acc_id                        VARCHAR(16),
girv_prin_disc_acc_id                           VARCHAR(16),
girv_prin_staff_id                        	VARCHAR(16),
girv_prin_hindi_DOB                       	VARCHAR(50),
girv_prin_hindi_DOR                             VARCHAR(50),
girv_prin_hindi_tithi                           VARCHAR(16),
girv_prin_hindi_paksh                           VARCHAR(16),
girv_prin_rel_tithi                             VARCHAR(16),
girv_prin_image_id                              VARCHAR(16),
girv_prin_rel_paksh                             VARCHAR(16),
girv_prin_paid_oint                             VARCHAR(16),
girv_prin_paid_oamt                             VARCHAR(16),
last_column                VARCHAR(1),UNIQUE KEY(girv_prin_pre_id,girv_prin_post_id))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
//echo "Girvi Principal Table Created Successfully.\n";
?>