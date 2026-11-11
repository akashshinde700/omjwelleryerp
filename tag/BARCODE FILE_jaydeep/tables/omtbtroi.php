<?php
/*
 * **************************************************************************************
 * @tutorial: Table for TROI @Author: KHUSH23JAN13
 * **************************************************************************************
 * 
 * Created on Jan 23, 2013 6:39:01 PM
 *
 * @FileName: omtbtroi.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: omunim
 * @version 1.0.1
 * @Copyright (c) 2010 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2012 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE: Modified by @Author: KHUSH24JAN13
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php
$query = "CREATE TABLE IF NOT EXISTS troi (
troi_id			INT NOT NULL PRIMARY KEY AUTO_INCREMENT, 
troi_own_id		VARCHAR(16),
troi_value 		FLOAT,
tiroi_value 		FLOAT,
troi_type 		VARCHAR(10),
troi_default 		VARCHAR(10),
troi_monthly_opt	VARCHAR(3),
troi_since 		DATETIME,
troi_comm         	VARCHAR(100),
troi_staff_id           VARCHAR(16),
last_column                VARCHAR(1),UNIQUE KEY (troi_value),UNIQUE KEY (tiroi_value))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>