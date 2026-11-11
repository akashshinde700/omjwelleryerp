<?php

/*
 * **************************************************************************************
 * @tutorial: Loan Notice Setup Table
 * **************************************************************************************
 * 
 * Created on Jan 5, 2013 3:51:54 PM
 *
 * @FileName: omtbgvnt.php
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

$query = "CREATE TABLE IF NOT EXISTS loan_notice_setup (
lns_id                          INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
lns_own_id                      VARCHAR(50),
lns_def_lang                    VARCHAR(20),
lns_lang                        VARCHAR(20),
lns_top_margin                  VARCHAR(6),  
lns_left_margin                 VARCHAR(6),  
lns_border_check                VARCHAR(6), 
lns_header_width                VARCHAR(20),
lns_header_display              VARCHAR(30),
lns_firm_left_logo_check        VARCHAR(6),
lns_firm_right_logo_check       VARCHAR(6),
lns_cust_image_check            VARCHAR(6),
lns_header_left_section         VARCHAR(100),
lns_header_left_section_font    VARCHAR(20),
lns_header_left_section_color   VARCHAR(30),
lns_header_left_sec_check       VARCHAR(6),
lns_header_right_section        VARCHAR(100),
lns_header_right_section_font   VARCHAR(20),
lns_header_right_section_color  VARCHAR(30),
lns_header_right_sec_check      VARCHAR(6),
lns_header                      VARCHAR(100),
lns_header_font                 VARCHAR(20),
lns_header_color                VARCHAR(30),
lns_header_check                VARCHAR(6),
lns_firm_header_font            VARCHAR(20),
lns_firm_header_color           VARCHAR(30),
lns_firm_header_check           VARCHAR(6),
lns_firm_name_font              VARCHAR(20),
lns_firm_name_color             VARCHAR(30),
lns_firm_name_check             VARCHAR(6),
lns_firm_desc_font              VARCHAR(20),
lns_firm_desc_color             VARCHAR(30),
lns_firm_desc_check             VARCHAR(6),
lns_firm_address_font           VARCHAR(20),
lns_firm_address_color          VARCHAR(30),
lns_firm_address_check          VARCHAR(6),
lns_firm_phone_font             VARCHAR(20),
lns_firm_phone_color            VARCHAR(30),
lns_firm_phone_check            VARCHAR(6),
lns_firm_email_font             VARCHAR(20),
lns_firm_email_color            VARCHAR(30),
lns_firm_email_check            VARCHAR(6),
lns_firm_regno_label            VARCHAR(100),
lns_firm_regno_font             VARCHAR(20),
lns_firm_regno_color            VARCHAR(30),
lns_firm_regno_check            VARCHAR(6),
lns_cust_name_lbl               VARCHAR(150),
lns_cust_name_font              VARCHAR(20),
lns_cust_name_color             VARCHAR(30),
lns_cust_name_check             VARCHAR(6),
lns_date_lbl                    VARCHAR(20),
lns_date_font                   VARCHAR(20),
lns_date_color                  VARCHAR(30),
lns_father_spouse_lbl           VARCHAR(150),
lns_father_font                 VARCHAR(20),
lns_father_color                VARCHAR(30),
lns_father_check                VARCHAR(6),
lns_wife_of_lbl                 VARCHAR(150),
lns_guardian_lbl                VARCHAR(150),
lns_wife_of_font                VARCHAR(20),
lns_wife_of_color               VARCHAR(30),
lns_wife_of_check               VARCHAR(6),
lns_cust_add_lbl                VARCHAR(150),
lns_cust_add_font               VARCHAR(20),
lns_cust_add_color              VARCHAR(30),
lns_cust_add_check              VARCHAR(6),
lns_notice_cont                 VARCHAR(2000),
lns_notice_font                 VARCHAR(20),
lns_notice_color                VARCHAR(30),
lns_notice_check                VARCHAR(6),
lns_loan_detail_lbl             VARCHAR(150),
lns_loan_detail_font            VARCHAR(20),
lns_loan_detail_color           VARCHAR(30),
lns_loan_detail_check           VARCHAR(6),
lns_loan_date_lbl               VARCHAR(150),
lns_loan_date_font              VARCHAR(20),
lns_loan_date_color             VARCHAR(30),
lns_loan_date_check             VARCHAR(6),
lns_principal_lbl               VARCHAR(150),
lns_principal_font              VARCHAR(20),
lns_principal_color             VARCHAR(30),
lns_principal_check             VARCHAR(6),
lns_interest_lbl                VARCHAR(150),
lns_interest_font               VARCHAR(20),
lns_interest_color              VARCHAR(30),
lns_interest_check              VARCHAR(6),
lns_total_amt_lbl               VARCHAR(150),
lns_total_amt_font              VARCHAR(20),
lns_total_amt_color             VARCHAR(30),
lns_total_amt_check             VARCHAR(6),
lns_articles_lbl                VARCHAR(500),
lns_articles_font               VARCHAR(20),
lns_articles_color              VARCHAR(30),
lns_articles_check              VARCHAR(6),
lns_tnc_lbl                     VARCHAR(100),
lns_tnc_font                    VARCHAR(20),
lns_tnc_color                   VARCHAR(30),
lns_tnc_content_font            VARCHAR(20),
lns_tnc_content_color           VARCHAR(30),
lns_tnc                         VARCHAR(2000),
lns_tnc_check                   VARCHAR(6),
lns_cust_sign_lbl               VARCHAR(150),
lns_cust_sign_font              VARCHAR(20),
lns_cust_sign_color             VARCHAR(30),
lns_owner_sign_lbl              VARCHAR(150),
lns_owner_sign_font             VARCHAR(20),
lns_owner_sign_color            VARCHAR(30),
lns_footer                      VARCHAR(200),
lns_footer_font                 VARCHAR(20),
lns_footer_color                VARCHAR(30),
lns_footer_check                VARCHAR(6),
lns_since                       DATETIME,
lns_other_info                  VARCHAR(500),
lns_cusmnot_content             VARCHAR(2000),
lns_cusmnot_width               VARCHAR(6),
lns_cusmnot_height              VARCHAR(6),
lns_form_size                   VARCHAR(20),
lns_default_size                VARCHAR(20),
lns_form_width                  VARCHAR(6),
lns_staff_id                   	VARCHAR(16),
last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';

?>