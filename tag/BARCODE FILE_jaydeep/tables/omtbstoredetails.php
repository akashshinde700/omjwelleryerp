<?php

/*
 * Created on OCT 23, 2024 11:18:14 PM
 *
 * @FileName: omtbstoredetails.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: oMunim
 * @version 2.8
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

$query = "CREATE TABLE IF NOT EXISTS store_details (
store_id                   INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
store_owner_id		VARCHAR(16),
store_firm_id		INT,
store_city	        VARCHAR(50),
store_location          VARCHAR(50),
store_address  		VARCHAR(50), 
store_map		VARCHAR(300),
store_phone             VARCHAR(16),
store_rating         	VARCHAR(16),
Store_ent_date          DATETIME,
last_column             VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>
