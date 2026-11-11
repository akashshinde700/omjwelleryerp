<?php /**
 * 
 * Created on Sep 4, 2011 12:22:17 AM
 *
 * @FileName: omtbstockshare.php
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

$query = "CREATE TABLE IF NOT EXISTS stock_share (
stsh_id	 				INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
stsh_own_id				VARCHAR(16), 
stsh_sttr_id				VARCHAR(16), 
stsh_cust_id				VARCHAR(16),
stsh_count				VARCHAR(8),
stsh_comment   				VARCHAR(100),
stsh_date 				DATETIME,
stsh_upd_sts				VARCHAR(10),
stsh_staff_id                        	VARCHAR(16),
last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
//echo "Girvi Principal Table Created Successfully.\n";
?>