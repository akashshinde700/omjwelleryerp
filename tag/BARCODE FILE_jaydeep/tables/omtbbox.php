<?php

/*
 * Created on 12-Feb-2025 03:32:17 PM
 *
 * @FileName: omtbbox.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: eMunim
 * @version 1.0
 * @Copyright (c) 2010 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2010 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php
$query = "CREATE TABLE IF NOT EXISTS box(
        box_id            INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
        box_name          VARCHAR(32) NOT NULL UNIQUE,
        box_max_qty       INT(6),
        box_filled_qty    INT(6),
        box_avail_qty     INT(6),
        box_total_wt      VARCHAR(16),
        box_type          VARCHAR(16),
        box_wt            VARCHAR(16),
        box_Total_weight  VARCHAR(16),
        box_loan_count    INT(6))";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}

//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>