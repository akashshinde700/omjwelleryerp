<?php
// file name: omtbgvnt_insert_labels.php
// ======================================================================================================= //
// START CODE TO ADD CONDITION FOR INSERTING ENTRY ONLY IF ENTRY IS NOT PRESENT @AUTHOR:MADHUREE-11NOV2020 //
// ======================================================================================================= //
//
$qLoanNoticeSetupDetails = "SELECT * FROM loan_notice_setup WHERE lns_def_lang = 'English'";
$resLoanNoticeSetupDetails = mysqli_query($conn, $qLoanNoticeSetupDetails) or die(mysqli_error($conn));
$totalLoanNoticeSetupDetails = mysqli_num_rows($resLoanNoticeSetupDetails);
if ($totalLoanNoticeSetupDetails <= 0) {
    //
    $defLang = 'English';
    $lang = 'English';
    $header = 'GIRVI/LOAN NOTICE';
    $custNameLabel = 'CUSTOMER NAME:'; //alt removed @Author:PRIYA28DEC13
    $dateLabel = 'DATE:';
    $fatherSpouseLabel = 'FATHER/SPOUSE NAME:';
    $custAddLabel = 'CUSTOMER ADDRESS:';
    $noticeContent = 'Dear Sir, &NewLine;&NewLine;&Tab;As per secured loan clause 404 you are hereby informed that you had applied for principal loan of Rs. PRINCIPAL/- whose loan no. is SNO dated DDMMYYYY at our shop. According to the loan clauses in case of deposition failure of the interest on the total principal within 11 months from the date of loan sanction or a loss upon the loan, a legal action would be taken in this regard. Being contacted many times you did not respond to the notices. &NewLine;&Tab;This is a final notice being issued to bring into your notice to clear all your debts or else your article would be destroyed or auctioned and no future dealings would be entertained. We hope that you would come as soon as possible and clear your account and maintain a healthy relationship.';
    $loanDetailsLabel = 'GIRVI/LOAN DETAILS';
    $loanDateLabel = 'GIRVI/LOAN DATE:';
    $loanPrincipalLabel = 'PRINCIPAL AMOUNT:';
    $loanIntLabel = 'TOTAL INTEREST:';
    $loanTotalAmtLabel = 'TOTAL AMOUNT:';
    $loanArticles = 'ARTICLES DETAILS:';
    $tNCLabel = 'TERMAS AND CONDITIONS:';
    $tNC = '';
    $loanCustSign = 'CUSTOMER SIGNATURE';
    $loanOwnerSign = 'OWNER SIGNATURE';
    $footer = '';
    $regNoLabel = 'REGISTRATION NUMBER';
    $wifeOfLabel = 'W/O';

// Start To protect MySQL injection
    $defLang = stripslashes($defLang);
    $lang = stripslashes($lang);
    $header = stripslashes($header);
    $custNameLabel = stripslashes($custNameLabel);
    $dateLabel = stripslashes($dateLabel);
    $fatherSpouseLabel = stripslashes($fatherSpouseLabel);
    $custAddLabel = stripslashes($custAddLabel);
    $noticeContent = stripslashes($noticeContent);
    $loanDetailsLabel = stripslashes($loanDetailsLabel);
    $loanDateLabel = stripslashes($loanDateLabel);
    $loanPrincipalLabel = stripslashes($loanPrincipalLabel);
    $loanIntLabel = stripslashes($loanIntLabel);
    $loanTotalAmtLabel = stripslashes($loanTotalAmtLabel);
    $loanArticles = stripslashes($loanArticles);
    $tNCLabel = stripslashes($tNCLabel);
    $tNC = stripslashes($tNC);
    $loanCustSign = stripslashes($loanCustSign);
    $loanOwnerSign = stripslashes($loanOwnerSign);
    $footer = stripslashes($footer);

    $defLang = mysqli_real_escape_string($conn, $defLang);
    $lang = mysqli_real_escape_string($conn, $lang);
    $header = mysqli_real_escape_string($conn, $header);
    $custNameLabel = mysqli_real_escape_string($conn, $custNameLabel);
    $dateLabel = mysqli_real_escape_string($conn, $dateLabel);
    $fatherSpouseLabel = mysqli_real_escape_string($conn, $fatherSpouseLabel);
    $custAddLabel = mysqli_real_escape_string($conn, $custAddLabel);
    $noticeContent = mysqli_real_escape_string($conn, $noticeContent);
    $loanDetailsLabel = mysqli_real_escape_string($conn, $loanDetailsLabel);
    $loanDateLabel = mysqli_real_escape_string($conn, $loanDateLabel);
    $loanPrincipalLabel = mysqli_real_escape_string($conn, $loanPrincipalLabel);
    $loanIntLabel = mysqli_real_escape_string($conn, $loanIntLabel);
    $loanTotalAmtLabel = mysqli_real_escape_string($conn, $loanTotalAmtLabel);
    $loanArticles = mysqli_real_escape_string($conn, $loanArticles);
    $tNCLabel = mysqli_real_escape_string($conn, $tNCLabel);
    $tNC = mysqli_real_escape_string($conn, $tNC);
    $loanCustSign = mysqli_real_escape_string($conn, $loanCustSign);
    $loanOwnerSign = mysqli_real_escape_string($conn, $loanOwnerSign);
    $footer = mysqli_real_escape_string($conn, $footer);
// End To protect MySQL injection

    $qInsertLoanNotice = "INSERT INTO loan_notice_setup(    
            lns_own_id, lns_def_lang, lns_lang,lns_form_width,lns_border_check,
           lns_header_width,lns_header_display, lns_firm_left_logo_check,lns_firm_right_logo_check, 
                        lns_header,lns_header_font,lns_header_color,lns_header_check,
                   lns_firm_header_font,lns_firm_header_color, lns_firm_header_check,"
            . "lns_firm_name_font,lns_firm_name_color,lns_firm_name_check,"
            . "lns_firm_desc_font,lns_firm_desc_color,lns_firm_desc_check,"
            . "lns_firm_address_font,lns_firm_address_color,lns_firm_address_check,"
            . "lns_firm_phone_font,lns_firm_phone_color,lns_firm_phone_check,"
            . "lns_firm_email_font,lns_firm_email_color,lns_firm_email_check,"
            . "lns_firm_regno_label,lns_firm_regno_font,lns_firm_regno_color,lns_firm_regno_check,
               lns_cust_name_lbl, lns_cust_name_font, lns_cust_name_color, lns_cust_name_check, 
              lns_date_lbl, lns_date_font, lns_date_color, "
            . "lns_father_spouse_lbl,lns_father_font,lns_father_color,lns_father_check,"
            . "lns_wife_of_lbl,lns_wife_of_font,lns_wife_of_color,lns_wife_of_check,"
            . "lns_cust_add_lbl,lns_cust_add_font,lns_cust_add_color,lns_cust_add_check,"
            . "lns_notice_font, lns_notice_color, lns_notice_check ,lns_notice_cont,"
            . "lns_loan_detail_lbl, lns_loan_detail_font, lns_loan_detail_color, lns_loan_detail_check,"
            . "lns_loan_date_lbl, lns_loan_date_font, lns_loan_date_color, lns_loan_date_check,"
            . "lns_principal_lbl, lns_principal_font, lns_principal_color,lns_principal_check, 
              lns_interest_lbl,lns_interest_font,lns_interest_color,lns_interest_check, "
            . "lns_total_amt_lbl,lns_total_amt_font,lns_total_amt_color,lns_total_amt_check,"
            . "lns_articles_lbl,lns_articles_font,lns_articles_color,lns_articles_check,"
            . "lns_tnc_font,lns_tnc_color,lns_tnc_content_font,lns_tnc_content_color,lns_tnc,lns_tnc_check,"
            . "lns_cust_sign_lbl,lns_cust_sign_font,lns_cust_sign_color,"
            . "lns_owner_sign_lbl,lns_owner_sign_font,lns_owner_sign_color,"
            . "lns_footer,lns_footer_font,lns_footer_color,lns_footer_check,lns_form_size,lns_default_size)
           VALUES('$ownerId', '$defLang', '$lang','135','on',"
            . "'25','display','on','on',
        '$header','18','black','',
        '20','black','on',
        '16','black','on',
        '16','black','on',
        '12','black','on',
        '12','black','on',
        '12','black','on',
        '$regNoLabel','12','black','',
        '$custNameLabel', '12', 'black','on', 
        '$dateLabel','12', 'black', "
            . "'$fatherSpouseLabel','12','black','on',"
            . "'$wifeOfLabel','12','black','on',"
            . "'$custAddLabel','12','black','on',"
            . "'12', 'black',  'on','$noticeContent',"
            . "'$loanDetailsLabel', '12', 'black',  'on',"
            . "'$loanDateLabel', '12', 'black',  'on',"
            . "'$loanPrincipalLabel', '12', 'black', 'on', 
              '$loanIntLabel','12','black','on', "
            . "'$loanTotalAmtLabel','12','black','on',"
            . "'$loanArticles','12','black','on',"
            . "'12','black','12','black','$tNC','on',"
            . "'$loanCustSign','12','black',"
            . "'$loanOwnerSign','12','black','$footer','12','black','','girviNoticeLayA5','girviNoticeLayA5')";
    if (!mysqli_query($conn, $qInsertLoanNotice)) {
        die('Error: ' . mysqli_error($conn));
    }
}
//
// ===================================================================================================== //
// END CODE TO ADD CONDITION FOR INSERTING ENTRY ONLY IF ENTRY IS NOT PRESENT @AUTHOR:MADHUREE-11NOV2020 //
// ===================================================================================================== //
//
//End Code to Setup table for ENG Lang
//Start Code to Setup table for HIN Lang
//$defLang = 'Hindi';
//$lang = 'Hindi';
//$header = 'GIRVI NOTICE (गिरवी नोटिस)';
//$custNameLabel = 'कस्टमर का नाम:'; //alt removed @Author:PRIYA28DEC13
//$dateLabel = 'दिनांक:';
//$fatherSpouseLabel = 'पिता/पति का नाम:';
//$custAddLabel = 'ग्राहक का पता:';
//$noticeContent = 'प्रिय महोदय,&NewLine;&NewLine;&Tab;गिरवी नोटिस धारा 404 के अनुसार सूचित किया जाता है कि आपके द्वारा हमारे यहाँ दिनांक DDMMYYYY को मूलधन रु  PRINCIPAL/- में गिरवी संख्या SNO रखी हुए थी| गिरवी नियमो के अनुसार 11 महीनो के पश्चात गिरवी का ब्याज जमा ना करने या गिरवी पर नुकसान की इस्तीति में आप के द्वारा हिसाव ना करने पर हमे एक पक्षिए करयवाही करनी पड़ेगी| हमारी तरफ से आपको बहुत बार सूचित किया गया मगर अपने एक बार भी संपर्क नही किया| &NewLine;&Tab;
//       आपको एक बार और सूचित किया जाता है कृपया शीघ्र ही 7 दिनो में आकर अपना हिसाव चुकता कर लीजिए| अन्यथा आपकी रखी हुए गिरवी (अमानत) को समाप्त या नीलाम कर दिया जाएगा और भविष्य में आपका इस गिरवी (अमानत) से कोई संबंध नही रहेगा| हमे आशा है की आप शीघ्र ही आकर अपना हिसाव चुकता करेंगे और हमारे आपके आपसी संबंध को और अच्छा बनाने की कोशिश करेंगें|';
//$loanDetailsLabel = 'गिरवी विवरण';
//$loanDateLabel = 'गिरवी दिनांक:';
//$loanPrincipalLabel = ' मूलधन राशि:';
//$loanIntLabel = ' कुल व्याज:';
//$loanTotalAmtLabel = 'कुल धनराशि:';
//$loanArticles = ' गिरवी समान:';
//$tNCLabel = 'नियम व शर्ते:';
//$tNC = '';
//$loanCustSign = 'ग्राहक/कस्टमर हस्ताक्षर या बाएं अँगूठा:';
//$loanOwnerSign = 'दुकानदार/मालिक हस्ताक्षर';
//$footer = '';
//
//// Start To protect MySQL injection
//$defLang = stripslashes($defLang);
//$lang = stripslashes($lang);
//$header = stripslashes($header);
//$custNameLabel = stripslashes($custNameLabel);
//$dateLabel = stripslashes($dateLabel);
//$fatherSpouseLabel = stripslashes($fatherSpouseLabel);
//$custAddLabel = stripslashes($custAddLabel);
//$noticeContent = stripslashes($noticeContent);
//$loanDetailsLabel = stripslashes($loanDetailsLabel);
//$loanDateLabel = stripslashes($loanDateLabel);
//$loanPrincipalLabel = stripslashes($loanPrincipalLabel);
//$loanIntLabel = stripslashes($loanIntLabel);
//$loanTotalAmtLabel = stripslashes($loanTotalAmtLabel);
//$loanArticles = stripslashes($loanArticles);
//$tNCLabel = stripslashes($tNCLabel);
//$tNC = stripslashes($tNC);
//$loanCustSign = stripslashes($loanCustSign);
//$loanOwnerSign = stripslashes($loanOwnerSign);
//$footer = stripslashes($footer);
//
//$defLang = mysqli_real_escape_string($conn,$defLang);
//$lang = mysqli_real_escape_string($conn,$lang);
//$header = mysqli_real_escape_string($conn,$header);
//$custNameLabel = mysqli_real_escape_string($conn,$custNameLabel);
//$dateLabel = mysqli_real_escape_string($conn,$dateLabel);
//$fatherSpouseLabel = mysqli_real_escape_string($conn,$fatherSpouseLabel);
//$custAddLabel = mysqli_real_escape_string($conn,$custAddLabel);
//$noticeContent = mysqli_real_escape_string($conn,$noticeContent);
//$loanDetailsLabel = mysqli_real_escape_string($conn,$loanDetailsLabel);
//$loanDateLabel = mysqli_real_escape_string($conn,$loanDateLabel);
//$loanPrincipalLabel = mysqli_real_escape_string($conn,$loanPrincipalLabel);
//$loanIntLabel = mysqli_real_escape_string($conn,$loanIntLabel);
//$loanTotalAmtLabel = mysqli_real_escape_string($conn,$loanTotalAmtLabel);
//$loanArticles = mysqli_real_escape_string($conn,$loanArticles);
//$tNCLabel = mysqli_real_escape_string($conn,$tNCLabel);
//$tNC = mysqli_real_escape_string($conn,$tNC);
//$loanCustSign = mysqli_real_escape_string($conn,$loanCustSign);
//$loanOwnerSign = mysqli_real_escape_string($conn,$loanOwnerSign);
//$footer = mysqli_real_escape_string($conn,$footer);
//// End To protect MySQL injection
//
//$qInsertLoanNotice = "insert into loan_notice_setup(lns_own_id, lns_def_lang, lns_lang, lns_header, lns_cust_name_lbl, lns_date_lbl, lns_father_spouse_lbl,
//    lns_cust_add_lbl,lns_notice_cont,lns_loan_detail_lbl,lns_loan_date_lbl,lns_principal_lbl,lns_interest_lbl,lns_total_amt_lbl,
//    lns_articles_lbl,lns_tnc_lbl,lns_tnc,lns_cust_sign_lbl,lns_owner_sign_lbl,lns_footer) 
//    values ('$ownerId','$defLang','$lang','$header','$custNameLabel','$dateLabel','$fatherSpouseLabel',
//        '$custAddLabel','$noticeContent','$loanDetailsLabel','$loanDateLabel','$loanPrincipalLabel','$loanIntLabel','$loanTotalAmtLabel',
//        '$loanArticles','$tNCLabel','$tNC','$loanCustSign','$loanOwnerSign','$footer')";
//
//
//if (!mysqli_query($conn,$qInsertLoanNotice)) {
//    die('Error: ' . mysqli_error($conn));
//}
//
////End Code to Setup table for HIN Lang
////Start Code to Setup table for MARATHI Lang by @Author: KHUSH21JAN13
//// Modified by KHUSH22JAN13
//
//$defLang = 'Marathi';
//$lang = 'Marathi';
//$header = 'कर्ज नोटीस';
//$custNameLabel = 'ग्राहाकाचे नाव:';
//$dateLabel = 'दिनांक:';
//$fatherSpouseLabel = 'वडील/पती चे नाव:';
//$custAddLabel = 'ग्राहकाचा पत्ता:';
//$noticeContent = 'प्रिय महोदय,&NewLine;&NewLine;&Tab;कर्ज नोटीस ४०४ द्वारा सूचीत केले जाते की तुम्ही आमच्याकडे दिनांक DDMMYYYY ला रु PRINCIPAL/- मधे कर्ज ठेवले होते. कार्जानियमानुसर ११ महीन्यानंतर कर्जाचे व्याज जमा न केल्यांमूळ आम्हाला एकतर्फी कार्यवाही करावी लागेल. आमच्याकडून  तुम्हाला खूप वेळा सूचीत केले गेले पण एकदा ही तुम्ही संपर्क साधला नाही. तुम्हाला एक वेळा अजुन सूचीत केले जाते की कृपया लवकर ७ दिवसाच्या आत तुमच्या हिशोब चुकता करावा नाहीतर तुमची ठेवलेली वस्तू मोडली जाईल आणि भविष्यात तिच्यावर तुमचा कोणताही अधिकार रहनार नही.&NewLine;&Tab;अशा आहे की तुम्ही लवकर येऊन हिशोब चुकता कराल आणि आपले संबंध कायम नीट ठेवण्यात मदत कराल.';
//$loanDetailsLabel = 'कर्ज विवरण:';
//$loanDateLabel = 'कर्ज दिनांक:';
//$loanPrincipalLabel = 'एकूण व्याज:';
//$loanIntLabel = ' एकूण व्याज:';
//$loanTotalAmtLabel = 'एकूण रक्कम:';
//$loanArticles = ' गहाण वस्तु:';
//$tNCLabel = 'नियम आणि शर्ते:';
//$tNC = '';
//$loanCustSign = 'ग्राहकाची सही /अंगठा:';
//$loanOwnerSign = 'दुकानदार सही';
//$footer = '';
//
//// Start To protect MySQL injection
//$defLang = stripslashes($defLang);
//$lang = stripslashes($lang);
//$header = stripslashes($header);
//$custNameLabel = stripslashes($custNameLabel);
//$dateLabel = stripslashes($dateLabel);
//$fatherSpouseLabel = stripslashes($fatherSpouseLabel);
//$custAddLabel = stripslashes($custAddLabel);
//$noticeContent = stripslashes($noticeContent);
//$loanDetailsLabel = stripslashes($loanDetailsLabel);
//$loanDateLabel = stripslashes($loanDateLabel);
//$loanPrincipalLabel = stripslashes($loanPrincipalLabel);
//$loanIntLabel = stripslashes($loanIntLabel);
//$loanTotalAmtLabel = stripslashes($loanTotalAmtLabel);
//$loanArticles = stripslashes($loanArticles);
//$tNCLabel = stripslashes($tNCLabel);
//$tNC = stripslashes($tNC);
//$loanCustSign = stripslashes($loanCustSign);
//$loanOwnerSign = stripslashes($loanOwnerSign);
//$footer = stripslashes($footer);
//
//$defLang = mysqli_real_escape_string($conn,$defLang);
//$lang = mysqli_real_escape_string($conn,$lang);
//$header = mysqli_real_escape_string($conn,$header);
//$custNameLabel = mysqli_real_escape_string($conn,$custNameLabel);
//$dateLabel = mysqli_real_escape_string($conn,$dateLabel);
//$fatherSpouseLabel = mysqli_real_escape_string($conn,$fatherSpouseLabel);
//$custAddLabel = mysqli_real_escape_string($conn,$custAddLabel);
//$noticeContent = mysqli_real_escape_string($conn,$noticeContent);
//$loanDetailsLabel = mysqli_real_escape_string($conn,$loanDetailsLabel);
//$loanDateLabel = mysqli_real_escape_string($conn,$loanDateLabel);
//$loanPrincipalLabel = mysqli_real_escape_string($conn,$loanPrincipalLabel);
//$loanIntLabel = mysqli_real_escape_string($conn,$loanIntLabel);
//$loanTotalAmtLabel = mysqli_real_escape_string($conn,$loanTotalAmtLabel);
//$loanArticles = mysqli_real_escape_string($conn,$loanArticles);
//$tNCLabel = mysqli_real_escape_string($conn,$tNCLabel);
//$tNC = mysqli_real_escape_string($conn,$tNC);
//$loanCustSign = mysqli_real_escape_string($conn,$loanCustSign);
//$loanOwnerSign = mysqli_real_escape_string($conn,$loanOwnerSign);
//$footer = mysqli_real_escape_string($conn,$footer);
//// End To protect MySQL injection
//
//$qInsertLoanNotice = "insert into loan_notice_setup(lns_own_id,lns_def_lang,lns_lang,lns_header,lns_cust_name_lbl,lns_date_lbl,lns_father_spouse_lbl,
//    lns_cust_add_lbl,lns_notice_cont,lns_loan_detail_lbl,lns_loan_date_lbl,lns_principal_lbl,lns_interest_lbl,lns_total_amt_lbl,
//    lns_articles_lbl,lns_tnc_lbl,lns_tnc,lns_cust_sign_lbl,lns_owner_sign_lbl,lns_footer) 
//    values ('$ownerId','$defLang','$lang','$header','$custNameLabel','$dateLabel','$fatherSpouseLabel',
//        '$custAddLabel','$noticeContent','$loanDetailsLabel','$loanDateLabel','$loanPrincipalLabel','$loanIntLabel','$loanTotalAmtLabel',
//        '$loanArticles','$tNCLabel','$tNC','$loanCustSign','$loanOwnerSign','$footer')";
//
//
//if (!mysqli_query($conn,$qInsertLoanNotice)) {
//    die('Error: ' . mysqli_error($conn));
//}
//End Code to Setup table for MARATHI Lang by @Author: KHUSH21JAN13
?>