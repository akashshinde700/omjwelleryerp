<?php 
/*
 * **************************************************************************************
 * @tutorial:Attendance log @SANSKRUTI
 * **************************************************************************************
 * 
 * Created on 20 FEB, 2023
 *
 * @FileName: omtbattendlog.php
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
$query = "CREATE TABLE IF NOT EXISTS attendance_log (
attendlog_id                   INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
attendlog_staff_id             VARCHAR(10),
attendlog_uid                  VARCHAR(10),
attendlog_state                VARCHAR(10),
attendlog_date                 DATE,
attendlog_time                 TIME,
attendlog_status               VARCHAR(10),
attendlog_in_duration          VARCHAR(10),
attendlog_out_duration         VARCHAR(10),
attendlog_late_mark            VARCHAR(10),
attendlog_entry_process        VARCHAR(10),
last_column                    VARCHAR(1))";

if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';

?>

