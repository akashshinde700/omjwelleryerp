<?php

/*
 * **************************************************************************************
 * @tutorial: staff Access Table
 * **************************************************************************************
 * 
 * Created on Jun 4, 2013 1:36:21 PM
 *
 * @FileName: omtbaccs.php
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
//TO ADD FIELDS ADDED IN ommptbupd @AUTHOR: SANDY16DEC13
$query = "CREATE TABLE IF NOT EXISTS access (
acc_id          INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
acc_own_id	VARCHAR(16),
acc_emp_id      VARCHAR(10),
acc_panel       VARCHAR(100),
acc_name        VARCHAR(100),
acc_check_id    VARCHAR(100),
acc_access      VARCHAR(10),
acc_type        VARCHAR(100),
acc_aplcatn     VARCHAR(100),
accs_staff_id   VARCHAR(16),
last_column                VARCHAR(1))";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>