<?php

/*
 * **************************************************************************************
 * @tutorial: Action Items Table 
 * **************************************************************************************
 *
 * Created on 24 Dec, 2012 11:43:27 PM
 *
 * @FileName: omtbacit.php
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
$query = "CREATE TABLE IF NOT EXISTS actionitem (
acit_id                         INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
acit_owner_id                   VARCHAR(16),
acit_FirmId                     VARCHAR(6),
acit_action_id                  VARCHAR(30),
acit_user_id                    VARCHAR(50),"//ADDED FOR CUSTOMER ID@AUTHOR:RUTUJA-16FEB2021
."acit_subject                  VARCHAR(200),
acit_desc                       LONGBLOB,
acit_category                   VARCHAR(50),
acit_start_DOB                  VARCHAR(50),
acit_end_DOB                    VARCHAR(50),
acit_done_date                  VARCHAR(30),"//ADDED FOR TASK DONE DATE FOR APPROVAL @AUTHOR:MADHUREE-06JULY2020
."acit_complete_DOB             VARCHAR(30),"//ADDED FOR TASK COMPLETION DATE AFTER APPROVAL @AUTHOR:MADHUREE-06JULY2020
."acit_TaskRepeat               VARCHAR(50),
acit_login_id                   VARCHAR(50),
acit_owner_staff_id             VARCHAR(50),
acit_staff_id                   VARCHAR(50),
acit_since                      DATETIME,
acit_status                     VARCHAR(16),
acit_done_status                VARCHAR(16),
acit_other_info                 VARCHAR(50),
acit_Notification               VARCHAR(10),
acit_notification_count         INT,"//ADDED COLUMN TO STORE NOTIFICATION SENDING COUNT @AUTHOR:MADHUREE-08JAN2022
."acit_notification_sent_date   VARCHAR(30),"//ADDED COLUMN TO STORE NOTIFICATION SENDING DATE @AUTHOR:MADHUREE-08JAN2022
."acit_display_counter          INT,"
."acit_Extended_DOB             VARCHAR(50),"
. "last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>