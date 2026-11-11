<?php

/*
 * **************************************************************************************
 * @tutorial: sms Log
 * **************************************************************************************
 * 
 * Created on Jun 29, 2013 5:50:03 PM
 *
 * @FileName: omtbsmlg.php
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
//$currentFileName = basename(__FILE__);
//include 'system/omsachsc.php';
//require_once 'system/omsgeagb.php';
?>
<?php
//require_once 'system/omssopin.php';
?>
<?php
$query = "CREATE TABLE IF NOT EXISTS sms_log (
smlg_id          INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
smlg_own_id	 VARCHAR(16),
smlg_hw_id	 VARCHAR(16),
smlg_own_fname	 VARCHAR(16),
smlg_own_lname	 VARCHAR(16),
smlg_own_email	 VARCHAR(40),
smlg_own_mob	 VARCHAR(16),
smlg_recv_name   VARCHAR(100),
smlg_firmid      VARCHAR(6),
smlg_userType    VARCHAR(16),
smlg_userId      INT,
smlg_contList  	 VARCHAR(20),
smlg_mobno       VARCHAR(10),
smlg_city        VARCHAR(50),
smlg_tempId      VARCHAR(10),
smlg_text        VARCHAR(1000),
smlg_DOB         VARCHAR(50),
smlg_status      VARCHAR(150),
smlg_since       DATETIME,
smlg_staff_id    VARCHAR(16),
last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}//City Added @Author:PRIYA19AUG13
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>