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
$query = "CREATE TABLE IF NOT EXISTS prod_info(
        prod_info_id                   INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
        prod_info_own_id               VARCHAR(20),
        prod_info_category_id          INT(11),
        prod_info_category_name        VARCHAR(45),
        prod_info_type                 VARCHAR(45),
        prod_info_details              VARCHAR(100),
        prod_info_last_column     VARCHAR(16)) AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>