<?php 
// file name: omtbfst_insert_labels.php
// ======================================================================================================= //
// START CODE TO ADD CONDITION FOR INSERTING ENTRY ONLY IF ENTRY IS NOT PRESENT @AUTHOR:MADHUREE-11NOV2020 //
// ======================================================================================================= //
//
$qformSetupDetails = "SELECT * FROM form_setup WHERE fs_def_lang = 'English'";
$resformSetupDetails = mysqli_query($conn, $qformSetupDetails) or die(mysqli_error($conn));
$totalFormSetupDetails = mysqli_num_rows($resformSetupDetails);
if ($totalFormSetupDetails <= 0) {
    /*     * **End Code To Add Column fs_roi_check @AUTHOR:PRIYA06APR13**** */
//Start Code to Setup table for ENG Lang
    /*     * **Start Code To Add in caps @Author:PRIYA22APR14**** */
    $defLang = 'English';
    $newLang = 'English';
    $sNoLabel = 'S. NO:';
    $regNoLabel = 'REGISTRATION NUMBER';
    $headerLabel = 'FORM';
    $valLabel = 'VALUATION';
    $dateLabel = 'DATE:';
    $custOrPawnerNameLabel = 'CUSTOMER NAME:'; //Pawner removed @Author:PRIYA28DEC13
    $fatherNameLabel = 'FATHER NAME:';
    $addressLabel = 'ADDRESS:';
//Start code to add the variable Author:GAUR30MAY16
    $villageLabel = 'VILLAGE:';
    $tehsilLabel = 'TEHSIL:';
    $cityLabel = 'CITY:';
    $pinCodeLabel = 'PIN CODE:';
//Start code to add the variable Author:GAUR30MAY16
    $principalAmountLabel = 'LOAN AMOUNT:';
    $rateOfInterestLabel = 'DEPOSIT AMOUNT:';
    $redemptionPeriodLabel = 'REDEMPTION PERIOD: 11 (Eleven) months time only';
    $otherInfoLabel = 'OTHER INFORMATION:';
    $tNCLabel = 'TERMS AND CONDITIONS:';
    $tNC = '';
    $custSign = 'CUSTOMER SIGNATURE';
    $ownerSign = 'OWNER SIGNATURE';
    $footerLabel = '';
    /*     * **End Code To Add in caps @Author:PRIYA22APR14**** */
// Start To protect MySQL injection
    $defLang = stripslashes($defLang);
    $newLang = stripslashes($newLang);
    $sNoLabel = stripslashes($sNoLabel);                                                //Modified by KHUSH12JAN13
    $headerLabel = stripslashes($headerLabel);
    $dateLabel = stripslashes($dateLabel);
    $custOrPawnerNameLabel = stripslashes($custOrPawnerNameLabel);
    $fatherNameLabel = stripslashes($fatherNameLabel);
    $addressLabel = stripslashes($addressLabel);
//Start code to add the variable Author:GAUR30MAY16
    $villageLabel = stripslashes($villageLabel);
    $tehsilLabel = stripslashes($tehsilLabel);
    $cityLabel = stripslashes($cityLabel);
    $pinCodeLabel = stripslashes($pinCodeLabel);
//END code to add the variable Author:GAUR30MAY16
    $principalAmountLabel = stripslashes($principalAmountLabel);
    $rateOfInterestLabel = stripslashes($rateOfInterestLabel);
    $redemptionPeriodLabel = stripslashes($redemptionPeriodLabel);
    $otherInfoLabel = stripslashes($otherInfoLabel);
    $tNCLabel = stripslashes($tNCLabel);
    $tNC = stripslashes($tNC);
    $custSign = stripslashes($custSign);
    $ownerSign = stripslashes($ownerSign);
    $footerLabel = stripslashes($footerLabel);


    $defLang = mysqli_real_escape_string($conn, $defLang);
    $newLang = mysqli_real_escape_string($conn, $newLang);
    $sNoLabel = mysqli_real_escape_string($conn, $sNoLabel);
    $headerLabel = mysqli_real_escape_string($conn, $headerLabel);
    $dateLabel = mysqli_real_escape_string($conn, $dateLabel);
    $custOrPawnerNameLabel = mysqli_real_escape_string($conn, $custOrPawnerNameLabel);
    $fatherNameLabel = mysqli_real_escape_string($conn, $fatherNameLabel);
    $addressLabel = mysqli_real_escape_string($conn, $addressLabel);
//Start code to add the variable Author:GAUR30MAY16
    $villageLabel = mysqli_real_escape_string($conn, $villageLabel);
    $tehsilLabel = mysqli_real_escape_string($conn, $tehsilLabel);
    $cityLabel = mysqli_real_escape_string($conn, $cityLabel);
    $pinCodeLabel = mysqli_real_escape_string($conn, $pinCodeLabel);
//END code to add the variable Author:GAUR30MAY16
    $principalAmountLabel = mysqli_real_escape_string($conn, $principalAmountLabel);
    $rateOfInterestLabel = mysqli_real_escape_string($conn, $rateOfInterestLabel);
    $redemptionPeriodLabel = mysqli_real_escape_string($conn, $redemptionPeriodLabel);
    $otherInfoLabel = mysqli_real_escape_string($conn, $otherInfoLabel);
    $tNCLabel = mysqli_real_escape_string($conn, $tNCLabel);
    $tNC = mysqli_real_escape_string($conn, $tNC);
    $custSign = mysqli_real_escape_string($conn, $custSign);
    $ownerSign = mysqli_real_escape_string($conn, $ownerSign);
    $footerLabel = mysqli_real_escape_string($conn, $footerLabel);
// End To protect MySQL injection
    /*     * *************Start code to add fields @Author:PRIYA22MAR14************** */
    $qInsertFormEight = "insert into form_setup
    (fs_own_id,fs_def_lang,fs_lang,fs_form_border_check,fs_header_width,fs_header_display,fs_firm_left_logo_check,fs_firm_right_logo_check,
    fs_header,fs_header_font,fs_header_color,fs_header_check,     
    fs_form_header_font,fs_form_header_color,fs_form_header_check,
    fs_firm_name_font,fs_firm_name_color,fs_firm_name_check,
    fs_firm_desc_font,fs_firm_desc_color,fs_firm_desc_check,
    fs_firm_address_font,fs_firm_address_color,fs_firm_address_check,
    fs_firm_phone_font,fs_firm_phone_color,fs_firm_phone_check,
    fs_firm_email_font,fs_firm_email_color,fs_firm_email_check,
    fs_firm_regno_label,fs_firm_regno_font,fs_firm_regno_color,fs_firm_regno_check,
    fs_s_no_lbl,fs_s_no_font,fs_s_no_color,fs_s_no_lbl_check,
    fs_date_lbl,fs_date_font,fs_date_color,
    fs_cust_pawner_lbl,fs_cust_pawner_font,fs_cust_pawner_color,fs_cust_pawner_check,
    fs_father_lbl,fs_father_font,fs_father_color,fs_father_check,
    fs_add_lbl,fs_add_font,fs_add_color,fs_add_check,
    fs_village_lbl,fs_village_font,fs_village_color,fs_village_check,
    fs_tehsil_lbl,fs_tehsil_font,fs_tehsil_color,fs_tehsil_check,
    fs_city_lbl,fs_city_font,fs_city_color,fs_city_check,
    fs_pincode_lbl,fs_pincode_font,fs_pincode_color,fs_pincode_check,
    fs_principal_lbl,fs_principal_font, fs_principal_color,fs_principal_check,
    fs_roi_lbl,fs_roi_font,fs_roi_color,fs_roi_check,
    fs_valuation_lbl,fs_valuation_font, fs_valuation_color,fs_valuation_check,
    fs_redemption_lbl,fs_redemption_font,fs_redemption_color,fs_redemption_check,
    fs_other_info_lbl,fs_other_info_font,fs_other_info_color,fs_other_info_content_font,fs_other_info_content_color,fs_other_info_check,
    fs_tnc_lbl,fs_tnc_font,fs_tnc_color,fs_tnc_content_font,fs_tnc_content_color,fs_tnc,fs_tnc_check,
    fs_cust_sign_lbl,fs_cust_sign_font,fs_cust_sign_color,
    fs_owner_sign_lbl,fs_owner_sign_font,fs_owner_sign_color,
    fs_footer,fs_footer_font,fs_footer_color,fs_footer_check,fs_form_size,fs_default_size,fs_form_width) 
    values (
        '$ownerId','$defLang','$newLang','on','25','display','on','on',"
            . "'$headerLabel','18','black','',"
            . "'20','black','on',"
            . "'16','black','on',"
            . "'16','black','on',"
            . "'12','black','on',"
            . "'12','black','on',"
            . "'12','black','on',"
            . "'$regNoLabel','12','black','',"
            . "'$sNoLabel','12','black','on',"
            . "'$dateLabel','12','black',"
            . "'$custOrPawnerNameLabel','12','black','on',"
            . "'$fatherNameLabel','12','black','on',"
            . "'$addressLabel','12','black','on',"
            . "'$villageLabel','12','black','on',"
            . "'$tehsilLabel','12','black','on',"
            . "'$cityLabel','12','black','on',"
            . "'$pinCodeLabel','12','black','on',"
            . "'$principalAmountLabel','12','black','on',"
            . "'$rateOfInterestLabel','12','black','on',"
            . "'$valLabel','12','black','on',"
            . "'$redemptionPeriodLabel','12','black','',"
            . "'$otherInfoLabel','12','black','12','black','on',"
            . "'$tNCLabel','12','black','12','black','$tNC','on',"
            . "'$custSign','12','black',"
            . "'$ownerSign','12','black',"
            . "'$footerLabel','12','black','on','form8LayA5','form8LayA5','135')";

    if (!mysqli_query($conn, $qInsertFormEight)) {
        die('Error: ' . mysqli_error($conn));
    }
}
//
// ===================================================================================================== //
// END CODE TO ADD CONDITION FOR INSERTING ENTRY ONLY IF ENTRY IS NOT PRESENT @AUTHOR:MADHUREE-11NOV2020 //
// ===================================================================================================== //
//
/* * *************Start code to add fields @Author:PRIYA22MAR14************** */
//
// ======================================================================================================= //
// START CODE TO ADD CONDITION FOR INSERTING ENTRY ONLY IF ENTRY IS NOT PRESENT @AUTHOR:MADHUREE-11NOV2020 //
// ======================================================================================================= //
//
$qformSetupDetails = "SELECT * FROM form_setup WHERE fs_def_lang = 'Hindi'";
$resformSetupDetails = mysqli_query($conn, $qformSetupDetails) or die(mysqli_error($conn));
$totalFormSetupDetails = mysqli_num_rows($resformSetupDetails);
if ($totalFormSetupDetails <= 0) {
    $qInsertFormEight = "insert into form_setup
    (fs_own_id,fs_def_lang,fs_lang,fs_default_size) 
    values ('$ownerId','Hindi','Hindi','form8LayA5')";

    if (!mysqli_query($conn, $qInsertFormEight)) {
        die('Error: ' . mysqli_error($conn));
    }
}
//
// ===================================================================================================== //
// END CODE TO ADD CONDITION FOR INSERTING ENTRY ONLY IF ENTRY IS NOT PRESENT @AUTHOR:MADHUREE-11NOV2020 //
// ===================================================================================================== //
//
// ======================================================================================================= //
// START CODE TO ADD CONDITION FOR INSERTING ENTRY ONLY IF ENTRY IS NOT PRESENT @AUTHOR:MADHUREE-11NOV2020 //
// ======================================================================================================= //
//
$qformSetupDetails = "SELECT * FROM form_setup WHERE fs_def_lang = 'Marathi'";
$resformSetupDetails = mysqli_query($conn, $qformSetupDetails) or die(mysqli_error($conn));
$totalFormSetupDetails = mysqli_num_rows($resformSetupDetails);
if ($totalFormSetupDetails <= 0) {
    $qInsertFormEight = "insert into form_setup
    (fs_own_id,fs_def_lang,fs_lang,fs_default_size) 
    values ('$ownerId','Marathi','Marathi','form8LayA5')";

    if (!mysqli_query($conn, $qInsertFormEight)) {
        die('Error: ' . mysqli_error($conn));
    }
}
//
// ===================================================================================================== //
// END CODE TO ADD CONDITION FOR INSERTING ENTRY ONLY IF ENTRY IS NOT PRESENT @AUTHOR:MADHUREE-11NOV2020 //
// ===================================================================================================== //
//
/* * *************End code to add fields @Author:PRIYA22MAR14************** */
?>