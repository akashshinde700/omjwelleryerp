<?php

/*
 * Created on 22-Dec-2015 15:45:17 PM
 *
 * @FileName: omcouponcode.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: eMunim
 * @version 1.0
 * @Copyright (c) 2015 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2015 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php
$query = "CREATE TABLE IF NOT EXISTS coupon(
cpn_id          INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
cpn_owner_id        VARCHAR(16),
cpn_firm_id         VARCHAR(16),
cpn_firm_name       VARCHAR(16),
cpn_offer_name      VARCHAR(50),
cpn_content         VARCHAR(50),
cpn_code            VARCHAR(10),
cpn_quantity        VARCHAR(10),
cpn_discount        VARCHAR(10),
cpn_discount_on     VARCHAR(50),
cpn_start_date      VARCHAR(32),
cpn_end_date        VARCHAR(32),
cpn_status          VARCHAR(10),
cpn_active          VARCHAR(10),
cpn_validity_detail VARCHAR(50),
cpn_height          INT,
cpn_width           INT,
last_column         VARCHAR(1))";
    
if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}

// To check new columns added into table or not 
include 'ommptbauprdwrfl.php';

?>