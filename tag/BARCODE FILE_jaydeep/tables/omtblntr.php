<?php

/*
 * **************************************************************************************
 * @Description: Create table for loan transaction in girvi unsettled option.
 * **************************************************************************************
 *
 * Created on Aug 24, 2015 12:20:26 PM
 *
 * @FileName: omtblntr.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: 2
 * @version 1.0.1
 * @Copyright (c) 2015 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2015 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 * 
 * Project Name: Online Munim ERP Accounting Software 1.0.0
 * Version: 1.0.0
 * Website: http://www.omunim.com/
 * Contact: info@omunim.com
 * Follow: www.twitter.com/omunim
 * Like: www.facebook.com/omunim
 * Purchase: http://www.omunim.com/buy.html
 * License: You must have a valid license purchased only from Online Munim.
 */
?>
<?php

$query = "CREATE TABLE IF NOT EXISTS trans_loan_settle_trans (
lstran_id                                INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
lstran_own_id				 VARCHAR(16), 
lstran_ent_dat 				 DATETIME,
lstran_dat				 VARCHAR(50),
lstran_settle_amt                        VARCHAR(50),
lstran_amt_left                          VARCHAR(50),
lstran_amt_bal                           VARCHAR(50),
last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>