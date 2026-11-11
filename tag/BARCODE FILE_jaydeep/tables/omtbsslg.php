<?php

/*
 * **************************************************************************************
 * @tutorial: Table for system log
 * **************************************************************************************
 * 
 * Created on Apr 9, 2014 12:42:34 PM
 *
 * @FileName: omtbsslg.php
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
//sslg_main_id and sslg_sub_id columns added @AUTHOR:SHRI21AUG19
$query = "CREATE TABLE IF NOT EXISTS sys_log (
sslg_id					INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
sslg_main_id                            INT(11),
sslg_sub_id                             INT(11),
sslg_own_id				VARCHAR(32),
sslg_own_login_id			VARCHAR(50),
sslg_cust_id                            VARCHAR(20),
sslg_firm_name   			VARCHAR(10),
sslg_trans_type   			VARCHAR(100),
sslg_trans_Id   			VARCHAR(100),
sslg_trans_sub   			VARCHAR(500),
sslg_trans_keyword   			VARCHAR(100),
sslg_trans_status   			VARCHAR(100),
sslg_trans_comment   			VARCHAR(2000),
sslg_status                             VARCHAR(50),
sslg_more_details                       VARCHAR(2000),
sslg_ent_date                           DATETIME,
last_column                VARCHAR(1))";
if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>