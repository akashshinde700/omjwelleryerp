<?php

/*
 * **************************************************************************************
 * @tutorial: Customized notice table
 * **************************************************************************************
 * 
 * Created on May 13, 2014 6:12:53 PM
 *
 * @FileName: omtbcuno.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: 2
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

if ($ownerId == '') {
    $ownerId = $dgGUId;
}
if ($ownerId == '') {
    $ownerId = $_SESSION['sessionOwnerId'];
}

if ($ownerId == '') {
    $ownerId = $_SESSION['sessiondgGUId'];
}

$query = "CREATE TABLE IF NOT EXISTS customized_notice (
cuno_id                          INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
cuno_own_id                      VARCHAR(50),
cuno_border_check                VARCHAR(6), 
cuno_type                        VARCHAR(30),
cuno_default_type                VARCHAR(30),
cuno_form_size                   VARCHAR(20),
cuno_default_size                VARCHAR(20),
cuno_notice_width                VARCHAR(6),
cuno_notice_height               VARCHAR(6),
cuno_notice_font                 VARCHAR(20),
cuno_notice_color                VARCHAR(30),
cuno_notice_cont                 VARCHAR(5000),
cuno_since                       DATETIME,
cuno_def_lang                    VARCHAR(20),
cuno_lang                        VARCHAR(20),
cuno_top_margin                  VARCHAR(6),  
cuno_left_margin                 VARCHAR(6),
cuno_staff_id                  	 VARCHAR(16),
last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';

?>