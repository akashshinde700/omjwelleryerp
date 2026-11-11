<?php
/*
 * **************************************************************************************
 * @tutorial: Layout Panel Table
 * **************************************************************************************
 * 
 * Created on Jun 24, 2013 6:05:34 PM
 *
 * @FileName: omtblypn.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: omunim
 * @version 1.0.1
 * @Copyright (c) 2013 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2013 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php
$query = "CREATE TABLE IF NOT EXISTS omlayout(
omly_id             INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
omly_own_id         VARCHAR(16),
omly_option	    VARCHAR(50),
omly_value	    TEXT,
omly_indicator	    VARCHAR(10),
omly_panel_name	    VARCHAR(50),
omly_other_info	    VARCHAR(50),
last_column         VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}

$query2="ALTER TABLE omlayout
MODIFY COLUMN omly_value TEXT";

if (!mysqli_query($conn, $query2)) {
    die('Error: ' . mysqli_error($conn));
}
$sessionOwnerId = $_SESSION['sessionOwnerId'];
if ($sessionOwnerId != '' && $sessionOwnerId != NULL) {
    $optName = 'setBarcodeToRFID';
    $checkSql = "SELECT omly_id FROM omlayout WHERE omly_own_id = '$sessionOwnerId' AND omly_option = '$optName' LIMIT 1";
    $resCheck = mysqli_query($conn, $checkSql);   
    if (mysqli_num_rows($resCheck) > 0) {
        $upSql = "UPDATE omlayout SET omly_value = 'YES' WHERE omly_own_id = '$sessionOwnerId' AND omly_option = '$optName'";
        mysqli_query($conn, $upSql);
    } else {
        $insSql = "INSERT INTO omlayout (omly_own_id, omly_option, omly_value, omly_indicator, omly_panel_name, omly_other_info, last_column) 
                   VALUES ('$sessionOwnerId', '$optName', 'YES',NULL,NULL,NULL,NULL)";
        mysqli_query($conn, $insSql);
    }
}

//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>