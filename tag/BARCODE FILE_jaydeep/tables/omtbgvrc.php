<?php

/*
 * Created on Mar 13, 2011 6:53:20 PM
 *
 * @FileName: omtbgvrc.php
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

$query = "CREATE TABLE IF NOT EXISTS girvi_rel_cart (
gvrelc_id				INT NOT NULL PRIMARY KEY AUTO_INCREMENT, 
gvrelc_girvi_id				VARCHAR(16),
gvrelc_cust_id				VARCHAR(16),
gvrelc_own_id				VARCHAR(16), 
gvrelc_firm_Name			VARCHAR(50),
gvrelc_firm_girvi_no			VARCHAR(16),
gvrelc_cust_fname 			VARCHAR(50),
gvrelc_cust_lname 			VARCHAR(50),
gvrelc_cust_city			VARCHAR(50),
gvrelc_main_prin_amt			INT,
gvrelc_prin_amt				INT,
gvrelc_total_int			FLOAT,
gvrelc_DOB				VARCHAR(50),
gvrelc_paid_amt				INT,
gvrelc_discount_amt			INT,
gvrelc_ent_dat 				DATETIME,
gvrelc_upd_sts				VARCHAR(50),
gvrelc_comm 				VARCHAR(2000),
last_column                VARCHAR(1))AUTO_INCREMENT=100001";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>