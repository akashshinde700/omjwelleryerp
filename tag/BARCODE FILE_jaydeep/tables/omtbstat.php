<?php

/*
 * Created on Apr 5, 2011 11:31:14 PM
 *
 * @FileName: omtbstat.php
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

$query = "CREATE TABLE IF NOT EXISTS state (
state_id			INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
state_own_id		VARCHAR(16), 
state_code			VARCHAR(50),
state_name			VARCHAR(50),
state_team			VARCHAR(20),
state_selected      VARCHAR(10),
state_ent_dat		DATETIME,
state_upd_sts		VARCHAR(50),
state_comm			VARCHAR(500),
state_staff_id      VARCHAR(16),
last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
//echo "State Table Created Successfully.\n";
?>