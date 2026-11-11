<?php
/*
 * Created on Apr 5, 2011 11:23:57 PM
 *
 * @FileName: omtbvill.php
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
//include '../php/emConfigDatabase.php';
//include '../php/emOpenDatabase.php';

$query="CREATE TABLE IF NOT EXISTS city (
city_id				INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
city_own_id			VARCHAR(16), 
city_name			VARCHAR(50),
village_name			VARCHAR(50),
city_ent_dat                    DATETIME,
village_ent_dat                 DATETIME,
city_upd_sts                    VARCHAR(50),
city_selected                   VARCHAR(10),
city_comm			VARCHAR(500),".
//CODE ADDED TO ADD COLUMN FOR PINCODE, ECOM DELIVERY, DELIVERY TIME AND ORDER DELIVERY TIME,@AUTHOR:HEMA-8AUG2020
"city_pincode                   VARCHAR(16),
city_ecom_delivery              VARCHAR(20),
city_delivery_time              VARCHAR(16),
city_order_delivery_time        VARCHAR(16),
city_staff_id	                VARCHAR(16),
last_column                VARCHAR(1),UNIQUE KEY (city_own_id,city_name))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)){ die('Error: ' . mysqli_error($conn));}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
//echo "City Table Created Successfully.\n";

//include '../php/emCloseDatabase.php';
?>