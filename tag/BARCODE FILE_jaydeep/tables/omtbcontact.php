<?php
/*
 * **************************************************************************************
 * @tutorial: OMGOLD Contact table
 * **************************************************************************************
 *
 * Created on 17 Aug, 2018 13:09:36 PM
 *
 * @FileName: omtbcontact.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: omunim
 * @version 2.6.86
 * @Copyright (c) 2018 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2018 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php
$query = "CREATE TABLE IF NOT EXISTS contact (
contact_id                      INT(11) NOT NULL PRIMARY KEY AUTO_INCREMENT,
contact_name                    VARCHAR(60),
contact_phn_no                  VARCHAR(32),
contact_email                   VARCHAR(100),
contact_sub                     VARCHAR(1000),
contact_serv                    VARCHAR(1000),
contact_mesg                    VARCHAR(1000),
contact_website                 VARCHAR(60),
contact_date                    VARCHAR(40),
contact_lead                    VARCHAR(60),
contact_prod_id                 VARCHAR(60),
contact_login_id                VARCHAR(60),
contact_rating                  VARCHAR(60),
contact_feature                 VARCHAR(60),
contact_indi                    VARCHAR(60),
contact_city                    VARCHAR(60),
contact_country                 VARCHAR(60),
contact_state                   VARCHAR(60),
contact_reqType                 VARCHAR(60),
contact_down_product            VARCHAR(60),
contact_ip_address              VARCHAR(64),
contact_ref                     VARCHAR(60),
contact_entry_date              VARCHAR(60),
contact_update_date             VARCHAR(60),
contact_status                  VARCHAR(60),
contact_next_date               VARCHAR(60),
contact_cmnt                    VARCHAR(60),
sgen_sub_srch_date              VARCHAR(10),
contact_sms_status              VARCHAR(3),
contact_del_status              VARCHAR(60),
last_column                VARCHAR(1))AUTO_INCREMENT=1";
//
if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>
