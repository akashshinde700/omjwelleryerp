<?php
/*
 * Created on Apr 5, 2011 11:23:57 PM
 *
 * @FileName: omtbddob.php
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

$query="CREATE TABLE IF NOT EXISTS ddOpeningBal (
ddopenbal_id			INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
ddopenbal_own_id		VARCHAR(16), 
ddopenbal_firm_id		VARCHAR(16), 
ddopenbal_bal			VARCHAR(50),
ddopenbal_ent_dat               DATETIME,
ddopenbal_upd_sts               VARCHAR(50),
ddopenbal_comm			VARCHAR(500),
last_column                VARCHAR(1))AUTO_INCREMENT=1";
if (!mysqli_query($conn,$query)){ die('Error: ' . mysqli_error($conn));}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>