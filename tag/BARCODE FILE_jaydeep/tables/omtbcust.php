<?php

/*
 * Created on 01-Feb-2011 10:56:17 PM
 *
 * @FileName: omtbcust.php
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

//require_once 'system/omssopin.php';
//ALTER TABLE AS IN OMMPTBUPD @AUTHOR: SANDY16DEC13
$query = "CREATE TABLE IF NOT EXISTS customer (
cust_id 		INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
cust_owner_id		VARCHAR(16),
cust_firm_id		VARCHAR(16), 
cust_type               VARCHAR(16),
cust_pcust_id	        VARCHAR(10),
cust_ucust_id	        INT,
cust_acc_id             VARCHAR(10),                                                      
cust_fname 		VARCHAR(32),
cust_lname 		VARCHAR(32),
cust_father_name 	VARCHAR(50),
cust_mother_name 	VARCHAR(50),        
cust_DOB		VARCHAR(50),
cust_sex		VARCHAR(2),
cust_qualification	VARCHAR(50),
cust_add 		VARCHAR(100),
cust_city 		VARCHAR(50),
cust_pincode 		VARCHAR(6),
cust_state 		VARCHAR(50),
cust_country 		VARCHAR(50),
cust_phone 		VARCHAR(16),
cust_mobile		VARCHAR(16), 
cust_email 		VARCHAR(100),
cust_since 		DATETIME,
cust_reference		VARCHAR(50),
cust_priority 		VARCHAR(16),
cust_status 		VARCHAR(16),
cust_loyal_points	VARCHAR(16),
cust_snap 		LONGBLOB,
cust_snap_desc 		VARCHAR(200),
cust_snap_thumb         LONGBLOB,
cust_snap_fname		VARCHAR(150),
cust_snap_ftype		VARCHAR(20),
cust_snap_fsize		VARCHAR(40),
cust_snap_fszMB		VARCHAR(40),
cust_no_of_girvi        INT,
cust_other_info		VARCHAR(100),
cust_staff_login_id	VARCHAR(8),
cust_interest		VARCHAR(20),
cust_comm_upd_date      VARCHAR(100),
cust_snap1 		LONGBLOB,
cust_snap1_desc 	VARCHAR(200),
cust_snap1_thumb        LONGBLOB,
cust_snap1_fname	VARCHAR(150),
cust_snap1_ftype	VARCHAR(20),
cust_snap1_fsize	VARCHAR(40),
cust_snap1_fszMB	VARCHAR(40),
cust_snap2 		LONGBLOB,
cust_snap2_desc 	VARCHAR(200),
cust_snap2_thumb        LONGBLOB,
cust_snap2_fname	VARCHAR(150),
cust_snap2_ftype	VARCHAR(20),
cust_snap2_fsize	VARCHAR(40),
cust_snap2_fszMB	VARCHAR(40),
cust_snap3 		LONGBLOB,
cust_snap3_desc 	VARCHAR(200),
cust_snap3_thumb        LONGBLOB,
cust_snap3_fname	VARCHAR(150),
cust_snap3_ftype	VARCHAR(20),
cust_snap3_fsize	VARCHAR(40),
cust_snap3_fszMB	VARCHAR(40),
cust_snap4 		LONGBLOB,
cust_snap4_desc 	VARCHAR(200),
cust_snap4_thumb        LONGBLOB,
cust_snap4_fname	VARCHAR(150),
cust_snap4_ftype	VARCHAR(20),
cust_snap4_fsize	VARCHAR(40),
cust_snap4_fszMB	VARCHAR(40),
cust_snap5 		LONGBLOB,
cust_snap5_desc 	VARCHAR(200),
cust_snap5_thumb        LONGBLOB,
cust_snap5_fname	VARCHAR(150),
cust_snap5_ftype	VARCHAR(20),
cust_snap5_fsize	VARCHAR(40),
cust_snap5_fszMB	VARCHAR(40),
cust_snap6 		LONGBLOB,
cust_snap6_desc 	VARCHAR(200),
cust_snap6_thumb        LONGBLOB,
cust_snap6_fname	VARCHAR(150),
cust_snap6_ftype	VARCHAR(20),
cust_snap6_fsize	VARCHAR(40),
cust_snap6_fszMB	VARCHAR(40),
cust_snap7 		LONGBLOB,
cust_snap7_desc 	VARCHAR(200),
cust_snap7_thumb        LONGBLOB,
cust_snap7_fname	VARCHAR(150),
cust_snap7_ftype	VARCHAR(20),
cust_snap7_fsize	VARCHAR(40),
cust_snap7_fszMB	VARCHAR(40),
cust_snap8 		LONGBLOB,
cust_snap8_desc 	VARCHAR(200),
cust_snap8_thumb        LONGBLOB,
cust_snap8_fname	VARCHAR(150),
cust_snap8_ftype	VARCHAR(20),
cust_snap8_fsize	VARCHAR(40),
cust_snap8_fszMB	VARCHAR(40),
cust_snap9 		LONGBLOB,
cust_snap9_desc 	VARCHAR(200),
cust_snap9_thumb        LONGBLOB,
cust_snap9_fname	VARCHAR(150),
cust_snap9_ftype	VARCHAR(20),
cust_snap9_fsize	VARCHAR(40),
cust_snap9_fszMB	VARCHAR(40),
cust_snap10 		LONGBLOB,
cust_snap10_desc 	VARCHAR(200),
cust_snap10_thumb        LONGBLOB,
cust_snap10_fname	VARCHAR(150),
cust_snap10_ftype	VARCHAR(20),
cust_snap10_fsize	VARCHAR(40),
cust_snap10_fszMB	VARCHAR(40),
cust_relation_circle	VARCHAR(500),
cust_shop_name         	VARCHAR(200),
last_column                VARCHAR(1),UNIQUE KEY (cust_ucust_id))AUTO_INCREMENT=10001"; //change in UNIQUE KEY TO remove cust_pcust_id @AUTHOR: SANDY16DEC13

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
//echo "Customer Table Created Successfully.\n";
?>