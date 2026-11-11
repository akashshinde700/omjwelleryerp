<?php
// *******************************************************************************************************************************************
// START CODE TO UPDATE ALL TABLES AND DATABASE INTO UTF8 @LOVE-05SEP18
// *******************************************************************************************************************************************
//file path:omtbcuno_insert_labels.php
//$conn = mysqli_connect($dbhost, 'root', 'omrolrsr', $dbname, $dbPort) or die('Error connecting to mysql');
//$db_selected = mysqli_select_db($conn, $dbname);
//
//if (!$db_selected) {
//    die("Can\'t use test_db : " . mysqli_error($conn));
//}

// Alter DataBase
$alterQuery = "ALTER DATABASE $dbname CHARACTER SET utf8 COLLATE utf8_general_ci";
if ($dbname != '') {
    mysqli_query($conn, $alterQuery) or die('Table:' . $tableName[0] . '<br/>Error:' . mysqli_error($conn));
}
// Alter item_name Table reduce the column size due to key size error
// Error - Specified key was too long; max key length is 1000 bytes
$alterQuery = "ALTER TABLE item_name MODIFY COLUMN itm_nm_name VARCHAR(250)";
mysqli_query($conn, $alterQuery) or die('Table:' . $tableName[0] . '<br/>Error:' . mysqli_error($conn));
//
// Alter All Tables
$resTableName = mysqli_query($conn, "show tables") or die(mysqli_error($conn));
//
while ($tableName = mysqli_fetch_array($resTableName)) {
    //
    $alterQuery = "ALTER TABLE $tableName[0] CONVERT TO CHARACTER SET utf8 COLLATE utf8_general_ci";
    if ($tableName[0] != '') {
        mysqli_query($conn, $alterQuery) or die('Table:' . $tableName[0] . '<br/>Error:' . mysqli_error($conn));
    }
}
//
//Start Code to Setup table for ENG Lang
$content = '**********************   ओमुनीम न्यायालय के अंतरगर्त  **********************
सिर्फ़ छ: माह के लिए                                                                             Loan No. SNO

आज दि.  DDMMYYYY को                                         (मोबा  न.  CUSTMOBNO) 
------------------------------------------------------------------------------------------------------------------
     मैं CUSTNAME  आत्मज् / पत्नी श्री CUSTCONAME  निवासी ग्राम CUSTCITY  से FIRMNAME के यहा अपना जेवर सोना / चांदी का नाम जेवर ITEMNAME. 
अनुमानित शुद्धता PURITY  वजन लगभग WEIGHT  को गिरवी रखकर 
अंको मे रुपया TOTALAMOUNT अक्षरो मे रुपया AMOUNTINWORDS कर्ज़ लिया है| 
     यह जेवर पूरी तरह चोखा नही है बल्कि बट्टे वाला है| इस पर INTERESTRATE रुपया सैकड़ा माहवार के हिसाब से व्याज देनदार रहूँगा| साथ ही मैं यह वचन देता हूँ कि गिरवी रखी हुई वस्तु में छ: माह के अंदर मूलधन तथा व्याज की राशी चुकाकर छुड़ा लूँगा अथवा फिर से यह करारनामा लिखूंगा या पुन: हस्ताक्षर करूँगा अन्यथा FIRMNAME को अधिकार होगा कि मुझे नोटीस दिए बिना जेवर बेच डाले| मैं कोई आप्पति करने को अधिकारी नही रहूँगा| 
     मैं यह घोषित करता हूँ कि यह जेवेर मेरा ही है| मुझे इस करारनामे की दोनो तरफ छपी, मेरे द्वारा स्वीकृत एक प्रति प्राप्त हुई है|


गवाह          जेवर गिरवी रखकर रकम पाने वाले के हस्ताक्षर या  बाए हाथ का अंगूठे का निशान
1
2

असल रकम                 व्याज रकम                  दिनांक            जेवर वापिस पाने वाले के हस्ताक्षर
TOTALAMOUNT                 TOTALINTEREST            RELDATE        ';



