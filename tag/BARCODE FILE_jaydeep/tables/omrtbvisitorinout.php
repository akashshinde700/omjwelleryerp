<?php 
/*
 * 
 * Created on 10 JUNE,2023 @SANSKRUTI
 *
 * @FileName: C:\Project\Retail\htdocs\omretail\2\include\php\tables\omrtbvisitorinout.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: OMunim Retail 
 * @version 1.0
 * @Copyright (c) 2010 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2010 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  REASON: VISITOR LOG NEW TABLE CREATED FOR VISITOR SCAN
 *
 */
?>
<?php
//
$query = "CREATE TABLE IF NOT EXISTS visitor_inout (
visitor_inout_id 		INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
visitor_inout_rfid	        VARCHAR(50),
visitor_inout_gate              VARCHAR(20),
visitor_inout_time              TIME,
visitor_inout_status            VARCHAR(10),        
last_column                     VARCHAR(1))";
//
if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>