<?php

/*
 * Created on 05-JAN-2016 15:20:17 PM
 *
 * @FileName: omtbusim.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: eMunim
 * @version 1.0
 * @Copyright (c) 2016 www.softwaregen.com
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

//include 'omssopin.php';
//**********************Start code to change for image table column name and add image owner_id Author@:SANT25JAN16*****************************  
$query = "CREATE TABLE IF NOT EXISTS image (
image_id 		   INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
image_user_id              INT,
image_owner_id             VARCHAR(16),
image_user_type		   VARCHAR(16),
image_user	           LONGBLOB,
image_snap_thumb           LONGBLOB,
image_snap_fname	   VARCHAR(150),
image_snap_ftype	   VARCHAR(20),
image_snap_fsize           VARCHAR(40),
image_snap_fszMB 	   VARCHAR(40),
image_count                VARCHAR(150),
image_itpr_id              VARCHAR(10),
image_snap_desc 	   VARCHAR(200),
image_theme                VARCHAR(10),
image_get_by_file_name     VARCHAR(10)," // CLOUMN ADDED TO STORE FILE IMPORT IMAGE ADDED @AUTHOR:MADHUREE-18AUGUST2020
. "last_column              VARCHAR(1))";
if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
//**********************End code to change for image table column name and add image owner_id Author@:SANT25JAN16*****************************  
//echo "Image Table Created Successfully1.\n";
?>