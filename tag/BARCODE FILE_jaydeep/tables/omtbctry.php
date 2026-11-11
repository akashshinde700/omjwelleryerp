<?php
/*
 * Created on Apr 5, 2011 11:24:15 PM
 *
 * @FileName: omtbctry.php
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
//require_once 'system/omssopin.php';

$query="CREATE TABLE IF NOT EXISTS country (
country_id                          INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
country_own_id                      VARCHAR(16), 
country_name                        VARCHAR(50),
country_currency                    VARCHAR(32),
country_code                        VARCHAR(5),
country_selected                    VARCHAR(10),
country_ent_dat                     DATETIME,
country_upd_sts                     VARCHAR(50),
country_comm                        VARCHAR(500),
country_staff_id	            VARCHAR(16),
last_column                VARCHAR(1),UNIQUE KEY (country_own_id,country_name))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)){ die('Error: ' . mysqli_error($conn));}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>