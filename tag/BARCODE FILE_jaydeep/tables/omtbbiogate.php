<?php

/*
 * **************************************************************************************
 * @tutorial: 
 * **************************************************************************************
 * 
 * Created on 16-Jan-2023 6:20:16 pm
 *
 * @FileName: omtbbiogate.php
 * @Author: Online Munim Developement Team
 * @AuthorEmailId:  info@omunim.com
 * @ProjectName: omunim_aws
 * @version 3.0.0
 * @Copyright (c) 2022 www.omunim.com
 * @All rights reserved
 *  Copyright 2022 OMUNIM SOFTWARE PVT LTD
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php

$query = "CREATE TABLE IF NOT EXISTS gate_scan (
                gscan_id                INT NOT NULL PRIMARY KEY AUTO_INCREMENT, 
                gscan_uid               VARCHAR(20),
                gscan_sid_name          VARCHAR(20),
                gscan_state             VARCHAR(10),
                gscan_time              VARCHAR(20),
                gscan_entry_process     VARCHAR(2),
                attend_since            DATETIME,
                last_column      VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 

include 'ommptbauprdwrfl.php';
?>