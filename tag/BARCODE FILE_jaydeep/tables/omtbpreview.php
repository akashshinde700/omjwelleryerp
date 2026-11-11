<?php

/*
 * Created on May 25, 2011 4:08:14 PM
 *
 * @FileName: omtbpreview.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: oMunim
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

$query = "CREATE TABLE IF NOT EXISTS product_review (
pr_id                   INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
pr_owner_id		VARCHAR(16),
pr_firm_id		INT,
pr_user_id		INT, 
pr_sttr_id	        INT,
pr_review	        INT,
pr_date                 DATETIME,
pr_name  		VARCHAR(50), 
pr_feature		VARCHAR(300), 
pr_images_id            VARCHAR(100),
pr_description         	VARCHAR(300),
pr_status               VARCHAR(16), 
last_column             VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>
