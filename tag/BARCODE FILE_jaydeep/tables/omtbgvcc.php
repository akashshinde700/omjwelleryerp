<?php /**
 * 
 * Created on Sep 4, 2011 12:22:17 AM
 *
 * @FileName: omtbgvcc.php
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
$query = "CREATE TABLE IF NOT EXISTS girvi_comments (
girv_comm_id	 				INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
girv_comm_girv_id				VARCHAR(16), 
girv_comm_girv_dep_id				VARCHAR(16), 
girv_comm_cust_id				VARCHAR(16),
girv_comm_own_id				VARCHAR(16), 
girv_comm_comm   				VARCHAR(5000),
girv_comm_ent_dat 				DATETIME,
girv_comm_upd_sts				VARCHAR(50),
girv_comm_last_loan_date			VARCHAR(16),
girv_comm_last_loan_prin_amt			INT,
girv_comm_dep_type				VARCHAR(30),
girv_comm_last_loan_tithi                       VARCHAR(16),
girv_comm_last_loan_paksha                      VARCHAR(16),
girv_comm_staff_id                        	VARCHAR(16),
last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
//echo "Girvi Principal Table Created Successfully.\n";
?>