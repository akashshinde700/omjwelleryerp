<?php
/*
 * **************************************************************************************
 * @tutorial: UNITS TABLE FILE
 * **************************************************************************************
 * 
 * Created on 29 Apr, 2018 5:02:56 PM
 *
 * @FileName: omtbunits.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: omunim
 * @version 2.6.0
 * @Copyright (c) 2018 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2018 SoftwareGen Technologies
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php
//
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
$query = "CREATE TABLE IF NOT EXISTS units (
unit_id          INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
unit_own_id	 VARCHAR(16),
unit_category    VARCHAR(50),
unit_name	 VARCHAR(32),
unit_type	 VARCHAR(10),
unit_panel	 VARCHAR(10),
unit_info        VARCHAR(100),
unit_since 	 DATETIME,
unit_last_column VARCHAR(16))AUTO_INCREMENT=1";
//
if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//
// To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
//
//
//

?>