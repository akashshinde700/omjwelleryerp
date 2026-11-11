<?php 
/*
 * **************************************************************************************
 * @tutorial:Attendance log @SANSKRUTI
 * **************************************************************************************
 * 
 * Created on 20 FEB, 2023
 *
 * @FileName: omtbjapplog.php
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
$query = "CREATE TABLE IF NOT EXISTS japp_log (
japp_log_id                   INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
japp_log_japp_code            VARCHAR(64),
japp_log_owner_id             VARCHAR(10),
japp_log_staff_id             VARCHAR(10),
japp_log_own_login_id         VARCHAR(32),
japp_log_user_id              VARCHAR(10),
japp_log_user_login_id        VARCHAR(64),
japp_log_user_email_id        VARCHAR(64),
japp_log_user_mobile          VARCHAR(15),
japp_log_user_name            VARCHAR(30),
japp_log_ip                   VARCHAR(15),
japp_log_country              VARCHAR(25),
japp_log_state                VARCHAR(25),
japp_log_city                 VARCHAR(25),
japp_log_date                 VARCHAR(12),
japp_log_time                 VARCHAR(12),
japp_log_api_link             VARCHAR(50),
japp_log_status               VARCHAR(12),
japp_log_total_duration       VARCHAR(10),
japp_log_plateform            VARCHAR(10),
last_column                   VARCHAR(1))";

if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';

?>

