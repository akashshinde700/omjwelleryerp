<?php

/*
 * **************************************************************************************
 * @tutorial: Staff Table
 * **************************************************************************************
 *
 * Created on 2 Dec, 2012 1:25:36 PM
 *
 * @FileName: omtbstfe.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: omunim
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
$query = "CREATE TABLE IF NOT EXISTS omstaff (
staff_id 		INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
staff_pstaff_id	        VARCHAR(10),
staff_ustaff_id	        INT,
staff_owner_id		VARCHAR(16),
staff_acc_id            VARCHAR(10),  
staff_login_id		VARCHAR(8), 
staff_password		VARCHAR(40),
staff_ipassword		VARCHAR(40),
staff_firm_id		VARCHAR(16),
staff_website 		VARCHAR(100),
staff_pacc_id 		VARCHAR(16),
staff_sacc_id 		VARCHAR(16),
staff_category          VARCHAR(16),
staff_fname 		VARCHAR(32),
staff_lname 		VARCHAR(32),
staff_father_name 	VARCHAR(50),
staff_PAN_number 	VARCHAR(50),
staff_DOB		VARCHAR(50),
staff_marriage_any	VARCHAR(50),
staff_gender		VARCHAR(2),
staff_qualification	VARCHAR(50),
staff_add 		VARCHAR(500),
staff_city 		VARCHAR(50),
staff_pincode 		VARCHAR(6),
staff_state 		VARCHAR(50),
staff_country 		VARCHAR(50),
staff_phone 		VARCHAR(16),
staff_mobile		VARCHAR(16), 
staff_email 		VARCHAR(100),
staff_id_no		VARCHAR(50),
staff_op_cash_bal	VARCHAR(50),
staff_op_cash_bal_crdr	VARCHAR(5),
staff_since 		DATETIME,
staff_reference		VARCHAR(50),
staff_priority 		VARCHAR(16),
staff_status 		VARCHAR(16),
staff_loyal_points	VARCHAR(16),
staff_snap 		LONGBLOB,
staff_snap_thumb        LONGBLOB,
staff_snap_fname	VARCHAR(150),
staff_snap_ftype	VARCHAR(20),
staff_snap_fsize	VARCHAR(40),
staff_snap_fszMB	VARCHAR(40),
staff_other_info	VARCHAR(500),
staff_staff_id          VARCHAR(16),
last_column                VARCHAR(1),UNIQUE KEY (staff_pstaff_id,staff_ustaff_id),UNIQUE KEY (staff_login_id))AUTO_INCREMENT=10001";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>