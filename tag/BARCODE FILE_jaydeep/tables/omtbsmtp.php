<?php
/*
 * **************************************************************************************
 * @tutorial: sms templates
 * **************************************************************************************
 * 
 * Created on Jun 29, 2013 5:45:28 PM
 *
 * @FileName: omtbsmtp.php
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
if ($ownerId == '') {
    $ownerId = $dgGUId;
}
if ($ownerId == '') {
    $ownerId = $_SESSION['sessionOwnerId'];
}
if ($ownerId == '') {
    $ownerId = $_SESSION['sessiondgGUId'];
}
// smtp_sub - subject line // smtp_text - content // smtp_type - PSMS / TSMS - Trans SMS / WAMS - Whatsapp Message / MBNT - mobile notification
$query = "CREATE TABLE IF NOT EXISTS sms_templates (
smtp_id             INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
smtp_own_id         VARCHAR(16),
smtp_tp_id          VARCHAR(16),
smtp_tp_no          VARCHAR(10),
smtp_sub            VARCHAR(30),
smtp_text           VARCHAR(1000),
smtp_type           VARCHAR(16),
smtp_owner          VARCHAR(16),
smtp_since          DATETIME,
smtp_user_id        INT,
smtp_staff_id       VARCHAR(16),
smtp_sms_temp       VARCHAR(12),
smtp_mobile_temp    VARCHAR(12),
smtp_whatsapp_temp  VARCHAR(12),
smtp_panel_name     VARCHAR(60),
smtp_content_id     VARCHAR(50),
last_column         VARCHAR(1),UNIQUE KEY (smtp_sub))AUTO_INCREMENT=1";
//
if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
//

?>