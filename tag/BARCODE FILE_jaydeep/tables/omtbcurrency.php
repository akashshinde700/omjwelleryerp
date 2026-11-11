<?php
/*
 * **************************************************************************************
 * @tutorial: DENOMINATIONS TABLE FILE
 * ************************************************************************************** 
 *
 * @FileName: omtbcurrency.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: omunim
 * @version 2.7.290
 * @Copyright (c) 2023 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2023 SoftwareGen Technologies
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php
if ($ownerId == '') {
    $ownerId = $dgGUId;
}
if ($ownerId == '') {
    $ownerId = $_SESSION['sessionOwnerId'];
}
if ($ownerId == '') {
    $ownerId = $_SESSION['sessiondgGUId'];
}
//
$query = "CREATE TABLE IF NOT EXISTS currency (
currency_id              INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
currency_own_id	         VARCHAR(16),
currency_firm_id         VARCHAR(50),
currency_value           VARCHAR(10),
currency_type            VARCHAR(10),
currency_name	         VARCHAR(64),
currency_opening_count	 VARCHAR(16),
currency_in_count	 VARCHAR(16),
currency_out_count       VARCHAR(16),
currency_closing_count 	 VARCHAR(16),
currency_amount          VARCHAR(16),
currency_last_column     VARCHAR(16)) AUTO_INCREMENT=1";
//
if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//
// To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
//
//
?>