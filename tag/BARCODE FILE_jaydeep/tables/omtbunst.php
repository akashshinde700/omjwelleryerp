<?php

/*
 * **************************************************************************************
 * @tutorial: Udhaar Notice Setup Table by @Author: KHUSH16JAN13
 * **************************************************************************************
 * 
 * Created on Jan 16, 2013 3:22:42 PM
 *
 * @FileName: omtbunst.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: omunim
 * @version 1.0.1
 * @Copyright (c) 2010 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2012 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE: Modified by KHUSH20JAN13
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
    $ownerId = $_SESSION['sessiondgGUId'];
}

$query = "CREATE TABLE IF NOT EXISTS udhaar_notice_setup (
uns_id                          INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
uns_own_id                      VARCHAR(50),
uns_def_lang                    VARCHAR(20),
uns_lang                        VARCHAR(20),
uns_top_margin                  VARCHAR(6),  
uns_left_margin                 VARCHAR(6),  
uns_header_width                VARCHAR(20),
uns_header_display              VARCHAR(30),
uns_border_check                VARCHAR(6),
uns_firm_left_logo_check        VARCHAR(6),
uns_firm_right_logo_check       VARCHAR(6),
uns_header_left_section         VARCHAR(100),
uns_header_left_section_font    VARCHAR(20),
uns_header_left_section_color   VARCHAR(30),
uns_header_left_sec_check       VARCHAR(6),
uns_header_right_section        VARCHAR(100),
uns_header_right_section_font   VARCHAR(20),
uns_header_right_section_color  VARCHAR(30),
uns_header_right_sec_check      VARCHAR(6),
uns_header                      VARCHAR(100),
uns_header_font                 VARCHAR(20),
uns_header_color                VARCHAR(30),
uns_header_check                VARCHAR(6),
uns_firm_header_font            VARCHAR(20),
uns_firm_header_color           VARCHAR(30),
uns_firm_header_check           VARCHAR(6),
uns_firm_name_font              VARCHAR(20),
uns_firm_name_color             VARCHAR(30),
uns_firm_name_check             VARCHAR(6),
uns_firm_desc_font              VARCHAR(20),
uns_firm_desc_color             VARCHAR(30),
uns_firm_desc_check             VARCHAR(6),
uns_firm_address_font           VARCHAR(20),
uns_firm_address_color          VARCHAR(30),
uns_firm_address_check          VARCHAR(6),
uns_firm_phone_font             VARCHAR(20),
uns_firm_phone_color            VARCHAR(30),
uns_firm_phone_check            VARCHAR(6),
uns_firm_email_font             VARCHAR(20),
uns_firm_email_color            VARCHAR(30),
uns_firm_email_check            VARCHAR(6),
uns_reg_no_label                VARCHAR(100),
uns_reg_no_font                 VARCHAR(20),
uns_reg_no_color                VARCHAR(30),
uns_reg_no_check                VARCHAR(6),
uns_date_lbl                    VARCHAR(100),
uns_date_font                   VARCHAR(20),
uns_date_color                  VARCHAR(30),
uns_sub_head                    VARCHAR(100),    
uns_sub_lbl                     VARCHAR(100), 
uns_sub_font                    VARCHAR(20),
uns_sub_color                   VARCHAR(30),
uns_sub_check                   VARCHAR(6),
uns_notice_cont                 VARCHAR(2000),
uns_notice_font                 VARCHAR(20),
uns_notice_color                VARCHAR(30),
uns_notice_check                VARCHAR(6),
uns_details                     VARCHAR(100),
uns_principal_lbl               VARCHAR(100),
uns_udhaar_date_lbl             VARCHAR(100),
uns_udhaar_date_font            VARCHAR(20),
uns_udhaar_date_color           VARCHAR(30),
uns_udhaar_date_check           VARCHAR(6),
uns_interest_lbl                VARCHAR(100),
uns_total_amt_lbl               VARCHAR(100),
uns_other_info                  VARCHAR(500),
uns_other_info_font             VARCHAR(20),
uns_other_info_color            VARCHAR(30),
uns_other_info_check            VARCHAR(6),
uns_tnc_lbl                     VARCHAR(100),
uns_tnc                         VARCHAR(2000),
uns_tnc_font                    VARCHAR(20),
uns_tnc_color                   VARCHAR(30),
uns_tnc_content_font            VARCHAR(20),
uns_tnc_content_color           VARCHAR(30),
uns_tnc_check                   VARCHAR(6),
uns_cust_sign_lbl               VARCHAR(200),
uns_cust_sign_font              VARCHAR(20),
uns_cust_sign_color             VARCHAR(30),
uns_owner_sign_lbl              VARCHAR(100),
uns_owner_sign_font             VARCHAR(20),
uns_owner_sign_color            VARCHAR(30),
uns_cust_image_check            VARCHAR(6),
uns_footer                      VARCHAR(100),
uns_footer_font                 VARCHAR(20),
uns_footer_color                VARCHAR(30),
uns_footer_check                VARCHAR(6),
uns_form_size                   VARCHAR(20),
uns_default_size                VARCHAR(20),
uns_form_width                  VARCHAR(6),
uns_staff_id                    VARCHAR(16),
last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
//
?>