<?php

/*
 * Created on Mar 13, 2011 6:54:14 PM
 *
 * @FileName: ormlmndp.php
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

$query = "CREATE TABLE IF NOT EXISTS ml_transaction (
ml_trans_id	 				INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
ml_trans_type                                   VARCHAR(16),
ml_trans_mondep_id                              INT,
ml_trans_mondep_loan_id				VARCHAR(16), 
ml_trans_mondep_lender_id			VARCHAR(16),
ml_trans_mondep_own_id				VARCHAR(16),
ml_trans_mondep_firm_id				VARCHAR(16),
ml_trans_mondep_prin_amt 			INT,
ml_trans_mondep_int_amt 			INT,
ml_trans_mondep_amt 				VARCHAR(16),
ml_trans_mondep_date				VARCHAR(50),
ml_trans_mondep_DOR                             VARCHAR(50),
ml_trans_ent_dat 				DATETIME,
ml_trans_upd_sts				VARCHAR(50),
ml_trans_mondep_comm				VARCHAR(2000),
ml_trans_prin_id	                        INT,
ml_trans_prin_main_prin_amt			FLOAT,
ml_trans_prin_prin_amt 				FLOAT,
ml_trans_prin_prin_roi 				FLOAT,
ml_trans_prin_prin_DOB				VARCHAR(50),
ml_trans_prin_prin_DOR				VARCHAR(50),
ml_trans_prin_total_time			VARCHAR(50),
ml_trans_prin_total_amt				FLOAT,
ml_trans_prin_total_int				FLOAT,
ml_trans_prin_paid_int				FLOAT,
ml_trans_prin_paid_amt				FLOAT,
ml_trans_prin_discount_amt                      FLOAT,
ml_trans_prin_comm 				VARCHAR(2000),
ml_trans_mondep_jrnlid				INT,
ml_trans_cr_dr                                  VARCHAR(10),
ml_trans_staff_id                               VARCHAR(16),
last_column                                     VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>
