<?php
/*
 * Created on 26-Jan-2011 2:58:14 AM
 *
 * @FileName: omtbfrmt.php
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
//START CODE TO ADD FIRM @AUTHOR: PRIYA29//CHANGE IN DATA TYPE OF firm_reg_no @AUTHOR: SANDY28JAN14
$query="CREATE TABLE IF NOT EXISTS firm (
firm_id			 INT NOT NULL PRIMARY KEY AUTO_INCREMENT, 
firm_own_id		 VARCHAR(16),
firm_name 		 VARCHAR(8),
firm_reg_no 		 VARCHAR(30),
firm_type 		 VARCHAR(30),
firm_owner 		 VARCHAR(30),
firm_long_name 		VARCHAR(100),
firm_desc 		VARCHAR(50),
firm_address 		VARCHAR(100),
firm_city               VARCHAR(30), 
firm_pincode            INT, 
firm_phone_details 	VARCHAR(100),
firm_email       	VARCHAR(100),"
//Adding website name by CHETAN@28072023         
."firm_website          VARCHAR(100),
firm_comments		VARCHAR(200),
firm_smtp_email		VARCHAR(100),
firm_smtp_pass		VARCHAR(100),
firm_formN		VARCHAR(30),
firm_formR 		VARCHAR(30),
firm_form_header        VARCHAR(200),
firm_form_footer 	VARCHAR(200),
firm_op_cash_bal	VARCHAR(30),
firm_op_cash_bal_crdr	VARCHAR(30),
firm_op_cash_date	VARCHAR(30),
firm_op_gold_bal	VARCHAR(30),
firm_op_gold_bal_wtype  VARCHAR(30),
firm_op_gold_bal_crdr	VARCHAR(30),
firm_op_silv_bal	VARCHAR(30),
firm_op_silv_bal_wtype  VARCHAR(30),
firm_op_silv_bal_crdr	VARCHAR(30),
firm_capital_acc_id     INT,
firm_pan_no             VARCHAR(20),
firm_tin_no     	VARCHAR(20),
firm_since 		 DATETIME,
firm_principal_amt_limit VARCHAR(20),
firm_left_thumb          LONGBLOB,
firm_left_thumb_ftype	 VARCHAR(20),
firm_right_thumb	 LONGBLOB,
firm_right_thumb_ftype	 VARCHAR(20),
firm_other_info 	 VARCHAR(100),
firm_bank_details        VARCHAR(200),
firm_bank_acc_no         VARCHAR(20),
firm_bank_ifsc_code      VARCHAR(20),
firm_bank_declaration    VARCHAR(500),
firm_icici_aggr_id       VARCHAR(15),
firm_icici_aggr_name     VARCHAR(15),
firm_icici_corp_id       VARCHAR(15),
firm_icici_user_id       VARCHAR(15),
firm_icici_urn           VARCHAR(15),
firm_icici_alias_id      VARCHAR(15),
firm_icici_api_key       VARCHAR(42),
firm_owner_sign 	 LONGBLOB,
firm_owner_sign_ftype	 VARCHAR(20),
firm_owner_qrcode 	 LONGBLOB,
firm_owner_qrcode_ftype	 VARCHAR(20),
firm_left_logo_id        VARCHAR(16),
firm_right_logo_id       VARCHAR(16),
firm_user_sign_id        VARCHAR(16),
firm_country             VARCHAR(100), 
firm_state               VARCHAR(100),
firm_currency            VARCHAR(20), 
firm_currency_option_type VARCHAR(20),
firm_smtp_server         VARCHAR(100),"// ADDED TO STORE SMTP SERVER DETAILS @AUTHOR:MADHUREE-02MAY2022
."firm_smtp_port         VARCHAR(50),"// ADDED TO STORE SMTP PORT DETAILS @AUTHOR:MADHUREE-06MAY2022
."firm_smtp_cc_email     VARCHAR(100),"// ADDED TO STORE SMTP CC EMAIL ID DETAILS @AUTHOR:MADHUREE-06MAY2022
."firm_otp               VARCHAR(50),"// ADDED TO STORE FIRM OTP @AUTHOR:MADHUREE-01SEP2022
."firm_staff_id	         VARCHAR(16),"
."firm_geolocation_latitude        VARCHAR(24)," // ADDED TO FIRM GEOLOCATION @AUTHOR:PRASHANT-19APR2024
."firm_geolocation_longitude        VARCHAR(24),"
."firm_whatsapp_link        VARCHAR(250),"
."firm_facebook_link        VARCHAR(250),"
."firm_instagram_link       VARCHAR(250),"
."firm_einv_app_id          VARCHAR(50),"
."firm_einv_app_key         VARCHAR(50),"
."firm_einv_username        VARCHAR(24),"//hrushali
."firm_einv_password        VARCHAR(24),"
."firm_ship_token           LONGBLOB,"
."firm_ship_token_date            VARCHAR(24),"
. "firm_bis_no                VARCHAR(15),"
. "cinInput                VARCHAR(21),"
. "rbiLicenseInput                VARCHAR(21),"        
. "last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)){ die('Error: ' . mysqli_error($conn));}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
//echo "Firm Table Created Successfully.\n";
//START CODE PRIYA28 to add firm
?>