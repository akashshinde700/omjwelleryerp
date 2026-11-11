<?php

/*
 * ***********************************************************************
 * @tutorial: ACTION ITEM HISTORY TABLE FILE @AUTHOR:MADHUREEE-01JULY2020 
 * ***********************************************************************
 *
 * Created on 01 JULY, 2012 11:43:27 PM
 *
 * @FileName: omtbactitm.php
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

//require_once 'system/omssopin.php';
$query = "CREATE TABLE IF NOT EXISTS actionitem_history (
actitm_id        INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
actitm_acit_id	 VARCHAR(16),
actitm_history   LONGBLOB,
actitm_description   LONGBLOB,
actitm_date      VARCHAR(20),
actitm_time      VARCHAR(16),
actitm_done_status      VARCHAR(16),
last_column      VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>