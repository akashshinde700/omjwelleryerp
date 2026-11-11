<?php

/*
 * **************************************************************************************
 * @tutorial: Rfid Gate History Table
 * **************************************************************************************
 * 
 * Created on Jul 02, 2022 11:13:00 PM
 *
 * @FileName: omtbgbcp.php
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

$query = "CREATE TABLE IF NOT EXISTS rfid_gate_history (
rfid_id 			INT NOT NULL PRIMARY KEY AUTO_INCREMENT, 
rfid_gate_tag_id 		VARCHAR(100),
rfid_scan_status 		VARCHAR(3),
rfid_gate_datetime 		DATETIME,
last_column                VARCHAR(1))
AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>
