<?php

/*
 * 
 * Created on Sep 13, 2022 12:22:17 AM
 *
 * @FileName: C:\Project\Retail\htdocs\omretail\2\include\php\tables\omrtbvisitor.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: OMunim Retail 
 * @version 1.0
 * @Copyright (c) 2010 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2010 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR: YUVRAJ KAMBLE 
 *  REASON: VISITOR NEW TABLE CREATED 
 *
 */
?>
<?php

//
$query = "CREATE TABLE IF NOT EXISTS visitor (
visitor_id 		INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
visitor_owner_id	VARCHAR(16),
visitor_firm_id		VARCHAR(16),
visitor_gid             VARCHAR(20),
visitor_login_id        VARCHAR(20),
visitor_password        VARCHAR(40),
visitor_product_key     VARCHAR(20),
visitor_api_key         VARCHAR(20),
visitor_type            VARCHAR(16),
visitor_lead_team       VARCHAR(10),
visitor_lead_type       VARCHAR(10), 
visitor_fname 	        VARCHAR(50),
visitor_lname 		VARCHAR(50),
visitor_DOB 		VARCHAR(25),
visitor_sex 		VARCHAR(16),
visitor_occupation 	VARCHAR(16),
visitor_add 	        VARCHAR(16),
visitor_pincode 	VARCHAR(16),
visitor_city 		VARCHAR(50),
visitor_address 	VARCHAR(80),
visitor_country_code 	VARCHAR(5),
visitor_country 	VARCHAR(50),
visitor_state 		VARCHAR(50),
visitor_phone		VARCHAR(20),
visitor_mobile		VARCHAR(20),
visitor_mobile_reg	VARCHAR(20),
visitor_rfid_no		VARCHAR(50),
visitor_acc_id		VARCHAR(20),
visitor_comm_upd_date	VARCHAR(20),
visitor_reference	VARCHAR(20),
visitor_status	        VARCHAR(20),
visitor_since	        VARCHAR(20),
visitor_email		VARCHAR(40),
visitor_intime		TIME,
visitor_email_reg	VARCHAR(20),
visitor_software_price  VARCHAR(20),
visitor_printer_pack    VARCHAR(20),
visitor_printer_srno    VARCHAR(20),
visitor_scanner_pack    VARCHAR(20),
visitor_scanner_srno    VARCHAR(20),
visitor_labels_pack     VARCHAR(20),
visitor_inkroll_pack    VARCHAR(20),
visitor_other_accessories  VARCHAR(20),
visitor_other_accessories2  VARCHAR(20),
visitor_cloud_charges    VARCHAR(20),
visitor_gst_charges      VARCHAR(20),
visitor_advance_amount   VARCHAR(20),
visitor_total_amount     VARCHAR(20),
visitor_discount         VARCHAR(20),
visitor_final_amount     VARCHAR(20),
visitor_remaining_amount VARCHAR(20),
visitor_system_verified  VARCHAR(20),
visitor_owner_verified  VARCHAR(20),
visitor_images          VARCHAR(20),
visitor_amc_charges          VARCHAR(20),
visitor_services	VARCHAR(20),
visitor_message		VARCHAR(500),
visitor_indicator       VARCHAR(10),
visitor_other_info      VARCHAR(500),
visitor_entry_date      VARCHAR(20),
visitor_next_date       VARCHAR(20),
visitor_last_comment_date     VARCHAR(20),
visitor_last_comment_time     VARCHAR(20),
visitor_conversion_date     VARCHAR(20),
visitor_staff_name      VARCHAR(20),
visitor_sec_staff_name  VARCHAR(20),
visitor_staff_id           VARCHAR(16),
visitor_sec_staff_id       VARCHAR(16),
visitor_interest        VARCHAR(20),
visitor_approved        VARCHAR(20),
visitor_extended_access    VARCHAR(500),
visitor_last_comment    VARCHAR(20),
visitor_block_status    VARCHAR(20),
visitor_whatsapp_send_status    VARCHAR(20),
visitor_whatsapp_send_date    VARCHAR(20),
visitor_whatsapp_send_campaign    VARCHAR(25),
visitor_otp                 VARCHAR(50),
visitor_billing_name        VARCHAR(50),
visitor_gstin               VARCHAR(20),
visitor_ip_address          VARCHAR(20),
visitor_time_zone           VARCHAR(20),
visitor_currency_code       VARCHAR(5),
visitor_currency_symbol     VARCHAR(10),
visitor_latitude            VARCHAR(20),
visitor_longitude           VARCHAR(20),
last_column                VARCHAR(1),
UNIQUE KEY (visitor_mobile),
UNIQUE KEY (visitor_email))";
//
if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}

$query2 = "ALTER TABLE visitor MODIFY COLUMN visitor_whatsapp_send_status VARCHAR(25), MODIFY COLUMN visitor_whatsapp_send_date VARCHAR(25);";
if (!mysqli_query($conn, $query2)) {
    die('Error: ' . mysqli_error($conn));
}

//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>