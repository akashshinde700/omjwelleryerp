<?php

/*
 * **************************************************************************************
 * @tutorial: Crystal Table
 * **************************************************************************************
 * 
 * Created on Sep 25, 2013 3:18:07 PM
 *
 * @FileName: omtbcrys.php
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

$query = "CREATE TABLE IF NOT EXISTS crystal (
cry_id                          INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
cry_own_id			VARCHAR(16), 
cry_crystal_id			VARCHAR(16), 
cry_name			VARCHAR(500),
cry_category			VARCHAR(50),
cry_dob         		VARCHAR(50),
cry_rate                        VARCHAR(20),
cry_rate_type                   VARCHAR(5),
cry_clarity			VARCHAR(15),
cry_color			VARCHAR(15),
cry_other_info			VARCHAR(500),
cry_upd_sts			VARCHAR(50),
cry_comm			VARCHAR(500),
cry_since			DATETIME,
cry_snap                        LONGBLOB,
cry_snap_thumb                  LONGBLOB,
cry_snap_fname                  VARCHAR(150),
cry_snap_ftype                  VARCHAR(20),
cry_snap_fsize                  VARCHAR(40),
cry_snap_fszMB                  VARCHAR(40),
cry_staff_id	                VARCHAR(16),
last_column                VARCHAR(1),UNIQUE KEY (cry_crystal_id))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>