<?php

/*
 * **************************************************************************************
 * @tutorial: Bar Code Print Panel Table
 * **************************************************************************************
 * 
 * Created on Apr 30, 2012 10:42:40 PM
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

$query = "CREATE TABLE IF NOT EXISTS barcode_printpanel (
bcpp_id 			INT NOT NULL PRIMARY KEY AUTO_INCREMENT, 
bcpp_custid 			VARCHAR(40), 
bcpp_girviid 			VARCHAR(40), 
bcpp_date 			DATETIME,
last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>
