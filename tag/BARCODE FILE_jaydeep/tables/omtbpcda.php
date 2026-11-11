<?php

/*
 * **************************************************************************************
 * @tutorial: Table to store the data of PHP charts
 * **************************************************************************************
 * 
 * Created on Oct 17, 2012 8:45:37 PM
 *
 * @FileName: omtbpcda.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: OMREVO
 * @version 1.0.1
 * @Copyright (c) 2010 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2012 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php
$query = "CREATE TABLE IF NOT EXISTS pchart (
pchart_id                       INT NOT NULL PRIMARY KEY AUTO_INCREMENT, 
pchart_xaxis  			VARCHAR(16),
pchart_yaxis			VARCHAR(16),
pchart_yaxis2			VARCHAR(16),
pchart_counter 			INT,
pchart_xaxis_title		VARCHAR(50),
pchart_yaxis_title		VARCHAR(50),
pchart_yaxis2_title		VARCHAR(50),
pchart_series_desc		VARCHAR(50),
pchart_abscissa			VARCHAR(50),
pchart_ent_dat 			DATETIME,
pchart_comm 			VARCHAR(2000),
last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>