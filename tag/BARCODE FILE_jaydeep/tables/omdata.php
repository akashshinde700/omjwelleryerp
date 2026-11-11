<?php

/*
 * **************************************************************************************
 * @tutorial:First Month Indicator
 * **************************************************************************************
 * 
 * Created on APR 08, 2020 3:32:28 PM
 *
 * @FileName: omdata.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: omunim
 * @version 1.0.1
 * @Copyright (c) 2013 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2013 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php

/* * ********Start code to change file @Author:SWAP08APRIL2020*************** */
$query = "CREATE TABLE IF NOT EXISTS omdata (
omdata_id                  INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
omdata_own_id              VARCHAR(16),
omdata_firm_id             VARCHAR(10),
omdata_user_id             VARCHAR(16),
omdata_panel               VARCHAR(100),
omdata_option              VARCHAR(100),
omdata_value               VARCHAR(100),
omdata_percentage          VARCHAR(100),
omdata_input_field         VARCHAR(100),
omdata_year                INT,
omdata_month               VARCHAR(100),
omdata_status              VARCHAR(15),
omdata_sms_status          VARCHAR(10),
last_column                VARCHAR(1))";

if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
/* * ********END code to change file @Author:SWAP08APRIL2020*************** */
?>
