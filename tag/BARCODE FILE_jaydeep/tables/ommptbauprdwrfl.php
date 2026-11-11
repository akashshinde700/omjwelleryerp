<?php

/*
 * **************************************************************************************
 * @tutorial: 
 * **************************************************************************************
 * 
 * Created on 5 Jul, 2017 2:56:13 PM
 *
 * @FileName: ommptbauprdwrfl.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: omunim
 * @version 3.0.0
 * @Copyright (c) 2017 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2017 SoftwareGen Technologies
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php

if (!isset($_SESSION)) {
    session_start();
}
if ($ownerId == '') {
    $ownerId = isset($dgGUId) ? $dgGUId : '';
}
if ($ownerId == '') {
    $ownerId = isset($_SESSION['sessionOwnerId']) ? $_SESSION['sessionOwnerId'] : '';
}
if ($ownerId == '') {
    $ownerId = isset($_SESSION['sessiondgGUId']) ? $_SESSION['sessiondgGUId'] : '';
}
//
$dirName = $documentRootIncludePhp . 'invoice/' . $ownerId;
$filePath = "$dirName/ompprdwr.php";

// 1. Check and Create Directory
if (!is_dir($dirName)) {
    // It is safer to use 0755 for directories, but using 0777 as per your request
    mkdir($dirName, 0777, true);
    chmod($dirName, 0777);
}

// 2. Open the file (This creates it if missing, or clears it if exists)
$readWritefile = fopen($filePath, "w");
fwrite($readWritefile, "" . $query);
fclose($readWritefile);
//
?>