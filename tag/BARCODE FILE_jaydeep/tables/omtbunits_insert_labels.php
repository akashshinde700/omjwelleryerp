<?php
//file name: omtbunits_insert_labels.php
if (!isset($_SESSION)) {
    session_start();
}
require_once $_SESSION['documentRootIncludePhp'] . 'system/omssopin.php';

$ownerId = $_SESSION['sessionOwnerId'];

if ($ownerId == '') {
    $ownerId = isset($dgGUId) ? $dgGUId : '';
}
if ($ownerId == '') {
    $ownerId = isset($_SESSION['sessionOwnerId']) ? $_SESSION['sessionOwnerId'] : '';
}
if ($ownerId == '') {
    $ownerId = isset($_SESSION['sessiondgGUId']) ? $_SESSION['sessiondgGUId'] : '';
}

$query = "INSERT INTO units (unit_own_id,unit_category,unit_name,unit_type,unit_panel,unit_info,unit_since)
          SELECT * FROM (SELECT '$ownerId','jewellery','gram','GM','WT','',$currentDateTime) AS tmp
          WHERE NOT EXISTS (SELECT unit_type FROM units WHERE unit_type = 'GM' AND unit_category = 'jewellery') LIMIT 1";
//
if (!mysqli_query($conn, $query))
    die('Query:' . $query . '<br/>Error: ' . mysqli_error($conn));
//
//
$query = "INSERT INTO units (unit_own_id,unit_category,unit_name,unit_type,unit_panel,unit_info,unit_since)
          SELECT * FROM (SELECT '$ownerId','jewellery','kilo gram','KG','WT','',$currentDateTime) AS tmp
          WHERE NOT EXISTS (SELECT unit_type FROM units WHERE unit_type = 'KG' AND unit_category = 'jewellery') LIMIT 1";
//
if (!mysqli_query($conn, $query))
    die('Query:' . $query . '<br/>Error: ' . mysqli_error($conn));
//
//
$query = "INSERT INTO units (unit_own_id,unit_category,unit_name,unit_type,unit_panel,unit_info,unit_since)
          SELECT * FROM (SELECT '$ownerId','jewellery','milli gram','MG','WT','',$currentDateTime) AS tmp
          WHERE NOT EXISTS (SELECT unit_type FROM units WHERE unit_type = 'MG' AND unit_category = 'jewellery') LIMIT 1";
//
if (!mysqli_query($conn, $query))
    die('Query:' . $query . '<br/>Error: ' . mysqli_error($conn));
//
//
$query = "INSERT INTO units (unit_own_id,unit_category,unit_name,unit_type,unit_panel,unit_info,unit_since)
          SELECT * FROM (SELECT '$ownerId','jewellery','carat ','CT','WT','',$currentDateTime) AS tmp
          WHERE NOT EXISTS (SELECT unit_type FROM units WHERE unit_type = 'CT' AND unit_category = 'jewellery') LIMIT 1";
//
if (!mysqli_query($conn, $query))
    die('Query:' . $query . '<br/>Error: ' . mysqli_error($conn));
//
//
$query = "INSERT INTO units (unit_own_id,unit_category,unit_name,unit_type,unit_panel,unit_info,unit_since)
          SELECT * FROM (SELECT '$ownerId','jewellery','ratti','RT','WT','',$currentDateTime) AS tmp
          WHERE NOT EXISTS (SELECT unit_type FROM units WHERE unit_type = 'RT' AND unit_category = 'jewellery') LIMIT 1";
//
if (!mysqli_query($conn, $query))
    die('Query:' . $query . '<br/>Error: ' . mysqli_error($conn));
//
//
$query = "INSERT INTO units (unit_own_id,unit_category,unit_name,unit_type,unit_panel,unit_info,unit_since)
          SELECT * FROM (SELECT '$ownerId','jewellery','per piece','PP','WT','',$currentDateTime) AS tmp
          WHERE NOT EXISTS (SELECT unit_type FROM units WHERE unit_type = 'PP' AND unit_category = 'jewellery') LIMIT 1";
//
if (!mysqli_query($conn, $query))
    die('Query:' . $query . '<br/>Error: ' . mysqli_error($conn));
//
//
$query = "INSERT INTO units (unit_own_id,unit_category,unit_name,unit_type,unit_panel,unit_info,unit_since)
          SELECT * FROM (SELECT '$ownerId','jewellery','percent','%','WT','',$currentDateTime) AS tmp
          WHERE NOT EXISTS (SELECT unit_type FROM units WHERE unit_type = '%' AND unit_category = 'jewellery') LIMIT 1";
//
if (!mysqli_query($conn, $query))
    die('Query:' . $query . '<br/>Error: ' . mysqli_error($conn));
//
//
$query = "INSERT INTO units (unit_own_id,unit_category,unit_name,unit_type,unit_panel,unit_info,unit_since)
          SELECT * FROM (SELECT '$ownerId','jewellery','fixed','FX','WT','',$currentDateTime) AS tmp
          WHERE NOT EXISTS (SELECT unit_type FROM units WHERE unit_type = 'FX' AND unit_category = 'jewellery') LIMIT 1";
//
if (!mysqli_query($conn, $query))
    die('Query:' . $query . '<br/>Error: ' . mysqli_error($conn));
//
//
//
//
?>