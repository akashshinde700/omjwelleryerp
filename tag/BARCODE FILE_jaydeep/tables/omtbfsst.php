<?php

/*
 * **************************************************************************************
 * @tutorial: Database File to Create Form R/7 Update Language Panel by @Author: KHUSH14JAN13
 * **************************************************************************************
 * 
 * Created on Jan 14, 2013 1:18:29 PM
 *
 * @FileName: omtbfsst.php
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

$query = "CREATE TABLE IF NOT EXISTS form_seven_setup (
fss_id                          INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
fss_own_id                      VARCHAR(50),
fss_def_lang                    VARCHAR(20),
fss_lang                        VARCHAR(20),
fss_top_margin                  VARCHAR(6),  
fss_left_margin                 VARCHAR(6),  
fss_header_width                VARCHAR(20),
fss_header_display              VARCHAR(30),
fss_form_border_check           VARCHAR(16),
fss_firm_left_logo_check        VARCHAR(16),
fss_firm_right_logo_check       VARCHAR(16),
fss_header_left_section         VARCHAR(100),
fss_header_left_section_font    VARCHAR(20),
fss_header_left_section_color   VARCHAR(30),
fss_header_left_sec_check       VARCHAR(16),
fss_header_right_section        VARCHAR(100),
fss_header_right_section_font   VARCHAR(20),
fss_header_right_section_color  VARCHAR(30),
fss_header_right_sec_check      VARCHAR(16),
fss_header                      VARCHAR(100),
fss_header_font                 VARCHAR(20),
fss_header_color                VARCHAR(30),
fss_header_check                VARCHAR(16),
fss_header_content              VARCHAR(150),
fss_header_content_font         VARCHAR(20),
fss_header_content_color        VARCHAR(30),
fss_header_content_check        VARCHAR(16),
fss_firm_header_font            VARCHAR(20),
fss_firm_header_color           VARCHAR(30),
fss_firm_header_check           VARCHAR(16),
fss_firm_name_font              VARCHAR(20),
fss_firm_name_color             VARCHAR(30),
fss_firm_name_check             VARCHAR(16),
fss_firm_desc_font              VARCHAR(20),
fss_firm_desc_color             VARCHAR(30),
fss_firm_desc_check             VARCHAR(16),
fss_firm_address_font           VARCHAR(20),
fss_firm_address_color          VARCHAR(30),
fss_firm_address_check          VARCHAR(16),
fss_firm_phone_font             VARCHAR(20),
fss_firm_phone_color            VARCHAR(30),
fss_firm_phone_check            VARCHAR(16),
fss_firm_email_font             VARCHAR(20),
fss_firm_email_color            VARCHAR(30),
fss_firm_email_check            VARCHAR(16),
fss_reg_no_label                VARCHAR(100),
fss_reg_no_font                 VARCHAR(20),
fss_reg_no_color                VARCHAR(30),
fss_reg_no_check                VARCHAR(16),
fss_s_no                        VARCHAR(50),
fss_s_no_font                   VARCHAR(20),
fss_s_no_color                  VARCHAR(30),
fss_s_check                     VARCHAR(50),
fss_rel_no                      VARCHAR(50),
fss_rel_no_font                 VARCHAR(20),
fss_rel_no_color                VARCHAR(30),
fss_rel_check                   VARCHAR(50),
fss_metal_details_check         VARCHAR(50),
fss_date_lbl                    VARCHAR(20),
fss_date_font                   VARCHAR(20),
fss_date_color                  VARCHAR(30),
fss_content                     VARCHAR(2000),
fss_content_font                VARCHAR(20),
fss_content_color               VARCHAR(30),
fss_content_check               VARCHAR(16),
fss_details                     VARCHAR(20),
fss_details_check               VARCHAR(16),
fss_principal_amt               VARCHAR(50),
fss_principal_font              VARCHAR(20),
fss_principal_color             VARCHAR(30),
fss_principal_amt_check         VARCHAR(16),
fss_total_interest              VARCHAR(80),
fss_total_interest_font         VARCHAR(20),
fss_total_interest_color        VARCHAR(30),
fss_total_interest_check        VARCHAR(16),
fss_total_amt                   VARCHAR(80),
fss_total_amt_font              VARCHAR(20),
fss_total_amt_color             VARCHAR(30),
fss_total_amt_check             VARCHAR(16),
fss_other_info                  VARCHAR(80),
fss_other_info_font             VARCHAR(20),
fss_other_info_color            VARCHAR(30),
fss_other_info_content_font     VARCHAR(20),
fss_other_info_content_color    VARCHAR(30),
fss_other_info_check            VARCHAR(16),
fss_tnc_lbl                     VARCHAR(100),
fss_tnc                         VARCHAR(2000),
fss_tnc_font                    VARCHAR(20),
fss_tnc_color                   VARCHAR(30),
fss_tnc_content_font            VARCHAR(20),
fss_tnc_content_color           VARCHAR(30),
fss_tnc_check                   VARCHAR(16),
fss_cust_sign                   VARCHAR(100),
fss_cust_sign_font              VARCHAR(20),
fss_cust_sign_color             VARCHAR(30),
fss_owner_sign                  VARCHAR(100),
fss_owner_sign_font             VARCHAR(20),
fss_owner_sign_color            VARCHAR(30),
fss_footer                      VARCHAR(100),
fss_footer_font                 VARCHAR(20),
fss_footer_color                VARCHAR(30),
fss_footer_check                VARCHAR(16),
fss_cust_image_check            VARCHAR(16),
fss_form_size                   VARCHAR(20),
fss_default_size                VARCHAR(20),
fss_form_width                  VARCHAR(6),
fss_auction_chrg                VARCHAR(100),   
fss_auction_chrg_font           VARCHAR(10),
fss_auction_chrg_color          VARCHAR(10),
fss_auction_chrg_check          VARCHAR(16),
fss_auction_extra_chrg          VARCHAR(100),
fss_auction_extra_chrg_font     VARCHAR(10),
fss_auction_extra_chrg_color    VARCHAR(6),
fss_auction_extra_chrg_check    VARCHAR(16),
fss_discount_amt                VARCHAR(80),  
fss_discount_font               VARCHAR(20),
fss_discount_color              VARCHAR(30),
fss_discount_amt_check          VARCHAR(16),
    fss_extra_amt                   VARCHAR(80),  
    fss_extra_font                  VARCHAR(20),
    fss_extra_color                 VARCHAR(30),
    fss_extra_amt_check             VARCHAR(16),
    fss_amt_already_paid            VARCHAR(80),
    fss_amt_already_paid_font       VARCHAR(20),
    fss_amt_already_paid_color      VARCHAR(30),
    fss_amt_already_paid_check      VARCHAR(16),
    fss_total_interest_paid         VARCHAR(80),
    fss_total_interest_paid_font    VARCHAR(20),
    fss_total_interest_paid_color   VARCHAR(30),
    fss_total_interest_paid_check   VARCHAR(16),
    fss_paid_on_redemption          VARCHAR(80),
    fss_paid_on_redemption_font     VARCHAR(20),
    fss_paid_on_redemption_color    VARCHAR(30),
    fss_paid_on_redemption_check    VARCHAR(16),
    fss_no_of_months_paid           VARCHAR(80),
    fss_no_of_months_paid_font      VARCHAR(20),
    fss_no_of_months_paid_color     VARCHAR(30),
    fss_no_of_months_paid_check     VARCHAR(16),
    fss_mode_of_payment             VARCHAR(80),
    fss_mode_of_payment_font        VARCHAR(20),
    fss_mode_of_payment_color       VARCHAR(30),
    fss_mode_of_payment_check       VARCHAR(16),
    fss_girvi_items_details         VARCHAR(200),
    fss_girvi_items_details_font    VARCHAR(20),
    fss_girvi_items_details_color   VARCHAR(30),
    fss_girvi_items_details_check   VARCHAR(16),
    fss_form_staff_id           	VARCHAR(16),
    last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';

?>