//Start Code to Add Indemnity Bond Content in Customized Notice Author:DIKSHA 27FEB2019
//
$contentIndemnityBond = '************************ Indemnity Bond ***************************

To
  THE PROPERITOR
  VARDHAMAN BANKERS
  HESARAGHATTA
  BANGALOORU-88

Dear Sir

    I CUSTNAME S/W/D/O CUSTCONAME aged about CUSTAGE years, residing at CUSTADDRESS
    am the pawner of Pawn ticket no. SNO The said pawn ticket is lost misplaced/destroyed 
and hence untraceable. The said pawn ticket is not accompanied by any transfer deed signed by me and I have not nor any person by my order in any manner disposed off, parted with or pledged the said pawn ticket or assigned our interest there in or any part there of to any person. I am the sole and 

absolute owner of following items         Pledged vide pawn ticket no      SNO

                                SNO             ITEMNAME             WEIGHT
                        
and the purpose of redemption on referring to the pawn broker and explaining my inability to go through the legal procedures of declaration in Form D I hereby make this affidavit and hereby under take to indemnify the pawn broker against all procedings,
claims,expenses and liabilities what so ever which may be taken or made against or incurred by the pawn broker by reason of the issue of such pawned articles

Date : TODAYDATE

BANGALOORU - 88

(wittness)';
//
//End Code to Add Indemnity Bond Content in Customized Notice Author:DIKSHA 27FEB2019
//Start To protect MySQL injection
$content = mysqli_real_escape_string($conn, stripslashes($content));
$contentIndemnityBond = mysqli_real_escape_string($conn, stripslashes($contentIndemnityBond));    //for Indemnity Bond Author:DIKSHA 27FEB2019
//
// ======================================================================================================= //
// START CODE TO ADD CONDITION FOR INSERTING ENTRY ONLY IF ENTRY IS NOT PRESENT @AUTHOR:MADHUREE-11NOV2020 //
// ======================================================================================================= //
//
$qformSevenSetupDetails = "SELECT * FROM customized_notice WHERE cuno_type = 'agreement'";
$resformSevenSetupDetails = mysqli_query($conn, $qformSevenSetupDetails) or die(mysqli_error($conn));
$totalFormSevenSetupDetails = mysqli_num_rows($resformSevenSetupDetails);
if ($totalFormSevenSetupDetails <= 0) {
    $qInsertCustomNotice = "INSERT INTO customized_notice(    
            cuno_own_id, cuno_type, cuno_default_type,cuno_form_size,cuno_notice_width,cuno_notice_height,cuno_notice_font,cuno_notice_color,cuno_notice_cont)
           VALUES('$ownerId', 'agreement', 'agreement','custmNoticeLayA5','135','100','14','black','$content')";

    if (!mysqli_query($conn, $qInsertCustomNotice)) {
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
$qformSevenSetupDetails = "SELECT * FROM customized_notice WHERE cuno_type = 'indemnityBond'";
$resformSevenSetupDetails = mysqli_query($conn, $qformSevenSetupDetails) or die(mysqli_error($conn));
$totalFormSevenSetupDetails = mysqli_num_rows($resformSevenSetupDetails);
if ($totalFormSevenSetupDetails <= 0) {
    $qInsertCustomNotice = "INSERT INTO customized_notice(    
            cuno_own_id, cuno_type, cuno_default_type,cuno_form_size,cuno_notice_width,cuno_notice_height,cuno_notice_font,cuno_notice_color,cuno_notice_cont)
           VALUES ('$ownerId', 'indemnityBond', 'indemnityBond','custmNoticeLayA5','135','100','14','black','$contentIndemnityBond')";

    if (!mysqli_query($conn, $qInsertCustomNotice)) {
        die('Error: ' . mysqli_error($conn));
    }
}
//
// ===================================================================================================== //
// END CODE TO ADD CONDITION FOR INSERTING ENTRY ONLY IF ENTRY IS NOT PRESENT @AUTHOR:MADHUREE-11NOV2020 //
// ===================================================================================================== //
//
?>