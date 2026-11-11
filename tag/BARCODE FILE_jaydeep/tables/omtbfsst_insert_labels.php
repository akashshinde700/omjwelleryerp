<?php
/* * ********Start code to change @Author:PRIYA22APR14******************* */
//Start Code to Setup table for ENG Lang
//
// ======================================================================================================= //
// START CODE TO ADD CONDITION FOR INSERTING ENTRY ONLY IF ENTRY IS NOT PRESENT @AUTHOR:MADHUREE-11NOV2020 //
// ======================================================================================================= //
//
$qformSevenSetupDetails = "SELECT * FROM form_seven_setup WHERE fss_def_lang = 'English'";
$resformSevenSetupDetails = mysqli_query($conn, $qformSevenSetupDetails) or die(mysqli_error($conn));
$totalFormSevenSetupDetails = mysqli_num_rows($resformSevenSetupDetails);
if ($totalFormSevenSetupDetails <= 0) {
    $defLang = 'English';
    $lang = 'English';
    $headerLabel = 'FORM 7';
    $regNoLabel = 'REGISTRATION NUMBER';
    $sNoLabel = 'S. NO:';
    $dateLabel = 'DATE:';
    $formSevenContent = '&NewLine;Customer CUST_NAME c/o CUST_FATHER_NAME address CUST_ADDRESS has borrowed money Rs. CUST_GIRVI_PRINCIPAL on date CUST_GIRVI_DATE.&NewLine;Customer has returned Rs. CUST_FINAL_AMOUNT on date CUST_LOAN_REL_DATE.';
    $details = 'LOAN DETAILS';
    $principalAmount = 'PRINCIPAL AMOUNT:';
    $totalInterest = 'TOTAL INTEREST:';
    $totalAmount = 'TOTAL AMOUNT:';
    $formSevenOtherInfo = '';
    $tNCLabel = 'TERMS AND CONDITIONS:';
    $tNC = '';
    $custSign = 'CUSTOMER SIGNATURE';
    $ownerSign = 'OWNER SIGNATURE';
    $footerLabel = '';
    $discountAmount = 'DISCOUNT:';
    $extraAmount = 'EXTRA AMT:';

// Start To protect MySQL injection
    $defLang = stripslashes($defLang);
    $lang = stripslashes($lang);
    $headerLabel = stripslashes($headerLabel);
    $sNoLabel = stripslashes($sNoLabel);
    $dateLabel = stripslashes($dateLabel);
    $formSevenContent = stripslashes($formSevenContent);
    $details = stripslashes($details);
    $principalAmount = stripslashes($principalAmount);
    $totalInterest = stripslashes($totalInterest);
    $totalAmount = stripslashes($totalAmount);
    $formSevenOtherInfo = stripslashes($formSevenOtherInfo);
    $tNCLabel = stripslashes($tNCLabel);
    $tNC = stripslashes($tNC);
    $custSign = stripslashes($custSign);
    $ownerSign = stripslashes($ownerSign);
    $footerLabel = stripslashes($footerLabel);
    $discountAmount = stripslashes($discountAmount);
    $extraAmount = stripslashes($extraAmount);

    $defLang = mysqli_real_escape_string($conn, $defLang);
    $lang = mysqli_real_escape_string($conn, $lang);
    $headerLabel = mysqli_real_escape_string($conn, $headerLabel);
    $sNoLabel = mysqli_real_escape_string($conn, $sNoLabel);
    $dateLabel = mysqli_real_escape_string($conn, $dateLabel);
    $formSevenContent = mysqli_real_escape_string($conn, $formSevenContent);
    $details = mysqli_real_escape_string($conn, $details);
    $principalAmount = mysqli_real_escape_string($conn, $principalAmount);
    $totalInterest = mysqli_real_escape_string($conn, $totalInterest);
    $totalAmount = mysqli_real_escape_string($conn, $totalAmount);
    $formSevenOtherInfo = mysqli_real_escape_string($conn, $formSevenOtherInfo);
    $tNCLabel = mysqli_real_escape_string($conn, $tNCLabel);
    $tNC = mysqli_real_escape_string($conn, $tNC);
    $custSign = mysqli_real_escape_string($conn, $custSign);
    $ownerSign = mysqli_real_escape_string($conn, $ownerSign);
    $footerLabel = mysqli_real_escape_string($conn, $footerLabel);
    $discountAmount = mysqli_real_escape_string($conn, $discountAmount);
    $extraAmount = mysqli_real_escape_string($conn, $extraAmount);
    
    //echo 'discountAmount=='.$discountAmount;
// End To protect MySQL injection

    $qInsertFormSeven = "INSERT INTO form_seven_setup(    
      	fss_own_id, fss_def_lang, fss_lang,fss_header_width,fss_header_display,fss_form_border_check,fss_firm_left_logo_check,fss_firm_right_logo_check,
        fss_header,fss_header_font,fss_header_color,fss_header_check, 
        fss_firm_header_font,fss_firm_header_color, fss_firm_header_check,
        fss_firm_name_font,fss_firm_name_color,fss_firm_name_check,
        fss_firm_desc_font,fss_firm_desc_color,fss_firm_desc_check,
        fss_firm_address_font,fss_firm_address_color,fss_firm_address_check,
        fss_firm_phone_font,fss_firm_phone_color,fss_firm_phone_check,
        fss_firm_email_font,fss_firm_email_color,fss_firm_email_check,
        fss_reg_no_label,fss_reg_no_font,fss_reg_no_color,fss_reg_no_check,
        fss_s_no,fss_s_no_font,fss_s_no_color,fss_s_check,
        fss_date_lbl, fss_date_font, fss_date_color,
        fss_content, fss_content_font, fss_content_color, fss_content_check, 
        fss_details, fss_principal_amt, fss_principal_font, fss_principal_color,fss_principal_amt_check, 
        fss_total_interest,fss_total_interest_font,fss_total_interest_color,fss_total_interest_check,
        fss_total_amt,fss_total_amt_font,fss_total_amt_color,fss_total_amt_check,
        fss_other_info,fss_other_info_font,fss_other_info_color,fss_other_info_content_font,fss_other_info_content_color,fss_other_info_check,
        fss_tnc_lbl,fss_tnc,fss_tnc_font,fss_tnc_color,fss_tnc_content_font,fss_tnc_content_color,fss_tnc_check,
        fss_cust_sign,fss_cust_sign_font,fss_cust_sign_color,fss_owner_sign,fss_owner_sign_font,fss_owner_sign_color,
        fss_footer,fss_footer_font,fss_footer_color,fss_footer_check,fss_form_size,fss_default_size,fss_form_width, fss_discount_amt, fss_discount_font, fss_discount_color,fss_discount_amt_check,fss_extra_amt,fss_extra_font,fss_extra_color,fss_extra_amt_check )
        values (
        '$ownerId','$defLang','$lang','25','display','on','on','on',
        '$headerLabel','18','black','',
        '20','black','on',
        '16','black','on',
        '16','black','on',
        '12','black','on',
        '12','black','on',
        '12','black','on',
        '$regNoLabel','12','black','',
        '$sNoLabel','12','black','on',
        '$dateLabel', '12','black',
        '$formSevenContent', '12','black','on',
        '$details','$principalAmount','12', 'black','on', 
        '$totalInterest','12','black','on',
        '$totalAmount','12','black','on',
        '$formSevenOtherInfo','12','black','12','black','on',
        '$tNCLabel','$tNC','12','black','12','black','on',
        '$custSign','12','black','$ownerSign','12','black',
        '$footerLabel','12','black','','form8LayA5','form8LayA5','135',
        '$discountAmount','12','black','on',"
        . "'$extraAmount','12','black','on')";
    if (!mysqli_query($conn, $qInsertFormSeven)) {
        die('Error: ' . mysqli_error($conn));
    }
}
//
// ===================================================================================================== //
// END CODE TO ADD CONDITION FOR INSERTING ENTRY ONLY IF ENTRY IS NOT PRESENT @AUTHOR:MADHUREE-11NOV2020 //
// ===================================================================================================== //
//
//End Code to Setup table for ENG Lang
//Start Code to Setup table for Hindi Lang
//$defLang = 'Hindi';
//$lang = 'Hindi';
//$headerLabel = 'फार्म 7';
//$regNoLabel = 'रेजिस्ट्रेशन नंबर';
//$sNoLabel = 'क्रमांक संख्या:';
//$dateLabel = 'दिनांक:';
//$formSevenContent = ' &NewLine; ग्राहक CUST_NAME पुत्र/पति श्री CUST_FATHER_NAME CUST_ADDRESS निवासी ने CUST_GIRVI_PRINCIPAL रूपये  CUST_GIRVI_DATE तारीख  को उधार लिए | &NewLine; ग्राहक ने  CUST_LOAN_REL_DATE तारीख  को  CUST_FINAL_AMOUNT राशि  लौटाई |';
//$details = 'गिरवी विवरण';
//$principalAmount = 'मूलधन राशि:';
//$totalInterest = ' कुल ब्याज:';
//$totalAmount = 'कुल राशि:';
//$formSevenOtherInfo = '';
//$tNCLabel = 'नियम व शर्ते:';
//$tNC = '';
//$custSign = 'ग्राहक हस्ताक्षर या बाएं अंगूठा:';
//$ownerSign = 'दुकानदार/मालिक हस्ताक्षर:';
//$footerLabel = 'Footer Label:';
//
//// Start To protect MySQL injection
//$defLang = stripslashes($defLang);
//$lang = stripslashes($lang);
//$headerLabel = stripslashes($headerLabel);
//$sNoLabel = stripslashes($sNoLabel);
//$dateLabel = stripslashes($dateLabel);
//$formSevenContent = stripslashes($formSevenContent);
//$details = stripslashes($details);
//$principalAmount = stripslashes($principalAmount);
//$totalInterest = stripslashes($totalInterest);
//$totalAmount = stripslashes($totalAmount);
//$formSevenOtherInfo = stripslashes($formSevenOtherInfo);
//$tNCLabel = stripslashes($tNCLabel);
//$tNC = stripslashes($tNC);
//$custSign = stripslashes($custSign);
//$ownerSign = stripslashes($ownerSign);
//$footerLabel = stripslashes($footerLabel);
//
//$defLang = mysqli_real_escape_string($conn,$defLang);
//$lang = mysqli_real_escape_string($conn,$lang);
//$headerLabel = mysqli_real_escape_string($conn,$headerLabel);
//$sNoLabel = mysqli_real_escape_string($conn,$sNoLabel);
//$dateLabel = mysqli_real_escape_string($conn,$dateLabel);
//$formSevenContent = mysqli_real_escape_string($conn,$formSevenContent);
//$details = mysqli_real_escape_string($conn,$details);
//$principalAmount = mysqli_real_escape_string($conn,$principalAmount);
//$totalInterest = mysqli_real_escape_string($conn,$totalInterest);
//$totalAmount = mysqli_real_escape_string($conn,$totalAmount);
//$formSevenOtherInfo = mysqli_real_escape_string($conn,$formSevenOtherInfo);
//$tNCLabel = mysqli_real_escape_string($conn,$tNCLabel);
//$tNC = mysqli_real_escape_string($conn,$tNC);
//$custSign = mysqli_real_escape_string($conn,$custSign);
//$ownerSign = mysqli_real_escape_string($conn,$ownerSign);
//$footerLabel = mysqli_real_escape_string($conn,$footerLabel);
//// End To protect MySQL injection
//$qInsertFormSeven = "INSERT INTO form_seven_setup(    
//      	fss_own_id, fss_def_lang, fss_lang,fss_header_width,fss_header_display,fss_form_border_check,fss_firm_left_logo_check,fss_firm_right_logo_check,
//        fss_header,fss_header_font,fss_header_color,fss_header_check, 
//        fss_firm_header_font,fss_firm_header_color, fss_firm_header_check,
//        fss_firm_name_font,fss_firm_name_color,fss_firm_name_check,
//        fss_firm_desc_font,fss_firm_desc_color,fss_firm_desc_check,
//        fss_firm_address_font,fss_firm_address_color,fss_firm_address_check,
//        fss_firm_phone_font,fss_firm_phone_color,fss_firm_phone_check,
//        fss_firm_email_font,fss_firm_email_color,fss_firm_email_check,
//        fss_reg_no_label,fss_reg_no_font,fss_reg_no_color,fss_reg_no_check,
//        fss_s_no,fss_s_no_font,fss_s_no_color,fss_s_check,
//        fss_date_lbl, fss_date_font, fss_date_color,
//        fss_content, fss_content_font, fss_content_color, fss_content_check, 
//        fss_details, fss_principal_amt, fss_principal_font, fss_principal_color,fss_principal_amt_check, 
//        fss_total_interest,fss_total_interest_font,fss_total_interest_color,fss_total_interest_check,
//        fss_total_amt,fss_total_amt_font,fss_total_amt_color,fss_total_amt_check,
//        fss_other_info,fss_other_info_font,fss_other_info_color,fss_other_info_content_font,fss_other_info_content_color,fss_other_info_check,
//        fss_tnc_lbl,fss_tnc,fss_tnc_font,fss_tnc_color,fss_tnc_content_font,fss_tnc_content_color,fss_tnc_check,
//        fss_cust_sign,fss_cust_sign_font,fss_cust_sign_color,fss_owner_sign,fss_owner_sign_font,fss_owner_sign_color,
//        fss_footer,fss_footer_font,fss_footer_color,fss_footer_check)
//        values (
//        '$ownerId','$defLang','$lang','40','display','on','on','on',
//        '$headerLabel','18','black','on',
//        '18','maroon','on',
//        '14','darkBlue','on',
//        '12','lightBlue','on',
//        '12','lightBlue','on',
//        '12','lightBlue','on',
//        '12','lightBlue','on',
//        '$regNoLabel','12','black','on',
//        '$sNoLabel','12','black','on',
//        '$dateLabel', '12','black',
//        '$formSevenContent', '18','darkBlue','on',
//        '$details','$principalAmount','14', 'brown','on', 
//        '$totalInterest','14','brown','on',
//        '$totalAmount','14','brown','on',
//        '$formSevenOtherInfo','14','black','14','black','on',
//        '$tNCLabel','$tNC','14','black','14','black','on',
//        '$custSign','14','black','$ownerSign','14','black',
//        '$footerLabel','13','black','on')";
//if (!mysqli_query($conn,$qInsertFormSeven)) {
//    die('Error: ' . mysqli_error($conn));
//}
////$qInsertFormSeven = "insert into form_seven_setup(                       
////           fss_own_id,fss_def_lang,fss_lang,fss_header,fss_s_no,fss_date_lbl,fss_content,fss_details,fss_principal_amt,fss_total_interest,fss_total_amt,
////           fss_other_info,fss_tnc_lbl,fss_tnc,fss_cust_sign,fss_owner_sign,fss_footer) 
////    values ('$ownerId','$defLang','$lang','$headerLabel','$sNoLabel','$dateLabel','$formSevenContent','$details','$principalAmount','$totalInterest',
////            '$totalAmount','$formSevenOtherInfo','$tNCLabel','$tNC','$custSign','$ownerSign','$footerLabel')";
////End Code to Setup table for HIN Lang
////Start Code to Setup table for Marathi Lang @Author: KHUSH21JAN13
//// Modified by KHUSH22JAN13
//
//$defLang = 'Marathi';
//$lang = 'Marathi';
//$headerLabel = 'फार्म 7';
//$sNoLabel = 'अनुक्रमांक:';
//$regNoLabel = 'रेजिस्ट्रेशन नंबर';
//$dateLabel = 'दिनांक:';
//$formSevenContent = '&NewLine;CUST_NAME  ग्राहक  CUST_FATHER_NAME चा मुलगा / मुलगी CUST_ADDRESS पत्ता ह्यानी CUST_GIRVI_PRINCIPAL रु. दिनांक CUST_GIRVI_DATE  ला घेतले होते.&NewLine; ग्राहक ने  CUST_LOAN_REL_DATE दिनांक CUST_FINAL_AMOUNT राशि दिले|';
//$details = 'गिरवी विवरण';
//$principalAmount = 'मूळ राशी:';
//$totalInterest = 'एकूण व्याज:';
//$totalAmount = 'एकूण रक्कम:';
//$formSevenOtherInfo = '';
//$tNCLabel = 'नियम आणि शर्ते:';
//$tNC = '';
//$custSign = 'ग्राहकाची सही /अंगठा:';
//$ownerSign = 'दुकानदार सही:';
//$footerLabel = 'Footer Label:';
//
//// Start To protect MySQL injection
//$defLang = stripslashes($defLang);
//$lang = stripslashes($lang);
//$headerLabel = stripslashes($headerLabel);
//$sNoLabel = stripslashes($sNoLabel);
//$dateLabel = stripslashes($dateLabel);
//$formSevenContent = stripslashes($formSevenContent);
//$details = stripslashes($details);
//$principalAmount = stripslashes($principalAmount);
//$totalInterest = stripslashes($totalInterest);
//$totalAmount = stripslashes($totalAmount);
//$formSevenOtherInfo = stripslashes($formSevenOtherInfo);
//$tNCLabel = stripslashes($tNCLabel);
//$tNC = stripslashes($tNC);
//$custSign = stripslashes($custSign);
//$ownerSign = stripslashes($ownerSign);
//$footerLabel = stripslashes($footerLabel);
//
//$defLang = mysqli_real_escape_string($conn,$defLang);
//$lang = mysqli_real_escape_string($conn,$lang);
//$headerLabel = mysqli_real_escape_string($conn,$headerLabel);
//$sNoLabel = mysqli_real_escape_string($conn,$sNoLabel);
//$dateLabel = mysqli_real_escape_string($conn,$dateLabel);
//$formSevenContent = mysqli_real_escape_string($conn,$formSevenContent);
//$details = mysqli_real_escape_string($conn,$details);
//$principalAmount = mysqli_real_escape_string($conn,$principalAmount);
//$totalInterest = mysqli_real_escape_string($conn,$totalInterest);
//$totalAmount = mysqli_real_escape_string($conn,$totalAmount);
//$formSevenOtherInfo = mysqli_real_escape_string($conn,$formSevenOtherInfo);
//$tNCLabel = mysqli_real_escape_string($conn,$tNCLabel);
//$tNC = mysqli_real_escape_string($conn,$tNC);
//$custSign = mysqli_real_escape_string($conn,$custSign);
//$ownerSign = mysqli_real_escape_string($conn,$ownerSign);
//$footerLabel = mysqli_real_escape_string($conn,$footerLabel);
//// End To protect MySQL injection
//$qInsertFormSeven = "INSERT INTO form_seven_setup(    
//      	fss_own_id, fss_def_lang, fss_lang,fss_header_width,fss_header_display,fss_form_border_check,fss_firm_left_logo_check,fss_firm_right_logo_check,
//        fss_header,fss_header_font,fss_header_color,fss_header_check, 
//        fss_firm_header_font,fss_firm_header_color, fss_firm_header_check,
//        fss_firm_name_font,fss_firm_name_color,fss_firm_name_check,
//        fss_firm_desc_font,fss_firm_desc_color,fss_firm_desc_check,
//        fss_firm_address_font,fss_firm_address_color,fss_firm_address_check,
//        fss_firm_phone_font,fss_firm_phone_color,fss_firm_phone_check,
//        fss_firm_email_font,fss_firm_email_color,fss_firm_email_check,
//        fss_reg_no_label,fss_reg_no_font,fss_reg_no_color,fss_reg_no_check,
//        fss_s_no,fss_s_no_font,fss_s_no_color,fss_s_check,
//        fss_date_lbl, fss_date_font, fss_date_color,
//        fss_content, fss_content_font, fss_content_color, fss_content_check, 
//        fss_details, fss_principal_amt, fss_principal_font, fss_principal_color,fss_principal_amt_check, 
//        fss_total_interest,fss_total_interest_font,fss_total_interest_color,fss_total_interest_check,
//        fss_total_amt,fss_total_amt_font,fss_total_amt_color,fss_total_amt_check,
//        fss_other_info,fss_other_info_font,fss_other_info_color,fss_other_info_content_font,fss_other_info_content_color,fss_other_info_check,
//        fss_tnc_lbl,fss_tnc,fss_tnc_font,fss_tnc_color,fss_tnc_content_font,fss_tnc_content_color,fss_tnc_check,
//        fss_cust_sign,fss_cust_sign_font,fss_cust_sign_color,fss_owner_sign,fss_owner_sign_font,fss_owner_sign_color,
//        fss_footer,fss_footer_font,fss_footer_color,fss_footer_check)
//        values (
//        '$ownerId','$defLang','$lang','40','display','on','on','on',
//        '$headerLabel','18','black','on',
//        '18','maroon','on',
//        '14','darkBlue','on',
//        '12','lightBlue','on',
//        '12','lightBlue','on',
//        '12','lightBlue','on',
//        '12','lightBlue','on',
//        '$regNoLabel','12','black','on',
//        '$sNoLabel','12','black','on',
//        '$dateLabel', '12','black',
//        '$formSevenContent', '18','darkBlue','on',
//        '$details','$principalAmount','14', 'brown','on', 
//        '$totalInterest','14','brown','on',
//        '$totalAmount','14','brown','on',
//        '$formSevenOtherInfo','14','black','14','black','on',
//        '$tNCLabel','$tNC','14','black','14','black','on',
//        '$custSign','14','black','$ownerSign','14','black',
//        '$footerLabel','13','black','on')";
//if (!mysqli_query($conn,$qInsertFormSeven)) {
//    die('Error: ' . mysqli_error($conn));
//}
/* * *************Start code to add fields @Author:PRIYA22MAR14************** */
//
// ======================================================================================================= //
// START CODE TO ADD CONDITION FOR INSERTING ENTRY ONLY IF ENTRY IS NOT PRESENT @AUTHOR:MADHUREE-11NOV2020 //
// ======================================================================================================= //
//
$qformSevenSetupDetails = "SELECT * FROM form_seven_setup WHERE fss_def_lang = 'Hindi'";
$resformSevenSetupDetails = mysqli_query($conn, $qformSevenSetupDetails) or die(mysqli_error($conn));
$totalFormSevenSetupDetails = mysqli_num_rows($resformSevenSetupDetails);
if ($totalFormSevenSetupDetails <= 0) {
    $qInsertFormEight = "insert into form_seven_setup
    (fss_own_id,fss_def_lang,fss_lang,fss_default_size) 
    values ('$ownerId','Hindi','Hindi','form7LayA5')";

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
$qformSevenSetupDetails = "SELECT * FROM form_seven_setup WHERE fss_def_lang = 'Marathi'";
$resformSevenSetupDetails = mysqli_query($conn, $qformSevenSetupDetails) or die(mysqli_error($conn));
$totalFormSevenSetupDetails = mysqli_num_rows($resformSevenSetupDetails);
if ($totalFormSevenSetupDetails <= 0) {
    $qInsertFormEight = "insert into form_seven_setup
    (fss_own_id,fss_def_lang,fss_lang,fss_default_size) 
    values ('$ownerId','Marathi','Marathi','form7LayA5')";

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
//End Code to Setup table for Marathi Lang @Author: KHUSH21JAN13
/* * ********End code to change @Author:PRIYA22APR14******************* */
?>