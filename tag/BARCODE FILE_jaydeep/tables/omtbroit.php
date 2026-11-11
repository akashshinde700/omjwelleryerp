<?php
/*
 * Created on 26-Jan-2011 2:58:14 AM
 *
 * @FileName: omtbroit.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: eMunim
 * @version 1.0
 * @Copyright (c) 2010 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2010 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE: Modified by @Author: KHUSH24JAN13
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php

$query="CREATE TABLE IF NOT EXISTS roi (
roi_id			INT NOT NULL PRIMARY KEY AUTO_INCREMENT, 
roi_own_id		VARCHAR(16),
roi_value 		FLOAT,
iroi_value 		FLOAT,
roi_type 		VARCHAR(10),
roi_default 		VARCHAR(10),
roi_monthly_opt		VARCHAR(3),
roi_since 		DATETIME,
roi_comm         	VARCHAR(100),
roi_month               VARCHAR(20),
roi_increse_by          VARCHAR(20),
roi_staff_id            VARCHAR(16),
last_column                VARCHAR(1))AUTO_INCREMENT=1";//UNIQUE KEY REMOVED FOR ROI VALUE,IROI VALUE & ROI TYPE @AUTHOR:MADHUREE-15MAY2021

if (!mysqli_query($conn,$query)){ die('Error roi: ' . mysqli_error($conn));

}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
//echo "ROI Table Created Successfully.\n";
?>