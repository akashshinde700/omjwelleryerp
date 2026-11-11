<?php

/*
 * **************************************************************************************
 * @tutorial: Labels
 * **************************************************************************************
 * 
 * Created on Jun 5, 2014 2:52:01 PM
 *
 * @FileName: omtblabl.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: 2
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
if (!isset($_SESSION)) {
    session_start();
}
require_once $_SESSION['documentRootIncludePhp'] . 'system/omssopin.php';
//
$sessionOwnerId = $_SESSION['sessionOwnerId'];
//
$dirName = $documentRootIncludePhp . 'invoice/' . $sessionOwnerId;
$filePath = "$dirName/ompprdwr.php";
//echo '$filePath:' . $filePath;
// 1. CREATE TABLE IF NOT EXISTS
$query = "CREATE TABLE IF NOT EXISTS labels (
    label_id INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    label_own_id VARCHAR(50),
    label_type VARCHAR(50),
    label_field_name VARCHAR(50),
    label_field_content VARCHAR(2000),
    label_field_font_size VARCHAR(50),
    label_field_font_color VARCHAR(20),
    label_field_font_weight VARCHAR(20),  
    label_field_check VARCHAR(6),
    label_noprint VARCHAR(6),
    label_table_name VARCHAR(30),
    label_table_column_name VARCHAR(255),
    label_name VARCHAR(50),
    last_column VARCHAR(1)
) AUTO_INCREMENT=1";

if (!mysqli_query($conn, $query)) {
    die('Error Creating Labels Table: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
//
?>