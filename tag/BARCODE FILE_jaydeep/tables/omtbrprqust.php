<?php
/*
 * **************************************************************************************
 * @tutorial: Repair Request Table @Author:PRIYANKA-08JULY2023
 * **************************************************************************************
 * 
 * Created on JULY 08, 2023 15:00:00 PM
 *
 * @FileName: omtbrprqust.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: omunim
 * @version:
 * @Copyright (c) 2023 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2023 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php
$query = "CREATE TABLE IF NOT EXISTS repair_request (
repair_req_id                         INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
repair_req_own_id                     VARCHAR(16),
repair_req_image_id                   VARCHAR(16),
repair_req_user_name                  VARCHAR(50),
repair_req_email                      VARCHAR(64),
repair_req_mobile                     VARCHAR(16),
repair_req_prod_details               VARCHAR(64),
repair_req_prod_desc                  VARCHAR(100),
repair_req_repair_desc                VARCHAR(200),
repair_req_since                      DATETIME,
last_column                           VARCHAR(1))AUTO_INCREMENT=1";
//
if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//
// To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>