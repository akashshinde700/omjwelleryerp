<?php

/*
 * **************************************************************************************
 * @tutorial: Form N/8 Setup Table @Author: KHUSH11JAN13 
 * **************************************************************************************
 *
 * Created on Jan 11, 2013 10:23:11 AM
 *
 * @FileName: omtbfest.php
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
$query = "CREATE TABLE IF NOT EXISTS form_eight_setup (
fes_id                          INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
fes_own_id                      VARCHAR(50),
fes_def_lang                    VARCHAR(20),
fes_lang                        VARCHAR(20),
fes_top_margin                  VARCHAR(6),
fes_left_margin                 VARCHAR(6),
fes_form_border_check           VARCHAR(16),
fes_header_width                VARCHAR(20),
fes_header_display              VARCHAR(30),
fes_firm_left_logo_check        VARCHAR(16),
fes_firm_right_logo_check       VARCHAR(16),
fes_cust_image_check            VARCHAR(16),
fes_cust_image_height            VARCHAR(10),
fes_cust_image_width            VARCHAR(10),
fes_header_left_section         VARCHAR(100),
fes_header_left_section_font    VARCHAR(20),
fes_header_left_section_color   VARCHAR(30),
fes_header_left_sec_check       VARCHAR(16),
fes_header_right_section        VARCHAR(100),
fes_header_right_section_font   VARCHAR(20),
fes_header_right_section_color  VARCHAR(30),
fes_header_right_sec_check      VARCHAR(16),
fes_header                      VARCHAR(100),
fes_header_font                 VARCHAR(20),
fes_header_color                VARCHAR(30),
fes_header_check                VARCHAR(16),
fes_header_content              VARCHAR(100),       
fes_header_content_font         VARCHAR(20),       
fes_header_content_color        VARCHAR(30),        
fes_header_content_check        VARCHAR(16),
fes_form_header_font            VARCHAR(20),
fes_form_header_color           VARCHAR(30),
fes_form_header_check           VARCHAR(16),
fes_firm_name_font              VARCHAR(20),
fes_firm_name_color             VARCHAR(30),
fes_firm_name_check             VARCHAR(16),
fes_firm_desc_font              VARCHAR(20),
fes_firm_desc_color             VARCHAR(30),
fes_firm_desc_check             VARCHAR(16),
fes_firm_address_font           VARCHAR(20),
fes_firm_address_color          VARCHAR(30),
fes_firm_address_check          VARCHAR(16),
fes_firm_phone_font             VARCHAR(20),
fes_firm_phone_color            VARCHAR(30),
fes_firm_phone_check            VARCHAR(16),
fes_firm_email_font             VARCHAR(20),
fes_firm_email_color            VARCHAR(30),
fes_firm_email_check            VARCHAR(16),
fes_firm_regno_label            VARCHAR(100),
fes_firm_regno_font             VARCHAR(20),
fes_firm_regno_color            VARCHAR(30),
fes_firm_regno_check            VARCHAR(16),
fes_s_no_lbl                    VARCHAR(100),
fes_s_no_font                   VARCHAR(20),
fes_s_no_color                  VARCHAR(30),
fes_s_no_lbl_check              VARCHAR(16),
fes_date_lbl                    VARCHAR(100),
fes_date_font                   VARCHAR(20),
fes_date_color                  VARCHAR(30),
fes_due_date_lbl                    VARCHAR(100),
fes_due_date_font                   VARCHAR(20),
fes_due_date_color                  VARCHAR(30),
fes_due_date_check                VARCHAR(16),
fes_roi_value_bydefault           VARCHAR(16),
fes_dur_oth_lang_lbl                   VARCHAR(100),
fes_dur_oth_lang_font                   VARCHAR(20),
fes_dur_oth_lang_color                  VARCHAR(30),
fes_dur_oth_lang_check                VARCHAR(16),
fes_duration_lbl                   VARCHAR(100),
fes_duration_font                   VARCHAR(20),
fes_duration_color                  VARCHAR(30),
fes_duration_check                VARCHAR(16),
fes_cust_pawner_lbl             VARCHAR(100),
fes_cust_pawner_font            VARCHAR(20),
fes_cust_pawner_color           VARCHAR(30),
fes_cust_pawner_check           VARCHAR(16),
fes_custId_lbl                  VARCHAR(100),      
fes_custId_font                 VARCHAR(20),       
fes_custId_color                VARCHAR(30),        
fes_custId_check                VARCHAR(16),
fes_father_lbl                  VARCHAR(100),
fes_spouse_lbl                  VARCHAR(150),
fes_guardian_lbl                VARCHAR(150),
fes_father_font                 VARCHAR(20),
fes_father_color                VARCHAR(30),
fes_father_check                VARCHAR(16),
fes_add_lbl                     VARCHAR(100),
fes_add_font                    VARCHAR(20),
fes_add_color                   VARCHAR(30),
fes_add_check                   VARCHAR(16),
fes_adhaar_lbl                  VARCHAR(100),
fes_adhaar_font                 VARCHAR(20),
fes_adhaar_color                VARCHAR(30),
fes_adhaar_check                VARCHAR(16),
fes_village_lbl                 VARCHAR(100),
fes_village_font                VARCHAR(20),
fes_village_color               VARCHAR(30),
fes_village_check               VARCHAR(16),
fes_tehsil_lbl                  VARCHAR(100),
fes_tehsil_font                 VARCHAR(20),
fes_tehsil_color                VARCHAR(30),
fes_tehsil_check                VARCHAR(16),
fes_city_lbl                    VARCHAR(100),
fes_city_font                   VARCHAR(20),
fes_city_color                  VARCHAR(30),
fes_city_check                  VARCHAR(16),
fes_pincode_lbl                 VARCHAR(100),
fes_pincode_font                VARCHAR(20),
fes_pincode_color               VARCHAR(30),
fes_pincode_check               VARCHAR(16),
fes_phone_lbl                   VARCHAR(100),
fes_phone_font                  VARCHAR(20),
fes_phone_color                 VARCHAR(30),
fes_phone_check                 VARCHAR(16),"
// START TO ADD COLUMN TO STORE USER INCOME FIELD DETAILS @AUTHOR:MADHUREE-19MARCH2020
."fes_user_income                 VARCHAR(2000),
fes_user_income_check           VARCHAR(16),
fes_user_income_font            VARCHAR(20),
fes_user_income_color           VARCHAR(30),"
// END TO ADD COLUMN TO STORE USER INCOME FIELD DETAILS @AUTHOR:MADHUREE-19MARCH2020
."fes_monthly_income              VARCHAR(2000),
fes_monthly_income_check        VARCHAR(16),
fes_monthly_income_font         VARCHAR(20),
fes_monthly_income_color        VARCHAR(30),
fes_article_item_lbl            VARCHAR(100),
fes_article_item_font           VARCHAR(20),
fes_article_item_color          VARCHAR(30),
fes_article_lbl            VARCHAR(100),
fes_article_font           VARCHAR(20),
fes_article_color          VARCHAR(30),
fes_design_lbl            VARCHAR(100),
fes_design_check          VARCHAR(16),
fes_article_item_check          VARCHAR(16),
fes_pieces_quant_lbl            VARCHAR(100),
fes_pieces_quant_font           VARCHAR(20),
fes_pieces_quant_color          VARCHAR(30),
fes_pieces_quant_check          VARCHAR(16),
fes_metal_lbl                   VARCHAR(100),
fes_metal_font                  VARCHAR(20),
fes_metal_color                 VARCHAR(30),
fes_metal_check                 VARCHAR(16),
fes_gross_wt_lbl                VARCHAR(100),
fes_gross_wt_font               VARCHAR(20),
fes_gross_wt_color              VARCHAR(30),
fes_gross_wt_check              VARCHAR(16),
fes_less_wt_lbl                VARCHAR(100),
fes_less_wt_font               VARCHAR(20),
fes_less_wt_color              VARCHAR(30),
fes_less_wt_check              VARCHAR(16),
fes_net_wt_lbl                  VARCHAR(100),
fes_net_wt_font                 VARCHAR(20),
fes_net_wt_color                VARCHAR(30),
fes_net_wt_check                VARCHAR(16),
fes_fine_wt_lbl                 VARCHAR(100),
fes_fine_wt_font                VARCHAR(20),
fes_fine_wt_color               VARCHAR(30),
fes_fine_wt_check               VARCHAR(16),
fes_principal_lbl               VARCHAR(100),
fes_principal_font              VARCHAR(20),
fes_principal_color             VARCHAR(30),
fes_principal_check             VARCHAR(16),
fes_roi_lbl                     VARCHAR(100),
fes_roi_font                    VARCHAR(20),
fes_roi_color                   VARCHAR(30),
fes_roi_check                   VARCHAR(16),
fes_time_period_lbl             VARCHAR(100),
fes_timeperiod_font             VARCHAR(20),
fes_timeperiod_color            VARCHAR(30),
fes_time_period_check           VARCHAR(16),
fes_purity_lbl                  VARCHAR(100),      
fes_purity_content_font         VARCHAR(20),       
fes_purity_content_color        VARCHAR(30),        
fes_purity_content_check        VARCHAR(16),
fes_valuation_lbl               VARCHAR(100),
fes_valuation_font              VARCHAR(20),
fes_valuation_color             VARCHAR(30),
fes_valuation_check             VARCHAR(16),
fes_redemption_lbl              VARCHAR(100),
fes_redemption_font             VARCHAR(20),
fes_redemption_color            VARCHAR(30),
fes_redemption_check            VARCHAR(16),
fes_other_info_lbl              VARCHAR(100),
fes_other_info_font             VARCHAR(20),
fes_other_info_color            VARCHAR(30),
fes_other_info_content_font     VARCHAR(20),
fes_other_info_content_color    VARCHAR(30),
fes_other_info_check            VARCHAR(16),
fes_tnc_lbl                     VARCHAR(100),
fes_tnc_font                    VARCHAR(20),
fes_tnc_color                   VARCHAR(30),
fes_tnc_content_font             VARCHAR(20),
fes_tnc_content_color           VARCHAR(30),
fes_tnc                         TEXT,
fes_tnc_check                   VARCHAR(16),
fes_cust_sign_lbl               VARCHAR(100),
fes_cust_sign_font              VARCHAR(20),
fes_cust_sign_color             VARCHAR(30),
fes_cust_sign_check          VARCHAR(16),
fes_owner_sign_lbl              VARCHAR(100),
fes_owner_sign_font             VARCHAR(20),
fes_owner_sign_color            VARCHAR(30),
fes_owner_sign_check          VARCHAR(16),
fes_footer                      VARCHAR(100),
fes_footer_font                 VARCHAR(20),
fes_footer_color                VARCHAR(30),
fes_footer_check                VARCHAR(16),
fes_form_size                   VARCHAR(20),
fes_default_size                VARCHAR(20),
fes_form_width                  VARCHAR(6),
fes_form_height1                VARCHAR(6), 
fes_form_height2                VARCHAR(6), 
fes_form_staff_id           	VARCHAR(16),
fes_form_right_logo           	VARCHAR(16),
fes_form_date_format           	VARCHAR(16),
fes_cotent_font_color           VARCHAR(16),
fes_image_border_check          VARCHAR(16),
fes_firm_name_font_family       VARCHAR(16),
fes_form_article_chk            VARCHAR(16),
fes_additional_principle_lbl    VARCHAR(20),
fes_additional_principle_font   VARCHAR(10),
fes_additional_principle_color  VARCHAR(20),
fes_additional_principle_check  VARCHAR(20),
fes_interest_slab_lbl           VARCHAR(32),
fes_interest_slab_font          VARCHAR(8),
fes_interest_slab_color         VARCHAR(16),
fes_interest_slab               VARCHAR(8),
fes_interest_slab_check         VARCHAR(8),
fes_barcode_check               VARCHAR(8),
fes_show_barcode_block          VARCHAR(8),
fes_table_height               VARCHAR(8),
fes_deposit_font VARCHAR(20),
fes_deposit_check VARCHAR(16),
fes_payment_font VARCHAR(20),
fes_payment_check VARCHAR(16),
fes_prod_img_check         VARCHAR(8),
fes_end_date_lbl    VARCHAR(32),
fes_end_date_font   VARCHAR(8),
fes_end_date_color  VARCHAR(16),
fes_end_date_check  VARCHAR(8),
fes_form_sign_check           	VARCHAR(6),"
// START TO ADD COLUMN TO STORE USER FIRST MONT INTREST DETAILS @AUTHOR:PRATIKSHA-4 APRIL 2025
."fst_mn_int_lbl          VARCHAR(30), 
fes_mn_int_item_font    VARCHAR(30),
fes_mn_int_item_colour  VARCHAR(30),
fes_mn_int_item_chk     VARCHAR(30),
last_column                VARCHAR(1))AUTO_INCREMENT=1";
// END TO ADD COLUMN TO STORE USER FIRST MONT INTREST DETAILS @AUTHOR:PRATIKSHA-4 APRIL 2025
if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}

// Check if fes_tnc column is VARCHAR(2000) and update to TEXT if needed
$checkQuery = "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH 
               FROM INFORMATION_SCHEMA.COLUMNS 
               WHERE TABLE_NAME = 'form_eight_setup' 
               AND COLUMN_NAME = 'fes_tnc' 
               AND TABLE_SCHEMA = DATABASE()";

$result = mysqli_query($conn, $checkQuery);

if ($result && mysqli_num_rows($result) > 0) {
    $row = mysqli_fetch_assoc($result);
    
    // Check if it's VARCHAR with length 2000
    if ($row['DATA_TYPE'] === 'varchar' && $row['CHARACTER_MAXIMUM_LENGTH'] == 2000) {
        $alterQuery = "ALTER TABLE form_eight_setup MODIFY COLUMN fes_tnc TEXT";
        
        if (mysqli_query($conn, $alterQuery)) {
            // Optional: Log the successful update
            // echo "Column fes_tnc successfully updated to TEXT datatype";
        } else {
            die('Error updating fes_tnc column: ' . mysqli_error($conn));
        }
    }
}

//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>