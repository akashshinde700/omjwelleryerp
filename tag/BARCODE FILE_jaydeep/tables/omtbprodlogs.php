<?php

/*
 * Created on 01-Feb-2024 10:56:17 PM
 *
 * @FileName: omtbprodinfo.php
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
$query = "CREATE TABLE IF NOT EXISTS prod_logs(
        prod_logs_id                   INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
        prod_logs_own_id               VARCHAR(10),
        prod_logs_prod_id              INT,
        prod_logs_user_id              VARCHAR(12),
        prod_logs_prod_viewed          INT,
        prod_logs_last_visit_date      VARCHAR(16),
        prod_logs_total_visit_time     VARCHAR(16),
        prod_logs_metal_type           VARCHAR(12),
        prod_logs_item_category        VARCHAR(32),
        prod_logs_item_name            VARCHAR(64),
        prod_logs_quantity             VARCHAR(4),
        prod_logs_gs_weight            VARCHAR(10),
        prod_logs_gs_weight_type       VARCHAR(4),
        prod_logs_image_id             VARCHAR(8),
        prod_logs_image_type           VARCHAR(8),
        prod_logs_last_column          VARCHAR(1)) AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>