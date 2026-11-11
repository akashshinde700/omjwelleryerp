<?php

/*
 * **************************************************************************************
 * @tutorial: Form Money Deposit Setup Table
 * **************************************************************************************
 *
 * Created on Jul 15, 2016
 *
 * @FileName:
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: omunim
 * @version 1.0.1
 * @Copyright (c) 2010 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2012 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:  Modified by KHUSH21JAN13
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
} //cond added @Author:PRIYA29DEC13
if ($ownerId == '') {
    $ownerId = $_SESSION['sessiondgGUId'];
}
//Start code to add the field and update field Author:GAUR30MAY16
$query = "CREATE TABLE IF NOT EXISTS form_setup (
fs_id                          INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
fs_own_id                      VARCHAR(50),
fs_def_lang                    VARCHAR(20),
fs_lang                        VARCHAR(20),
fs_top_margin                  VARCHAR(6),
fs_left_margin                 VARCHAR(6),
fs_form_border_check           VARCHAR(16),
fs_header_width                VARCHAR(20),
fs_header_display              VARCHAR(30),
fs_firm_left_logo_check        VARCHAR(16),
fs_firm_right_logo_check       VARCHAR(16),
fs_cust_image_check            VARCHAR(16),
fs_header_left_section         VARCHAR(100),
fs_header_left_section_font    VARCHAR(20),
fs_header_left_section_color   VARCHAR(30),
fs_header_left_sec_check       VARCHAR(16),
fs_header_right_section        VARCHAR(100),
fs_header_right_section_font   VARCHAR(20),
fs_header_right_section_color  VARCHAR(30),
fs_header_right_sec_check      VARCHAR(16),
fs_header                      VARCHAR(100),
fs_header_font                 VARCHAR(20),
fs_header_color                VARCHAR(30),
fs_header_check                VARCHAR(16),
fs_form_header_font            VARCHAR(20),
fs_form_header_color           VARCHAR(30),
fs_form_header_check           VARCHAR(16),
fs_firm_name_font              VARCHAR(20),
fs_firm_name_color             VARCHAR(30),
fs_firm_name_check             VARCHAR(16),
fs_firm_desc_font              VARCHAR(20),
fs_firm_desc_color             VARCHAR(30),
fs_firm_desc_check             VARCHAR(16),
fs_firm_address_font           VARCHAR(20),
fs_firm_address_color          VARCHAR(30),
fs_firm_address_check          VARCHAR(16),
fs_firm_phone_font             VARCHAR(20),
fs_firm_phone_color            VARCHAR(30),
fs_firm_phone_check            VARCHAR(16),
fs_firm_email_font             VARCHAR(20),
fs_firm_email_color            VARCHAR(30),
fs_firm_email_check            VARCHAR(16),
fs_firm_regno_label            VARCHAR(100),
fs_firm_regno_font             VARCHAR(20),
fs_firm_regno_color            VARCHAR(30),
fs_firm_regno_check            VARCHAR(16),
fs_s_no_lbl                    VARCHAR(100),
fs_s_no_font                   VARCHAR(20),
fs_s_no_color                  VARCHAR(30),
fs_s_no_lbl_check              VARCHAR(16),
fs_date_lbl                    VARCHAR(100),
fs_date_font                   VARCHAR(20),
fs_date_color                  VARCHAR(30),
fs_cust_pawner_lbl             VARCHAR(100),
fs_cust_pawner_font            VARCHAR(20),
fs_cust_pawner_color           VARCHAR(30),
fs_cust_pawner_check           VARCHAR(16),
fs_father_lbl                  VARCHAR(100),
fs_spouse_lbl                  VARCHAR(150),
fs_guardian_lbl                VARCHAR(150),
fs_father_font                 VARCHAR(20),
fs_father_color                VARCHAR(30),
fs_father_check                VARCHAR(16),
fs_add_lbl                     VARCHAR(100),
fs_add_font                    VARCHAR(20),
fs_add_color                   VARCHAR(30),
fs_add_check                   VARCHAR(16),
fs_village_lbl                  VARCHAR(100),
fs_village_font                 VARCHAR(20),
fs_village_color                VARCHAR(30),
fs_village_check                VARCHAR(16),
fs_tehsil_lbl                   VARCHAR(100),
fs_tehsil_font                  VARCHAR(20),
fs_tehsil_color                 VARCHAR(30),
fs_tehsil_check                 VARCHAR(16),
fs_city_lbl                     VARCHAR(100),
fs_city_font                    VARCHAR(20),
fs_city_color                   VARCHAR(30),
fs_city_check                   VARCHAR(16),
fs_pincode_lbl                 VARCHAR(100),
fs_pincode_font                VARCHAR(20),
fs_pincode_color               VARCHAR(30),
fs_pincode_check               VARCHAR(16),
fs_principal_lbl               VARCHAR(100),
fs_principal_font              VARCHAR(20),
fs_principal_color             VARCHAR(30),
fs_principal_check             VARCHAR(16),
fs_roi_lbl                     VARCHAR(100),
fs_roi_font                    VARCHAR(20),
fs_roi_color                   VARCHAR(30),
fs_roi_check                   VARCHAR(16),

fs_discount_lbl                VARCHAR(100),
fs_discount_font               VARCHAR(20),
fs_discount_color              VARCHAR(30),
fs_discount_check              VARCHAR(16),
fs_extra_amt_lbl               VARCHAR(100),
fs_extra_amt_font              VARCHAR(20),
fs_extra_amt_color             VARCHAR(30),
fs_extra_amt_check             VARCHAR(16),

fs_valuation_lbl               VARCHAR(100),
fs_valuation_font              VARCHAR(20),
fs_valuation_color             VARCHAR(30),
fs_valuation_check             VARCHAR(16),
fs_redemption_lbl              VARCHAR(100),
fs_redemption_font             VARCHAR(20),
fs_redemption_color            VARCHAR(30),
fs_redemption_check            VARCHAR(16),
fs_other_info_lbl              VARCHAR(100),
fs_other_info_font             VARCHAR(20),
fs_other_info_color            VARCHAR(30),
fs_other_info_content_font     VARCHAR(20),
fs_other_info_content_color    VARCHAR(30),
fs_other_info_check            VARCHAR(16),
fs_tnc_lbl                     VARCHAR(100),
fs_tnc_font                    VARCHAR(20),
fs_tnc_color                   VARCHAR(30),
fs_tnc_content_font             VARCHAR(20),
fs_tnc_content_color           VARCHAR(30),
fs_tnc                         VARCHAR(2000),
fs_tnc_check                   VARCHAR(16),
fs_cust_sign_lbl               VARCHAR(100),
fs_cust_sign_font              VARCHAR(20),
fs_cust_sign_color             VARCHAR(30),
fs_owner_sign_lbl              VARCHAR(100),
fs_owner_sign_font             VARCHAR(20),
fs_owner_sign_color            VARCHAR(30),
fs_footer                      VARCHAR(100),
fs_footer_font                 VARCHAR(20),
fs_footer_color                VARCHAR(30),
fs_footer_check                VARCHAR(16),
fs_form_size                   VARCHAR(20),
fs_default_size                VARCHAR(20),
fs_form_width                  VARCHAR(6),
fs_form_staff_id           	VARCHAR(16),
fs_form_right_logo           	VARCHAR(16),
fs_form_date_format           	VARCHAR(16),
fs_form_sign_check           	VARCHAR(6),
last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
//
?>