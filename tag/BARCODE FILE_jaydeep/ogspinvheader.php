<?php
/*
 * **************************************************************************************
 * @tutorial: Sell Invoice A5 Sheet Format
 * **************************************************************************************
 * 
 * Created on May 29, 2013 9:16:40 PM
 *
 * @FileName: ogspinvheader.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: omunim
 * @version 1.0.1
 * @Copyright (c) 2010 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2012 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php
//header start
$currentFileName = basename(__FILE__);
include 'system/omsachsc.php';
require_once 'system/omsgeagb.php';
require_once 'system/omssopin.php';
include_once 'ommpnmwd.php';
include_once 'ommpfndv.php';
require_once 'ommpincr.php';
include_once 'conversions.php';
include 'phpqrcode/qrlib.php';
?>
<?php
//Start Code to get Cust and Firm Details 
//Start Code To Select FirmId
if ($_SESSION['setFirmSession'] != '') {
    $strFrmId = $_SESSION['setFirmSession'];
} else {
    $strFrmId = getFirmByPass($globalOwnPass, $globalOwnIPass);
}
$firm_id = $_REQUEST['firmId'];
// salepurchase to  stock_sell @Author: GAUR18MAR16
$userId = $_REQUEST['userId'];
//
if($sellInvoiceDate == '' || $sellInvoiceDate == NULL){
    $sellInvoiceDate = $_REQUEST['invoiceDate'];
}
$invDate = date("d M Y", strtotime($sellInvoiceDate));
//
//$invoiceDate = date_create($invoiceDate);        
$invoiceYear = date('Y', strtotime($invoiceDate));
$FinancialYearFrom = '01 APR ' . $invoiceYear;
$fromDateTime = strtotime(strtoupper($FinancialYearFrom));
$invdate = strtotime(strtoupper($invoiceDate));
if($invdate < $fromDateTime){
$rowFinancialYearFrom = $invoiceYear - 1;
 $rowFinancialYearTo = $invoiceYear;
 }else{
 $rowFinancialYearFrom = $invoiceYear;
 $rowFinancialYearTo = $invoiceYear + 1;
}
$financialYr = 'sell_' . $rowFinancialYearFrom . '_' . $rowFinancialYearTo;
//echo '$financialYr=>'.$financialYr;
         $currentDate = date('Y-m-d'); // Format: Year-Month-Day (e.g., 2024-03-26)
                                    $currdatetime = strtotime(strtoupper($currentDate));
                                    $CurrentYear = date('Y', strtotime($currentDate));
                                    
                                    $fdatestart = '01 APR ' . $CurrentYear;
                                    
                                    $fdatestartime = strtotime(strtoupper($fdatestart));
                                 
                                      if($currdatetime > $fdatestartime){
                                        $rowFinancialYearFrom = $CurrentYear;
                                        $rowFinancialYearTo = $CurrentYear + 1;
                                    }else{
                                         $rowFinancialYearFrom = $CurrentYear - 1;
                                        $rowFinancialYearTo = $CurrentYear;
                                    }
                                    
                                    $start =  '01 APR ' . $rowFinancialYearFrom;
                                    $end = '31 MAR' . $rowFinancialYearTo;
                                    
                                    $startime = strtotime(strtoupper($start));
                                    $endtime = strtotime(strtoupper($end));
//
if($invoicePanel=='MeltingTransList'){
    $invName = $invoicePanel;
}
if ($invName == 'XRF_PAYMENT') {
    //
//    $qSelCustId = "SELECT xrf_user_id,xrf_firm_id,xrf_metal_type FROM xrf_entries WHERE xrf_owner_id = '$sessionOwnerId' "
//            . "and xrf_pre_invoice_no = '$slPrPreInvoiceNo' and "
//            . "xrf_invoice_no = '$slPrInvoiceNo' and xrf_firm_id IN ($strFrmId) AND xrf_status NOT IN ('DELETED') AND "
//            . "xrf_user_id = '$userId' order by xrf_id asc";
//
//    //echo '$qSelCustId == '.$qSelCustId;
//
//    $resCustId = mysqli_query($conn, $qSelCustId);
//    $rowCustId = mysqli_fetch_array($resCustId, MYSQLI_ASSOC);
//    $firmId = $rowCustId['xrf_firm_id'];
//    $metal_type = $rowCustId['xrf_metal_type'];
//    $sttr_transaction_type = 'sell';
    //
} else if ($invName == 'TRANS_PAYMENT') {
    //
//    $qSelCustId = "SELECT transaction_firm_id FROM transaction WHERE transaction_own_id = '$sessionOwnerId' "
//            . "and transaction_pre_vch_id = '$slPrPreInvoiceNo' and "
//            . "transaction_post_vch_id = '$slPrInvoiceNo' and transaction_firm_id IN ($strFrmId) "
//            . "AND transaction_upd_sts IN ('PaymentDone') "
//            . "order by transaction_id asc";
//
//    echo '$qSelCustId == '.$qSelCustId;
//
//    $resCustId = mysqli_query($conn, $qSelCustId);
//    $rowCustId = mysqli_fetch_array($resCustId, MYSQLI_ASSOC);
    $firmId = $getUserTransDetails[0]['utin_firm_id']; //$getStockTransDetails[0]['sttr_firm_id'];//$rowCustId['transaction_firm_id'];
    $metal_type = "TransPayment";
    $sttr_transaction_type = "TransPayment";
    //
} else if ($invName == 'MeltingTransList') {
    //
//    $qSelCustId = "SELECT sttr_user_id,sttr_firm_id,sttr_transaction_type,sttr_metal_type,sttr_firm_id,sttr_item_melt_info,sttr_id as melt_sttr_id FROM stock_transaction WHERE sttr_owner_id = '$sessionOwnerId' "
//            . "and sttr_invoice_no = '$slPrInvoiceNo' and "
//            . "sttr_pre_invoice_no = '$slPrPreInvoiceNo' ";
//
////    echo 'user_fname == '.$user_fname;
//
//    $resCustId = mysqli_query($conn, $qSelCustId);
//    $resDet = mysqli_query($conn, $qSelCustId);
//    $rowCustId = mysqli_fetch_array($resCustId, MYSQLI_ASSOC);
    $sttr_item_melt_info = $getStockTransDetails[0]['sttr_item_melt_info']; //$rowCustId['sttr_item_melt_info'];
//    parse_str(getTableValues("SELECT user_fname as fname from user where user_type = 'SUPPLIER' and user_fname = '$sttr_item_melt_info'"));
    foreach ($getUserDetails as $getUserDetails) {
        if ($getUserDetails['user_fname'] == $sttr_item_melt_info) {
            $fname = $getUserDetails['user_fname'];
        }
    }
    if ($fname == '' || $fname == NULL) {
        $meltsuppliermissing = 1;
        $userId = '';
        $firmId = $getStockTransDetails[0]['sttr_firm_id'];
        $metal_type = $getStockTransDetails[0]['sttr_metal_type'];
        $sttr_transaction_type = $getStockTransDetails[0]['sttr_transaction_type'];
        $_GET['selFirmId'] = $firmId;
        $melt_sttr_id = $getStockTransDetails[0]['melt_sttr_id'];
    } else {
        $firmId = $getStockTransDetails[0]['sttr_firm_id'];
        $metal_type = $getStockTransDetails[0]['sttr_metal_type'];
        $sttr_transaction_type = $getStockTransDetails[0]['sttr_transaction_type'];
        $userId = $getStockTransDetails[0]['sttr_user_id'];
        $_GET['selFirmId'] = $firmId;
    }
} else {
    //
//    if($invdate >= $startime 
//            && $invdate <= $endtime){
//       $qSelCustId = "SELECT sttr_user_id, sttr_firm_id, sttr_metal_type, sttr_transaction_type FROM stock_transaction_sell_2022_2023 "
//            . "WHERE sttr_owner_id='$sessionOwnerId' and sttr_pre_invoice_no='$slPrPreInvoiceNo' and "
//            . "sttr_invoice_no='$slPrInvoiceNo' and sttr_firm_id IN ($strFrmId) AND sttr_status NOT IN ('DELETED') "
//            . "and sttr_indicator IN ('stock','PURCHASE','rawMetal','crystal','imitation','strsilver','ItemReturn','APPROVAL', 'PurchaseReturn') "
//            . "and sttr_transaction_type IN('STOCK', 'newOrder','sell','ESTIMATESELL','PURCHASE','PURBYSUPP','ESTIMATE','ItemReturn','APPROVAL', 'PurchaseReturn') "
//            . "and sttr_user_id='$userId' order by sttr_id asc";
//    }else{
//    $qSelCustId = "SELECT sttr_user_id, sttr_firm_id, sttr_metal_type, sttr_transaction_type FROM stock_transaction_sell_2022_2023 "
//            . "WHERE sttr_owner_id='$sessionOwnerId' and sttr_pre_invoice_no='$slPrPreInvoiceNo' and "
//            . "sttr_invoice_no='$slPrInvoiceNo' and sttr_firm_id IN ($strFrmId) AND sttr_status NOT IN ('DELETED') "
//            . "and sttr_indicator IN ('stock','PURCHASE','rawMetal','crystal','imitation','strsilver','ItemReturn','APPROVAL', 'PurchaseReturn') "
//            . "and sttr_transaction_type IN('STOCK', 'newOrder','sell','ESTIMATESELL','PURCHASE','PURBYSUPP','ESTIMATE','ItemReturn','APPROVAL', 'PurchaseReturn') "
//            . "and sttr_user_id='$userId' order by sttr_id asc";
//    
//}
//    $resCustId = mysqli_query($conn, $qSelCustId);
//    $resDet = mysqli_query($conn, $qSelCustId);
//    $rowCustId = mysqli_fetch_array($resCustId, MYSQLI_ASSOC);
    $firmId = $getStockTransDetails[0]['sttr_firm_id'];
    $metal_type = $getStockTransDetails[0]['sttr_metal_type'];
    $sttr_transaction_type = $getStockTransDetails[0]['sttr_transaction_type'];
    //
    //   
}
//
//echo '$qSelCustId == '.$qSelCustId.'<br />';
//
$goldPresent = 0;
$silverPresent = 0;
//
foreach ($getStockTransDetails as $item) {
    if (isset($item['sttr_metal_type']) && $item['sttr_metal_type'] === 'Gold') {
        $goldPresent = 1;
    }
    if (isset($item['sttr_metal_type']) && $item['sttr_metal_type'] === 'Silver') {
        $silverPresent = 1;
    }
}
//while ($rowDet = mysqli_fetch_array($resDet, MYSQLI_ASSOC)) {
//    
//    if ($rowDet['sttr_metal_type'] == 'Gold' || $rowDet['sttr_metal_type'] == 'GOLD') {
//        $goldPresent = 1;
//    }
//    
//    if (($rowDet['sttr_product_type'] == 'Gold' || $rowDet['sttr_product_type'] == 'GOLD') && $goldPresent == 0) {
//        $goldPresent = 1;
//    }
//    
//    if ($rowDet['sttr_metal_type'] == 'Silver' || $rowDet['sttr_metal_type'] == 'SILVER') {
//        $silverPresent = 1;
//    }
//    
//    if (($rowDet['sttr_product_type'] == 'Silver' || $rowDet['sttr_product_type'] == 'SILVER') && $silverPresent == 0) {
//        $silverPresent = 1;
//    }
//    
//}
//echo '$silverPresent : '.$silverPresent.'<br>';
//echo '$goldPresent : '.$goldPresent.'<br>';
//
//!= 'NoRateCut'
//$qSelSlPrItemDetails = "SELECT stsl_id,stsl_metal_type FROM stock_sell where stsl_owner_id='$sessionOwnerId' and stsl_cust_pre_invoice_no='$slPrPreInvoiceNo' and stsl_cust_invoice_no='$slPrInvoiceNo' AND stsl_status NOT IN ('Deleted') order by stsl_since asc"; //Add condition for wholesalepurchase @Author:ANUJA22APR15
//echo '$qSelSlPrItemDetails'.$qSelSlPrItemDetails;
//$resSlPrItemDetails = mysqli_query($conn, $qSelSlPrItemDetails);
//while ($rowSlPrDetails = mysqli_fetch_array($resSlPrItemDetails, MYSQLI_ASSOC)) {
//    if ($rowSlPrDetails['stsl_metal_type'] == 'Gold') {
//        $goldPresent = 1;
//    }
//    if ($rowSlPrDetails['stsl_metal_type'] == 'Silver') {
//        $silverPresent = 1;
//    }
//}
if ($sttr_transaction_type == 'PURBYSUPP') {
    $sttr_trans_type = 'PURCHASE';
} else {
    $sttr_trans_type = $sttr_transaction_type;
}
//
if ($goldPresent == 1 && $silverPresent == 1) {
    $invTitle_pre = ' GOLD-SILVER ' . strtoupper($sttr_trans_type);
    if ($invName == 'metalPurchase') {
        $invTitle_pre = ' RAW GOLD-SILVER  ' . strtoupper($sttr_trans_type);
    }
    if ($invName == 'rawMetalSale') {
        $invTitle_pre = ' RAW GOLD-SILVER  ' . strtoupper($sttr_trans_type);
    }
    if ($invName == 'MeltingTransList') {
        $invTitle_pre = ' RAW GOLD ' . strtoupper($sttr_trans_type);
    }
} else if ($goldPresent == 1) {
    $invTitle_pre = ' GOLD ' . strtoupper($sttr_trans_type);
    if ($invName == 'metalPurchase') {
        $invTitle_pre = ' RAW GOLD ' . strtoupper($sttr_trans_type);
    }
    if ($invName == 'rawMetalSale') {
        $invTitle_pre = ' RAW GOLD ' . strtoupper($sttr_trans_type);
    }
    if ($invName == 'MeltingTransList') {
        $invTitle_pre = ' RAW GOLD ' . strtoupper($sttr_trans_type);
    }
} else {
    $invTitle_pre = ' SILVER ' . strtoupper($sttr_trans_type);
    if ($invName == 'metalPurchase') {
        $invTitle_pre = ' RAW SILVER ' . strtoupper($sttr_trans_type);
    }
    if ($invName == 'rawMetalSale') {
        $invTitle_pre = ' RAW SILVER ' . strtoupper($sttr_trans_type);
    }
    if ($invName == 'MeltingTransList') {
        $invTitle_pre = ' RAW GOLD ' . strtoupper($sttr_trans_type);
    }
}
//
//
$counter = 1;
$counterNew = 1;
//
//
//Select Inv Present
//$qRowSlrn = noOfRows2('slprrn_id', 'slpr_return_inv', 'slprrn_pre_invoice_no', 'slprrn_invoice_no', $slPrPreInvoiceNo, $slPrInvoiceNo);
//
//parse_str(getTableValues("SELECT firm_id,firm_reg_no,firm_form_header,firm_name,firm_long_name,firm_address,firm_phone_details,firm_email,firm_desc,firm_pan_no,"
//                . "firm_owner_sign_ftype,firm_tin_no,firm_left_thumb_ftype,firm_right_thumb_ftype,"
//                . "firm_bank_details, firm_bank_acc_no, firm_bank_ifsc_code, firm_bank_declaration "
//                . " FROM firm where firm_own_id='$sessionOwnerId' and f1irm_id='$firmId' $sessionFirmStr"));

$firm_reg_no = $getFirmDetails['firm_reg_no'];
$firm_form_header = $getFirmDetails['firm_form_header'];
$firm_name = $getFirmDetails['firm_name'];
$firm_long_name = $getFirmDetails['firm_long_name'];
$firm_address = $getFirmDetails['firm_address'];
$firm_phone_details = $getFirmDetails['firm_phone_details'];
$firm_email = $getFirmDetails['firm_email'];
$firm_desc = $getFirmDetails['firm_desc'];
$firm_pan_no = $getFirmDetails['firm_pan_no'];
$firm_owner_sign_ftype = $getFirmDetails['firm_owner_sign_ftype'];
$firm_tin_no = $getFirmDetails['firm_tin_no'];
$firm_left_thumb_ftype = $getFirmDetails['firm_left_thumb_ftype'];
$firm_right_thumb_ftype = $getFirmDetails['firm_right_thumb_ftype'];
$firm_bank_details = $getFirmDetails['firm_bank_details'];
$firm_bank_acc_no = $getFirmDetails['firm_bank_acc_no'];
$firm_bank_ifsc_code = $getFirmDetails['firm_bank_ifsc_code'];
$firm_bank_declaration = $getFirmDetails['firm_bank_declaration'];
$firm_city = $getFirmDetails['firm_city'];
//************************Start change code for data from customer to user Author@:SANT12JAN16******************************************************************************************
//
//$qSelFirm = "SELECT firm_id,firm_reg_no,firm_form_header,firm_name,firm_long_name,firm_address,firm_city,firm_phone_details,firm_email,firm_desc,firm_pan_no,"
//        . "firm_tin_no,firm_left_thumb_ftype,firm_right_thumb_ftype,firm_owner_sign_ftype FROM firm where firm_own_id='$sessionOwnerId' and firm_id='$firmId' $sessionFirmStr";
//$resFirmCount = mysqli_query($conn, $qSelFirm);
//
//while ($rowFirm = mysqli_fetch_array($resFirmCount, MYSQLI_ASSOC)) {
//    $firm_long_name = $rowFirm['firm_long_name'];
//    $firm_city = $rowFirm['firm_city'];
//}>';
//if ($sellerCity == '' || $sellerCity == null) {
//    $qSelCityPinCode = "SELECT city_name,city_pincode FROM city WHERE city_own_id = '$sessionOwnerId' and city_selected = 'selected' ";
//    $resSelCityPicCode = mysqli_query($conn, $qSelCityPinCode) or die(mysqli_error($conn));
//    $rowSelCityPicCode = mysqli_fetch_array($resSelCityPicCode);
//    $sellerPinCode = $rowSelCityPicCode['city_pincode'];
//    $sellerCity = $rowSelCityPicCode['city_name'];
//}
//$qselectState = "select state_name,state_code from state where state_own_id='$sessionOwnerId' and state_selected='selected' ";
//$qurResState = mysqli_query($conn, $qselectState);
//$resStateSelName = mysqli_fetch_array($qurResState);
//$sellStateSelName = $resStateSelName['state_name'];
//$sellStateSelCode = $resStateSelName['state_code'];
if ($_REQUEST['directOrderAssign'] == 'YES') {
//    $directOrderAssignUserId = $_REQUEST['directOrderAssignUserId'];
//    parse_str(getTableValues("SELECT user_type,user_fname,user_lname,user_prefix_name,user_father_name,user_pan_it_no,user_sale_tax_no,user_add,user_official_address,user_city,user_village,user_tehsil,user_pincode,user_state,user_country,user_cst_no,user_phone,user_adhaar_card,user_shop_name,user_mobile FROM user where user_owner_id='$sessionOwnerId' and user_id='$directOrderAssignUserId'"));
    foreach ($getUserDetails as $getUserDetails) {
        if ($getUserDetails['user_id'] == $directOrderAssignUserId) {
            $user_type = $getUserDetails['user_type'];
            $user_fname = $getUserDetails['user_fname'];
            $user_lname = $getUserDetails['user_lname'];
            $user_prefix_name = $getUserDetails['user_prefix_name'];
            $user_father_name = $getUserDetails['user_father_name'];
            $user_pan_it_no = $getUserDetails['user_pan_it_no'];
            $user_sale_tax_no = $getUserDetails['user_sale_tax_no'];
            $user_add = $getUserDetails['user_add'];
            $user_official_address = $getUserDetails['user_official_address'];
            $user_city = $getUserDetails['user_city'];
            $user_village = $getUserDetails['user_village'];
            $user_tehsil = $getUserDetails['user_tehsil'];
            $user_pincode = $getUserDetails['user_pincode'];
            $user_state = $getUserDetails['user_state'];
            $user_country = $getUserDetails['user_country'];
            $user_cst_no = $getUserDetails['user_cst_no'];
            $user_phone = $getUserDetails['user_phone'];
            $user_adhaar_card = $getUserDetails['user_adhaar_card'];
            $user_shop_name = $getUserDetails['user_shop_name'];
            $user_mobile = $getUserDetails['user_mobile'];
        }
if ($sellerCity == '' || $sellerCity == null) {
    $qSelCityPinCode = "SELECT city_name,city_pincode FROM city WHERE city_own_id = '$sessionOwnerId' and city_selected = 'selected' ";
    $resSelCityPicCode = mysqli_query($conn, $qSelCityPinCode) or die(mysqli_error($conn));
    $rowSelCityPicCode = mysqli_fetch_array($resSelCityPicCode);
    $sellerPinCode = $rowSelCityPicCode['city_pincode'];
    $sellerCity = $rowSelCityPicCode['city_name'];
    }
    }
} else if ($meltsuppliermissing) {
//   parse_str(getTableValues("SELECT sttr_item_melt_info as user_fname FROM stock_transaction WHERE sttr_owner_id = '$sessionOwnerId' "
//            . "and sttr_invoice_no = '$slPrInvoiceNo' and "
//            . "sttr_pre_invoice_no = '$slPrPreInvoiceNo' "));
    $user_fname = $getStockTransDetails[0]['sttr_item_melt_info'];
} else {
//--------Start code for prefix by Ashwini Patil-----
//    parse_str(getTableValues("SELECT user_type,user_fname,user_lname,user_prefix_name,user_father_name,user_pan_it_no,user_sale_tax_no,user_add,user_official_address,user_city,user_village,user_tehsil,user_pincode,user_state,user_country,user_cst_no,user_phone,user_adhaar_card,user_shop_name,user_mobile FROM user where user_owner_id='$sessionOwnerId' and user_id='$userId'"));
//--------Start code for USER ADDRESS by RUTUJA KORPE 20NOV2020-----
//    foreach ($getUserDetails as $getUserDetails) {
//    echo '$userId-->'.$userId.'<br>';
        if ($getUserDetails['user_id'] == $userId) {
            $user_type = $getUserDetails['user_type'];
            $user_fname = $getUserDetails['user_fname'];
            $user_lname = $getUserDetails['user_lname'];
            $user_prefix_name = $getUserDetails['user_prefix_name'];
            $user_father_name = $getUserDetails['user_father_name'];
            $user_pan_it_no = $getUserDetails['user_pan_it_no'];
            $user_sale_tax_no = $getUserDetails['user_sale_tax_no'];
            $user_add = $getUserDetails['user_add'];
            $user_official_address = $getUserDetails['user_official_address'];
            $user_city = $getUserDetails['user_city'];
            $user_village = $getUserDetails['user_village'];
            $user_tehsil = $getUserDetails['user_tehsil'];
            $user_pincode = $getUserDetails['user_pincode'];
            $user_state = $getUserDetails['user_state'];
            $user_country = $getUserDetails['user_country'];
            $user_cst_no = $getUserDetails['user_cst_no'];
            $user_phone = $getUserDetails['user_phone'];
            $user_adhaar_card = $getUserDetails['user_adhaar_card'];
            $user_shop_name = $getUserDetails['user_shop_name'];
            $user_mobile = $getUserDetails['user_mobile'];
//        }
    }
}
if ($user_add == '' || $user_add == NULL) {
    $user_add = $user_official_address;
}
//--------End code for prefix by Ashwini Patil-----
//*************************End change code for data from customer to user Author@:SANT12JAN16******************************************************************************************
//echo $invoicePanel;
if ($invoicePanel == 'sellInvLay3Inch') {
    $divIdClass = 'sell_Inv_3Inch';
    $tableClass = 'sell_Inv_table';
    $imageClass = 'form7-logo-image';
    $colspan = '7';
    $itemIdWidth = '38px';
    $itemDescWidth = '34px';
    $gsWtWidth = '50px';
    $rateWidth = '53px';
    $valWidth = '54px';
    $amtWidth = '73px';
    $balanceTopBorder = 'border-color-grey-top';
    $itemNameSubstr = '4';
    $balanceInWordsFs = 'fs_12';
    $firmHeader = 'fs_18';
    $firmLongName = 'fs_16';
    $firmDesc = 'fs_14';
    $firmAddress = 'fs_12';
    $addressSubStr = '15';
    $fontSize = 'fs_12';
    $textAreaWidth = '290px';
    $wd = 400;
    $totalWidth = '60px';
    $rawPurityTitle = 'PR';
    $rawRateTitle = 'RT';
    $goldShort = 'GD';
    $silverShort = 'SR';
    $rawTitle = 'RW';
} else if ($invoicePanel == 'sellInvLay4Inch' || $invoicePanel == 'sellInvLayA6') {
    $divIdClass = 'sell_4InchInv_table';
    $tableClass = 'sell_4InchInv_table';
    $imageClass = 'form7-logo-image';
    $colspan = '8';
    $itemIdWidth = '38px';
    $itemDescWidth = '85px';
    $gsWtWidth = '56px';
    $ntWtWidth = '56px';
    $rateWidth = '45px';
    $valWidth = '70px';
    $amtWidth = '91px';
    $itemNameSubstr = '5';
    $balanceTopBorder = 'border-color-grey-top';
    $balanceInWordsFs = 'fs_12';
    $firmHeader = 'fs_20';
    $firmLongName = 'fs_18';
    $firmDesc = 'fs_16';
    $firmAddress = 'fs_12';
    $addressSubStr = '27';
    $fontSize = 'fs_12';
    $textAreaWidth = '340px';
    $wd = 400;
    $totalWidth = '60px';
    $rawPurityTitle = 'PR';
    $rawRateTitle = 'RT';
    $goldShort = 'GD';
    $silverShort = 'SR';
    $rawTitle = 'RW';
    $custAddress = '180px';
    $finalamtwidth = '70%';
} else if ($invoicePanel == 'sellInvLayA5') {

    $divIdClass = 'bodyClass';
    $rateTableWidth = '100%';
    $tableClass = 'sellInvA5-main-table';
    $imageClass = 'form8-logo-image';
    $colspan = '8';
    $itemIdWidth = '40px';
    $itemDescWidth = '55px';
    $gsWtWidth = '55px';
    $ntWtWidth = '55px';
    $rateWidth = '40px';
    $valWidth = '65px';
    $labourWidth = '50px';
    $amtWidth = '86px';
    $balanceTopBorder = '';
    $itemNameSubstr = '6';
    $balanceInWordsFs = 'fs_14';
    $firmHeader = 'fs_22';
    $firmLongName = 'fs_20';
    $firmDesc = 'fs_16';
    $firmAddress = 'fs_14';
    $addressSubStr = '45';
    $fontSize = 'fs_13';
    $textAreaWidth = '400px';
    $wd = 600;
    $totalWidth = '60px';
    $rawPurityTitle = 'PR';
    $rawRateTitle = 'RT';
    $goldShort = 'GD';
    $silverShort = 'SR';
    $rawTitle = 'RAW';
    $custAddress = '300px';
    $finalamtwidth = '50%';
} else {
    $divIdClass = 'A4-size';
    $tableClass = 'A4-Inv-Table';
    $colspan = '14';
    $imageClass = 'form8-logo-image';
    $balanceTopBorder = '';
    $itemNameSubstr = '6';
    $balanceInWordsFs = 'fs_14';
    $firmHeader = 'fs_22';
    $firmLongName = 'fs_20';
    $firmDesc = 'fs_16';
    $firmAddress = 'fs_14';
    $addressSubStr = '45';
    $fontSize = 'fs_13';
    $textAreaWidth = '790px';
    $wd = 860;
    $totalWidth = '90px';
    $rawPurityTitle = 'PURITY';
    $rawRateTitle = 'RATE';
    $goldShort = 'GOLD';
    $silverShort = 'SILVER';
    $rawTitle = 'RAW';
    $custAddress = '300px';
    $finalamtwidth = '50%';
}
//if ($labelType == '')
//    $labelType = 'SellPurchase';
//$fieldName = 'topMargin';
//parse_str(getTableValues("SELECT label_field_content FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
//$topMargin_content = $label_field_content;
//echo '$topMargin_content=='.$topMargin_content;
//$label_field_content = '';
//$fieldName = 'leftMargin';
//parse_str(getTableValues("SELECT label_field_content FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
//$leftMargin_content = $label_field_content;

$fieldName = 'formBorderCheck';
$label_field_content = '';
//parse_str(getTableValues("SELECT label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
$label_field_check = $getLabelDetails['formBorderCheck']['label_field_check'];
if ($label_field_check == 'true') {
    $border = '#000000 1px solid';
} else {
    $border = '#000000 0px solid';
}
//START CODE FOR LOGO IMAGE ACTUAL SIZE: AUTHOR @DARSHANA 1 APRIL 2022
//$queryLogoImageActualSizeOnInvoice = "SELECT omly_value FROM omlayout WHERE omly_option = 'logoImageActualSizeOnInvoice'";
//$resLogoImageActualSizeOnInvoice = mysqli_query($conn, $queryLogoImageActualSizeOnInvoice);
//$rowLogoImageActualSizeOnInvoice = mysqli_fetch_array($resLogoImageActualSizeOnInvoice);
//$logoImageActualSizeOnInvoice = $rowLogoImageActualSizeOnInvoice['omly_value'];
$logoImageActualSizeOnInvoice = $getLayoutDetails['logoImageActualSizeOnInvoice'];
?>
<?php
if ($topMargin_content == '')
    $topMargin_content = 0;
if ($leftMargin_content == '')
    $leftMargin_content = 0;
//
//$showSecPagePrint = "SELECT omly_value FROM omlayout WHERE omly_own_id = '$sessionOwnerId' and omly_option = 'showSecPagePrint'";
//$resShowSecPagePrint = mysqli_query($conn, $showSecPagePrint);
//$rowShowSecPagePrint = mysqli_fetch_array($resShowSecPagePrint);
$showSecPagePrint = $getLayoutDetails['showSecPagePrint']; //$rowShowSecPagePrint['omly_value'];
//
if ($showSecPagePrint == 'YES') {
    ?>
    <style>
        @page {
            margin-top: <?php echo $topMargin_content; ?>mm;
            margin-bottom: <?php echo $bottomMargin_content; ?>mm;
            margin-left:<?php echo $leftMargin_content; ?>mm;
        }
    </style>
    <div id="<?php echo $divIdClass; ?>">
<?php } else { ?>
        <div id="<?php echo $divIdClass; ?>" style="margin-top:<?php echo $topMargin_content . 'mm'; ?>;margin-left:<?php echo $leftMargin_content . 'mm'; ?>;">
<?php } ?>

<?php
//
    $fieldName = 'formBorderSize'; //Pratiksha
    $label_field_content = ''; //Pratiksha
//  echo '---------->>>>'.$a="SELECT label_field_content FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'";
//  
    parse_str(getTableValues("SELECT label_field_content FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
  //echo '000---->>'.$label_field_content;
$formBorder = explode("#", $label_field_content);
$formBorderSize = $formBorder[0]; //Pratiksha
$formBorderColor = $formBorder[1];
//
    $fieldName = 'tableHeadingColor';//Pratiksha
    $label_field_content = '';//Pratiksha
    parse_str(getTableValues("SELECT label_field_content FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
$tableHeadingColor = trim($label_field_content);//Pratiksha
//echo '<br/>$formBorderColor:' . $formBorderColor;
//    $fieldName = 'headerTop';
//    $label_field_content = '';
//    parse_str(getTableValues("SELECT label_field_content FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
$headerTopVal = $headerTop_content;
if ($headerTopVal == '')
    $headerTopVal = 2;
//
//    $fieldName = 'formWidth';
//    $label_field_content = '';
//    parse_str(getTableValues("SELECT label_field_content FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
$formWidthInMM = $formWidth_content;
if ($formWidthInMM != '') {
    if ($formWidthInMM > 180) {
        $rateTableWidth = '75%';
    } else {
        $rateTableWidth = '100%';
    }
    ?>
            <table cellpadding="0" cellspacing="0" align="left" valign="top" bgcolor="#FFFFFF" 
                   style="padding:2px;width:<?php echo $formWidthInMM . 'mm'; ?>;padding-top:<?php echo $headerTopVal; ?>;border: <?php echo $formBorderSize; ?>px solid #<?php echo $formBorderColor; ?>;"><!-- change in alignment from center to left and top @AUTHOR:SANDY22JUL13 -->
            <?php
        } else {
            $formWidthInMM = 190;
            $rateTableWidth = '75%';
            $headerTopVal = $headerTop_content;
            if ($headerTopVal == '')
                $headerTopVal = 1;
            ?>
                <table cellpadding="0" cellspacing="0" align="center" valign="top" bgcolor="#FFFFFF" class="paddingLeft2 paddingRight2 <?php echo $tableClass; ?>" 
                       style="padding:2px;width:<?php echo $formWidthInMM . 'mm'; ?>;padding-top:<?php echo $headerTopVal; ?>mm;border: <?php echo $formBorderSize; ?>px solid #<?php echo $formBorderColor; ?>;"><!-- change in alignment from center to left and top @AUTHOR:SANDY22JUL13 -->
                   <?php } ?>
                <tr> 
                    <!--//===================================================================================================
                       //====================== START CODE FOR ADD HEADER INFO IMG @SIMRAN:30MAR2023=====================//
                       //===================================================================================================-->
                <tr>
                    <td colspan="2">
                       <?php
//                        $fieldName = 'header_info_img';
                       $label_field_content = $getLabelDetails['header_info_img']['label_field_content'];
                       $label_field_font_size = $getLabelDetails['header_info_img']['label_field_font_size'];
                       $label_field_font_color = $getLabelDetails['header_info_img']['label_field_font_color'];
                       $label_field_check = $getLabelDetails['header_info_img']['label_field_check'];
//                        parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
//      
                       if ($label_field_check == 'true') {
                           parse_str(getTableValues("SELECT image_id,image_user_id,image_user_type FROM image WHERE image_snap_desc = 'SellPurchaseHeaderInfoImg'"));

                           if ($image_id != '') {
                               $imageId = $image_id;
                               $noEcho = 'Y';
                               include('omshowimage.php');
                               $noEcho = '';
                               ?>
                                <img width="100%" src="<?php echo 'data:image/jpeg;base64,' . base64_encode($imageContent); ?>" alt=" " />
                            <?php } else { ?>
                                <img width="100%" src="<?php echo $documentRoot; ?>/images/invoice/1280x500xh.png" alt=" " />
                            <?php } ?>
                        <?php } ?>  
                    </td>
                </tr>
                <!--//===================================================================================================
                   //====================== END CODE FOR ADD HEADER FIRM INFO IMG @SIMRAN:30MAR2023=====================//
                   //===================================================================================================-->

                <td align="left" colspan="<?php echo $colspan; ?>">
                    <table border="0" cellpadding="0" width="100%" cellspacing="0">
                        <!--START DEFAULT INVOICE LAYOUT-->
<?php if ($custInvLay == 'InvLayDefault') { ?>
                            <tr> 
                                <td align="left" colspan="<?php echo $colspan; ?>">
                                    <table border="0" cellpadding="0" width="100%" cellspacing="0">
                                        <tr>
                                            <!--START LEFT LOGO-->
                                            <?php if ($sttr_transaction_type == 'PURCHASE' || $sttr_transaction_type == 'PURBYSUPP' || $sttr_transaction_type == 'sell' || $sttr_transaction_type == 'ESTIMATESELL'|| $sttr_transaction_type == 'MELTING' || $sttr_transaction_type == 'newOrder') {
                                ?> <!--ADDED FIRM LEFT LOGO ON PURCHASE INV @SIMRAN:09MAY2023-->
                                                <td align="left" valign="top" width="25%">
                                                    <table border="0" cellpadding="0" cellspacing="0" align="left">
                                                        <tr valign="top">
        <?php
//                                                            $fieldName = 'firmLeftLogoCheck';
//                                                            parse_str(getTableValues("SELECT label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        if (($firm_left_thumb_ftype != NULL || $firm_left_thumb_ftype != '') && $firmLeftLogoCheck_check == 'true') {
            //
            $firmId = $firm_id;
            $noEcho = 'Y';
            include('omffgfli.php');
            $noEcho = '';
            ?>
                                                                <td align="left" valign="top">
                                                                    <img src="<?php echo 'data:image/jpeg;base64,' . base64_encode($firmThumb); ?>" 
                                                                         alt="" class="<?php
                                                                if ($logoImageActualSizeOnInvoice == 'YES') {
                                                                    echo '';
                                                                } else {
                                                                    echo $imageClass;
                                                                }
                                                                ?><?php if ($firmLeftLogoCheck_noPrintCheck == 'true') { ?>
                                                                             noPrintHidden <?php } ?>" />
                                                                </td>
                                                                         <?php
//                                                                     } else {
                                                                         //
                                                                         $firmId = $firm_id;
                                                                         $noEcho = 'Y';
                                                                         include('omffgfli.php');
                                                                         $noEcho = '';
                                                                         ?>
                                                                <td align="left" valign="top">
                                                                    <img src="<?php echo 'data:image/jpeg;base64,' . base64_encode($firmThumb); ?>" 
                                                                         alt="" class="<?php
                                                                if ($logoImageActualSizeOnInvoice == 'YES') {
                                                                    echo '';
                                                                } else {
                                                                    echo $imageClass;
                                                                }
                                                                ?><?php if ($firmLeftLogoCheck_noPrintCheck == 'true') { ?>
                                                                             noPrintHidden <?php } ?>" style="display:none"/>
                                                                </td>
                                                                     <?php } ?>
                                                        </tr>

                                                    </table>
                                                </td>
    <?php } else {
        ?>
                                                <!-- START WORK ON lEFT LOGO AUTHOR@SIMRAN18NOV2021-->
                                                <td align="left" valign="top">
                                                    <table border="0" cellpadding="0" cellspacing="0" align="left">
                                                        <tr valign="top">
                                                <?php
//                                                            $fieldName = 'firmLeftLogoCheck';
//                                                            parse_str(getTableValues("SELECT label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));

                                                $label_field_check = $getLabelDetails['firmLeftLogoCheck']['label_field_check'];
                                                if (($firm_left_thumb_ftype != NULL || $firm_left_thumb_ftype != '') && $firmLeftLogoCheck_check == 'true') {
                                                    //
                                                    $custId = $userId;
                                                    $noEcho = 'Y';
                                                    include('omccguim.php');
                                                    $noEcho = '';
                                                    ?>
                                                                <td align="left" valign="top">
                                                                    <img src="<?php echo 'data:image/jpeg;base64,' . base64_encode($custSnapThumb); ?>" 
                                                                         alt="" class="<?php
                                                                if ($logoImageActualSizeOnInvoice == 'YES') {
                                                                    echo '';
                                                                } else {
                                                                    echo $imageClass;
                                                                }
                                                                ?>" />
                                                                </td>
                                                                         <?php
                                                 } else {
                                                                         //
                                                                         $firmId = $firm_id;
                                                                        $noEcho = 'Y';
                                                                        include('omffgfli.php');
                                                                        $noEcho = '';
                                                                        ?>
                                                                            <td align="left" valign="top">
                                                                                <img src="<?php echo 'data:image/jpeg;base64,' . base64_encode($firmThumb); ?>" 
                                                                                     alt="" class="<?php
                                                                                        if ($logoImageActualSizeOnInvoice == 'YES') {
                                                                                            echo '';
                                                                                        } else {
                                                                                            echo $imageClass;
                                                                                        }
                                                                                        ?>" style="display:none;"/>
                                                                            </td>
                                                    <?php } ?>
                                                        </tr>

                                                    </table>
                                                </td>
                                                <!-- END WORK ON lEFT LOGO AUTHOR@SIMRAN18NOV2021-->
                                                        <?php } ?>
                                            <!--END LEFT LOGO-->


                                            <!--START FIRM DETAILS-->
    <?php if ($sttr_transaction_type != 'PURCHASE') { ?>
                                                <td align="right" valign="bottom">
                                                    <table border="0" cellpadding="0" width="100%" cellspacing="0" align="right">
        <?php
//                                                        $fieldName = 'firmFormHeader';
//                                                        $label_field_font_size = '';
//                                                        $label_field_font_color = '';
//                                                        parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        if ($firm_form_header != NULL && $firmFormHeader_check == 'true') {
            ?>
                                                            <tr> 
                                                                <td valign="middle" align="center" class="ff_calibri
                                                            <?php if ($firmFormHeader_noPrintCheck == 'true') { ?>
                                                                        noPrintHidden <?php } ?>
                                                                    " style="color:<?php echo $firmFormHeader_color; ?>;font-size:<?php echo $firmFormHeader_size; ?>px"  onClick="this.contentEditable = 'true';">
                                                            <?php echo ($firm_form_header); ?>
                                                                </td>
                                                            </tr>
                                                                <?php
                                                            }
//                                                        $fieldName = 'firmLongName';
//                                                        $label_field_font_size = '';
//                                                        $label_field_font_color = '';
//                                                        parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                            if ($firm_long_name != NULL && $firmLongName_check == 'true') {
                                                                ?>
                                                            <tr> 
                                                                <td valign="middle" align="center" class="ff_calibri font_color_<?php echo $firmLongName_color; ?>
                                                            <?php if ($firmLongName_noPrintCheck == 'true') { ?>
                                                                        noPrintHidden <?php } ?>" style="text-transform:capitalize;font-size:<?php echo $firmLongName_size; ?>px; font-weight: bold;" onClick="this.contentEditable = 'true';">
                                                            <?php echo ($firm_long_name); ?>
                                                                </td>
                                                            </tr>

                                                                <?php
                                                            }
//                                                        $fieldName = 'firmDesc';
//                                                        $label_field_font_size = '';
//                                                        $label_field_font_color = '';
//                                                        parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                            if ($firm_desc != NULL && $firmDesc_check == 'true') {
                                                                ?>
                                                            <tr> 
                                                                <td valign="middle" align="center"  class="ff_calibri font_color_<?php echo $firmDesc_color; ?> <?php if ($firmDesc_noPrintCheck == 'true') { ?>
                                                                        noPrintHidden <?php } ?>" style="font-size:<?php echo $firmDesc_size; ?>px" onClick="this.contentEditable = 'true';">
                                                            <?php echo ($firm_desc); ?>
                                                                </td>
                                                            </tr>
                                                            <?php
                                                        }
//                                                        $fieldName = 'firmRegNo';
//                                                        parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                        if ($firm_reg_no != NULL && $firmRegNo_check == 'true') {
                                                            ?>
                                                            <tr> 
                                                            <?php
//                                                                $fieldName = 'firmRegNoLabel';
//                                                                $label_field_font_size = '';
//                                                                $label_field_font_color = '';
//                                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                            ?>
                                                                <td valign="middle" align="center"  class="ff_calibri font_color_<?php echo $firmRegNoLabel_color; ?> <?php if ($firmRegNo_noPrintCheck == 'true') { ?>
                                                                        noPrintHidden <?php } ?>" style="font-size:<?php echo $firmRegNoLabel_size; ?>px" onClick="this.contentEditable = 'true';"><?php echo $firmRegNoLabel_content; ?> :
                                                                <?php
//                                                                    $fieldName = 'firmRegNo';
//                                                                    $label_field_font_size = '';
//                                                                    $label_field_font_color = '';
//                                                                    parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                ?>
                                                                    <span class="ff_calibri fw_n font_color_<?php echo $firmRegNo_color; ?> <?php if ($firmRegNo_noPrintCheck == 'true') { ?>
                                                                              noPrintHidden <?php } ?>" style="font-size:<?php echo $firmRegNo_size; ?>px" ><?php echo ($firm_reg_no); ?></span>
                                                                </td>
                                                            </tr>

                                                                    <?php
                                                                }
                                                                // 123
//                                                        $fieldName = 'firmAddress';
//                                                        $label_field_font_size = '';
//                                                        $label_field_font_color = '';
//                                                        parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                if ($firm_address != NULL && $firmAddress_check == 'true') {
                                                                    ?>
                                                            <tr> 
                                                                <td valign="middle" align="center"  class="ff_calibri font_color_<?php echo $firmAddress_color; ?> <?php if ($firmAddress_noPrintCheck == 'true') { ?>
                                                                        noPrintHidden <?php } ?>" style="font-size:<?php echo $firmAddress_size; ?>px" onClick="this.contentEditable = 'true';">
                                                            <?php echo ($firm_address); ?>
                                                                </td>
                                                            </tr>
                                                        <?php } if ((($firm_phone_details != NULL) || $firm_email != NULL)) { ?>
                                                            <tr>
                                                                <td colspan="2">
                                                                    <table border="0" cellpadding="0" cellspacing="0" align="center">
                                                                        <tr>
            <?php
//                                                                            $fieldName = 'firmPhone';
//                                                                            $label_field_font_size = '';
//                                                                            $label_field_font_color = '';
//                                                                            parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
            if ($firm_phone_details != NULL && $firmPhone_check == 'true') {
                ?>

                                                                                <td valign="middle" align="center"  class="ff_calibri font_color_<?php echo $firmPhone_color; ?> <?php if ($firmPhone_noPrintCheck == 'true') { ?>
                                                                                        noPrintHidden <?php } ?>" style="font-size:<?php echo $firmPhone_size; ?>px" onClick="this.contentEditable = 'true';">
                                                                                <?php echo '<b>' . $firmPhone_content . '</b>'; ?> : <?php echo $firm_phone_details; ?>
                                                                                </td>

                                                                                <?php
                                                                            }
//                                                                            $fieldName = 'firmEmail';
//                                                                            $label_field_font_size = '';
//                                                                            $label_field_font_color = '';
//                                                                            parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                            if ($firm_email != NULL && $firmEmail_check == 'true') {
                                                                                ?>

                                                                                <td valign="middle" align="center"  class="ff_calibri font_color_<?php echo $firmEmail_color; ?> padLeft5 <?php if ($firmEmail_noPrintCheck == 'true') { ?>
                                                                                        noPrintHidden <?php } ?>" style="font-size:<?php echo $firmEmail_size; ?>px" onClick="this.contentEditable = 'true';">
                                                                                <?php echo '<b>' . $firmEmail_content . '</b>'; ?> : <?php echo $firm_email; ?>
                                                                                </td>
                                                                            </tr>
                                                                            <?php } ?>
                                                                    </table>
                                                                </td>
                                                            </tr>
                                                                            <?php } ?>
        <?php if ((($firm_tin_no != '') || $firm_pan_no != '')) { ?>
                                                                        <?php
                                                                        // 123
//                                                            $fieldName = 'firmTinTop';
//                                                            parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                        if ($firm_tin_no != NULL && $firmTinTop_check == 'true') {
                                                                            ?>
                                                                <tr> 
                                                                <?php
//                                                                    $fieldName = 'firmTinTopLb';
//                                                                    $label_field_font_size = '';
//                                                                    $label_field_font_color = '';
//                                                                    parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                ?>
                                                                    <td valign="middle" align="center"  class="ff_calibri font_color_<?php echo $firmTinTopLb_color; ?><?php if ($firmTinTop_noPrintCheck == 'true') { ?>
                                                                            noPrintHidden <?php } ?>" style="font-size:<?php echo $firmTinTopLb_size; ?>px" onClick="this.contentEditable = 'true';">
                                                                    <?php echo 'GSTIN'; ?> :
                                                                    <?php
//                                                                        $fieldName = 'firmTinTop';
//                                                                        $label_field_font_size = '';
//                                                                        $label_field_font_color = '';
//                                                                        parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                    ?>
                                                                        <span class="ff_calibri fw_n font_color_<?php echo $firmTinTop_color; ?>" style="font-size:<?php echo $firmTinTop_size; ?>px" ><?php echo ($firm_tin_no); ?></span>
                                                                    </td>
                                                                </tr>
                                                                    <?php } ?>
                                                                    <?php
//                                                            $fieldName = 'firmPanTop';
//                                                            parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                    if ($firm_pan_no != '' && $firmPanTop_check == 'true') {
                                                                        ?>
                                                                <?php
//                                                                $fieldName = 'firmPanTopLb';
//                                                                $label_field_font_size = '';
//                                                                $label_field_font_color = '';
//                                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                ?>
                                                                <td align="center">
                                                                    <div class="ff_calibri  font_color_<?php echo $firmPanTopLb_color; ?><?php if ($firmPanTop_noPrintCheck == 'true') { ?>
                                                                             noPrintHidden <?php } ?>" style="font-size:<?php echo $firmPanTopLb_size; ?>px" onClick="this.contentEditable = 'true';"><?php echo $firmPanTopLb_content; ?> :&nbsp;&nbsp;
                                                                <?php
//                                                                        $fieldName = 'firmPanTop';
//                                                                        parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                ?>
                                                                        <span class="ff_calibri fw_n font_color_<?php echo $firmPanTop_color; ?>" style="font-size:<?php echo $firmPanTop_size; ?>px"><?php echo $firm_pan_no; ?></span></div>  
                                                                </td>
                                                                     <?php }
                                                                     ?>
                                                                 <?php } else { ?>
                                                                     <?php
                                                                     // 123
//                                                            $fieldName = 'firmTinTop';
//                                                            parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                     if ($firm_tin_no != NULL && $firmTinTop_check == 'true') {
                                                                         ?>
                                                                <tr> 
                                                                <?php
//                                                                    $fieldName = 'firmTinTopLb';
//
//                                                                    parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                ?>
                                                                    <td valign="middle" align="center"  class="ff_calibri font_color_<?php echo $firmTinTopLb_color; ?>" style="font-size:<?php echo $firmTinTopLb_size; ?>px" onClick="this.contentEditable = 'true';">
                                                                        <?php echo $firmTinTopLb_content; ?> :
                                                                    <?php
//                                                                        $fieldName = 'firmTinTop';
//                                                                        $label_field_font_size = '';
//                                                                        $label_field_font_color = '';
//                                                                        parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                    ?>
                                                                        <span class="ff_calibri fw_n font_color_<?php echo $firmTinTop_color; ?>" style="font-size:<?php echo $firmTinTop_size; ?>px" ><?php echo ($firm_tin_no); ?></span>
                                                                    </td>
                                                                </tr>
                                                                    <?php } ?>
                                                                    <?php
//                                                            $fieldName = 'firmPanTop';
//                                                            parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                    if ($firm_pan_no != '' && $firmPanTop_check == 'true') {
                                                                        ?>
                                                                <?php
//                                                                $fieldName = 'firmPanTopLb';
//                                                                $label_field_font_size = '';
//                                                                $label_field_font_color = '';
//                                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                ?>
                                                                <td align="center">
                                                                    <div class="ff_calibri  font_color_<?php echo $firmPanTopLb_color; ?>" style="font-size:<?php echo $firmPanTopLb_size; ?>px" onClick="this.contentEditable = 'true';">
                                                                <?php echo $firmPanTopLb_content; ?> :&nbsp;&nbsp;
                                                                <?php
//                                                                        $fieldName = 'firmPanTop';
//                                                                        parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                ?>
                                                                        <span class="ff_calibri  font_color_<?php echo $firmPanTop_color; ?>" style="font-size:<?php echo $firmPanTop_size; ?>px"><?php echo $firm_pan_no; ?></span></div>  
                                                                </td>
                                                                        <?php
                                                                    }
                                                                }
                                                                ?>

                                                    </table>
                                                    <table align="center" valign="bottom" cellpadding="0" cellspacing="0">
                                                        <tr>
                                                        <?php
//                                                        START CODE FOR TAX INVOICE TITLE CUSTOMIZATION : AUTHOR @DARSHANA 16 OCT 2021
//                                                            $fieldName = 'taxInvTitle';
//                                                            parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                        if ($taxInvTitle_check == 'true') {
                                                            ?>
                                                                <td align="center" style="padding-top: 10px;" valign="bottom">
                                                                    <div class="ff_calibri  font_color_<?php echo $taxInvTitle_color; ?>" style="font-size:<?php echo $taxInvTitle_size; ?>px" onClick="this.contentEditable = 'true';">
                                                                        <strong><?php echo $taxInvTitle_content; ?></strong>
                                                                    </div>  
                                                                </td>
                                                                <?php
                                                            }
//                                                        END CODE FOR TAX INVOICE TITLE CUSTOMIZATION : AUTHOR @DARSHANA 16 OCT 2021
                                                            ?>
                                                        </tr>
                                                    </table>
                                                </td>
                                                        <?php } else { ?>
                                                <td align="center">
                                                    <table border="0" cellpadding="0" width="100%" cellspacing="0" align="left">
                                                            <?php
//                                                        $fieldName = 'userName';
//                                                        parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                            $userNamefontsize = $userName_size;
                                                            if ($user_fname != NULL && $userName_check == 'true') {
//                                                            $fieldName = 'userNameLb';
//                                                            parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                ?>
                                                            <tr>
                                                                <td valign="middle" align="center" class="ff_calibri">
                                                                    <div class="spaceRight5" style="font-size:<?php echo $userNamefontsize; ?>px;">
                                                            <?php
                                                            if ($user_fname != 'EBILL') {
                                                                //
                                                                if ($user_lname != '' || $user_father_name != '')
                                                                    echo '<b>' . om_strtoupper($user_fname . ' ' . $user_lname) . '</b>';
                                                                else
                                                                    echo '<b>' . om_strtoupper($user_fname) . '</b>';
                                                            }
                                                            ?>
                                                                    </div>
                                                                </td> 
                                                            </tr> <?php } ?> 
                                                                    <?php
                                                                    $fLetter = $user_father_name[0];
                                                                    if ($fLetter == 'S' || $fLetter == 'F') {
//                                                            $fieldName = 'userSo';
//                                                            parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                        $fatherNamefontsize = $userSo_size;
                                                                        if ($user_father_name != '' && $userSo_check == 'true') {
//                                                                $fieldName = 'userSoLb';
//                                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                            ?>
                                                                <tr >
                                                                    <td valign="middle" align="center" class="ff_calibri" style="border:0px solid;font-size:<?php echo $fatherNamefontsize; ?>px;">
                                                                        <div   class="spaceRight5"><?php echo om_strtoupper(substr($user_father_name, 1)); ?>
                                                                        </div>
                                                                    </td> 
                                                                </tr>
                                                                <?php
                                                            }
                                                        }
                                                        ?>
                                                        <!--END SON OF-->
                                                        <!--START DAUGHTER OF-->
                                                        <?php
                                                        $fLetter = $user_father_name[0];
                                                        if ($fLetter == 'D') {
//                                                            $fieldName = 'userDo';
//
//                                                            parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                            $fatherNamefontsize = $userDo_size;
                                                            if ($user_fname != NULL && $userDo_check == 'true') {
//                                                                $fieldName = 'userDoLb';
//                                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                ?>
                                                                <tr>



                                                                    <td valign="middle" align="center" class="ff_calibri" style="font-size:<?php echo $fatherNamefontsize; ?>px;">
                                                                        <div   class="spaceRight5"><?php echo om_strtoupper(substr($user_father_name, 1)); ?>
                                                                        </div>
                                                                    </td> 
                                                                </tr>
                <?php
            }
        }
        ?>
                                                        <!--END DAUGHTER OF-->
                                                        <!--START WIFE OF-->
                                                        <?php
                                                        $fLetter = $user_father_name[0];
                                                        if ($fLetter == 'W') {
//                                                            $fieldName = 'userWo';
//
//                                                            parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                            $fatherNamefontsize = $userWo_size;
                                                            if ($user_fname != NULL && $userWo_check == 'true') {
//                                                                $fieldName = 'userWoLb';
//                                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                ?>
                                                                <tr>



                                                                    <td valign="middle" align="left" class="ff_calibri" style="font-size:<?php echo $fatherNamefontsize; ?>px;">
                                                                        <div class="spaceRight5"><?php echo om_strtoupper(substr($user_father_name, 1)); ?>
                                                                        </div>
                                                                    </td> 
                                                                </tr>
                <?php
            }
        }
        ?>
                                                        <!--END WIFE OF-->
                                                        <!--START GUARDIAN OF-->
                                                        <?php
                                                        $fLetter = $user_father_name[0];
                                                        if ($fLetter == 'C') {
//                                                            $fieldName = 'userCo';
//                                                            parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                            $fatherNamefontsize = $userCo_size;
                                                            if ($user_fname != NULL && $userCo_check == 'true') {
//                                                                $fieldName = 'userCoLb';
//                                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                ?>
                                                                <tr>



                                                                    <td valign="middle" align="center" class="ff_calibri" style="font-size:<?php echo $fatherNamefontsize; ?>px;">
                                                                        <div class="spaceRight5"><?php echo om_strtoupper(substr($user_father_name, 1)); ?>
                                                                        </div>
                                                                    </td> 
                                                                </tr>
                <?php
            }
        }
        ?>
        <?php
//                                                        $fieldName = 'userAddress';
//                                                        parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        $addresssize = $userAddress_size;
        if ($userAddress_check == 'true') {
//                                                            $fieldName = 'userAddressLb';
//                                                            parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
            ?>
                                                            <tr>



                                                                <td valign="middle" align="center" class="ff_calibri" style="border:0px solid;">


            <?php if ($user_add != '') { ?>                    
                                                                        <div title="<?php echo om_strtoupper($user_add); ?>" style="border:0px solid;width:250px;">
                <?php
//                                                                            $fieldName = 'userAddress';
//                                                                            parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                ?> 
                                                                            <div class="ff_calibri font_color_<?php echo $userAddress_color; ?>" style="font-size:<?php echo $userAddress_size; ?>px" onClick="this.contentEditable = 'true';">
                                                                        <?php echo om_strtoupper($user_add); ?>



                                                                        <?php } if ($user_city != '' || $user_village != '' || $user_pincode != '') { ?>

                                                                                <?php echo om_strtoupper($user_village . ',' . $user_city . ', ' . $user_pincode); ?>

            <?php } if ($user_state != '' || $user_country != '') { ?>
                <?php echo om_strtoupper($user_state . ', ' . $user_country); ?></span>
                                                                            <?php }
                                                                            ?>
                                                                        </div>
                                                                    </div>




                                                                </td>
                                                            </tr>
        <?php } ?>      
        <?php
//                                                        $fieldName = 'userContact';
//                                                        parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        $usercontact = $userContact_size;
        if ($user_mobile != NULL && $userContact_check == 'true') {
//                                                            $fieldName = 'userContactLb';
//                                                            parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
            ?>

                                                            <tr>


                                                                <td valign="middle" align="center"  class="ff_calibri" style="font-size:<?php echo $usercontact; ?>px;">
                                                                    <div class="spaceRight5"><span class="itemAddPnLabels12Arial font_color_<?php echo $userContactLb_color; ?>" style="font-size:<?php echo $userContactLb_size; ?>px"><?php echo $userContactLb_content; ?> :</span> <span><?php echo $user_mobile; ?></span>
                                                                    </div>
                                                                </td> 
                                                            </tr>
        <?php } ?>

        <?php
//                                                        $fieldName = 'userPan';
//                                                        parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        if ($user_pan_it_no != '' && $userPan_check == 'true') {
//                                                            $fieldName = 'userPanLb';
//                                                            parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
            ?>
                                                            <tr>
                                                                <td valign="middle" align="center"  class="ff_calibri">
                                                                    <div class="spaceRight5"><span class="itemAddPnLabels12Arial font_color_<?php echo $userPanLb_color; ?>" style="font-size:<?php echo $userPanLb_size; ?>px"><?php echo $userPanLb_content; ?> :</span>
                                                                        <span><?php echo $user_pan_it_no; ?></span>
                                                                    </div>
                                                                </td> 
                                                            </tr>
        <?php } ?>
        <?php
//                                                        $fieldName = 'userGstIn';
//                                                        parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        if ($user_cst_no != '' && $userGstIn_check == 'true') {
//                                                            $fieldName = 'userGstInLb';
//                                                            parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
            ?>
                                                            <tr>
                                                                <td valign="middle" align="center"  class="ff_calibri">
                                                                    <div class="spaceRight5"><span class="itemAddPnLabels12Arial font_color_<?php echo $userGstInLb_color; ?>" style="font-size:<?php echo $userGstInLb_size; ?>px"><?php echo $userGstInLb_content; ?>:</span>
                                                                        <span><?php echo $user_cst_no; ?></span>
                                                                    </div>
                                                                </td> 
                                                            </tr>
        <?php } ?>
        <?php
//                                                        $fieldName = 'userAdhaar';
//                                                        parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        if ($user_adhaar_card != '' && $userAdhaar_check == 'true') {
//                                                            $fieldName = 'userAdhaarLb';
//                                                            parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
            ?>

                                                            <tr>


                                                                <td valign="middle" align="center"  class="ff_calibri">
                                                                    <div class="spaceRight5"><span class="itemAddPnLabels12Arial font_color_<?php echo $userAdhaarLb_color; ?>" style="font-size:<?php echo $userAdhaarLb_size; ?>px"><?php echo $userAdhaarLb_content; ?>:</span>
                                                                        <span><?php echo $user_adhaar_card; ?></span>
                                                                    </div>
                                                                </td> 
                                                            </tr>
        <?php } ?>

                                                    </table>
                                                </td>


                                                    <?php } ?>
                                            <!--END FIRM DETAILS-->
    <?php
//**************************************************************************************************************************
//START CODE TO DISPLAY QR CODE IMAGE@RENUKA26JULY2022
//************************************************************************************************************************** 
    $utin_einvoice_signed_qrcode = '';
    $utin_tot_payable_amt = '';
    $utin_einvoice_act_no = '';
    $utin_einvoice_irn_no = '';
    $utin_eway_bill_no = '';
    $utin_eway_bill_date = '';
    $utin_eway_bill_validity = '';
    $utin_eway_bill_transid = '';
    $utin_eway_bill_transname = '';
    $utin_eway_bill_distance = '';
    $utin_eway_bill_transdocno = '';
    $utin_eway_bill_transdocDt = '';
    $utin_eway_bill_vehno = '';
    $utin_eway_bill_vehtype = '';
    $utin_eway_bill_transMode = '';
    $utin_einvoice_ack_date = '';
//                                            parse_str(getTableValues("SELECT utin_tot_payable_amt,utin_einvoice_signed_qrcode,utin_einvoice_irn_no,utin_einvoice_ack_no,utin_einvoice_ack_date,utin_eway_bill_no,utin_eway_bill_date,utin_eway_bill_validity,utin_eway_bill_transid , utin_eway_bill_transname, utin_eway_bill_distance, utin_eway_bill_transdocno, utin_eway_bill_transdocDt, utin_eway_bill_vehno, utin_eway_bill_vehtype, utin_eway_bill_transMode "
//                                                            . "FROM user_transaction_invoice where utin_owner_id = '$sessionOwnerId' and "
//                                                            . "utin_pre_invoice_no = '$slPrPreInvoiceNo' and utin_invoice_no = '$slPrInvoiceNo' $utin_date_str and "
//                                                            . "utin_type IN ('APPROVAL', 'stock','rawMetal','ItemReturn','XRF','imitation','strsilver','RetailStock','PurchaseReturn') "
//                                                            . "and utin_transaction_type IN ('sell','ESTIMATESELL','PURBYSUPP','ItemReturn','APPROVAL', 'PurchaseReturn') and "
//                                                            . "utin_user_id = '$userId' and utin_firm_id IN ($strFrmId)"));
    //
    $utin_tot_payable_amt = $getUserTransDetails['utin_tot_payable_amt'];
    // $utin_einvoice_signed_qrcode = $getUserTransDetails[0]['utin_einvoice_signed_qrcode'];
    $utin_einvoice_signed_qrcode        = getFirstNonEmpty($getUserTransDetails, 'utin_einvoice_signed_qrcode');

    $utin_einvoice_irn_no = $getUserTransDetails['utin_einvoice_irn_no'];
    $utin_einvoice_ack_no = $getUserTransDetails['utin_einvoice_ack_no'];
    $utin_einvoice_ack_date = $getUserTransDetails['utin_einvoice_ack_date'];
    $utin_eway_bill_no = $getUserTransDetails['utin_eway_bill_no'];
    $utin_eway_bill_date = $getUserTransDetails['utin_eway_bill_date'];
    $utin_eway_bill_validity = $getUserTransDetails['utin_eway_bill_validity'];
    $utin_eway_bill_transid = $getUserTransDetails['utin_eway_bill_transid'];
    $utin_eway_bill_transname = $getUserTransDetails['utin_eway_bill_transname'];
    $utin_eway_bill_distance = $getUserTransDetails['utin_eway_bill_distance'];
    $utin_eway_bill_transdocno = $getUserTransDetails['utin_eway_bill_transdocno'];
    $utin_eway_bill_transdocDt = $getUserTransDetails['utin_eway_bill_transdocDt'];
    $utin_eway_bill_vehno = $getUserTransDetails['utin_eway_bill_vehno'];
    $utin_eway_bill_vehtype = $getUserTransDetails['utin_eway_bill_vehtype'];
    $utin_eway_bill_transMode = $getUserTransDetails['utin_eway_bill_transMode'];

    //echo '$utin_einvoice_signed_qrcode : '.$utin_einvoice_signed_qrcode.'<br>';
    $documentRoots = $_SESSION['documentRoot'];
    if ($utin_einvoice_signed_qrcode != '' && $utin_einvoice_signed_qrcode != NULL) {
        $einvoiceQRPresent = 'YES';
        $path = 'phpqrcode/images/';
        $file = $path . uniqid() . "." . "png";
        QRcode::png($utin_einvoice_signed_qrcode, $file, 'H', 14, 5);
        //
    } else {
        $einvoiceQRPresent = 'NO';
    }
    //
    //echo '$einvoiceQRPresent : '.$einvoiceQRPresent.'<br>';
    //
    ?>
                                            <!--START RIGHT LOGO-->
                                            <?php if ($sttr_transaction_type == 'PURCHASE' || $sttr_transaction_type == 'PURBYSUPP' || $sttr_transaction_type == 'sell' || $sttr_transaction_type == 'ESTIMATESELL' || $sttr_transaction_type == 'MELTING' || $sttr_transaction_type == 'APPROVAL'|| $sttr_transaction_type == 'newOrder') { ?> <!--ADDED FIRM RIGHT LOGO ON PURCHASE INV @SIMRAN:09MAY2023-->
                                                <td align="right" valign="top" width="25%">
                                                    <table border="0" cellpadding="0" cellspacing="0" align="right" valign="top" width="100%">
                                                        <tr valign="top">
                                                <?php
                                                if ($einvoiceQRPresent == 'YES') {
                                                    ?>
                                                                <td align="right" valign="top" class="<?php if ($firmRightLogoCheck_noPrintCheck == 'true') { ?>
                                                                        noPrintHidden <?php } ?>">
                                                                    <img src="<?php echo $documentRoots . '/include/php/' . $file; ?>" 
                                                                         alt="" class="<?php echo $imageClass; ?>" />
                                                                </td>
                                                                <?php
                                                            } else {
//                                                                $fieldName = 'firmRightLogoCheck';
//                                                                $label_field_font_size = '';
//                                                                $label_field_font_color = '';
                                                                //echo '$firmRightLogoCheck_check===='.$firmRightLogoCheck_check;                                                                                                               parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                if (($firm_right_thumb_ftype != NULL || $firm_right_thumb_ftype != '') && $firmRightLogoCheck_check == 'true') {
                                                                    //
                                                                    $firmId = $firm_id;
                                                                    $noEcho = 'Y';
                                                                    include('omffgfri.php');
                                                                    $noEcho = '';
                                                                    ?>
                                                                    <td align="right" valign="top" class="<?php if ($firmRightLogoCheck_noPrintCheck == 'true') { ?>
                                                                            noPrintHidden <?php } ?>">
                                                                        <img src="<?php echo 'data:image/jpeg;base64,' . base64_encode($firmThumb); ?>" 
                                                                             alt="" class="<?php
                                                                    if ($logoImageActualSizeOnInvoice == 'YES') {
                                                                        echo '';
                                                                    } else {
                                                                        echo $imageClass;
                                                                    }
                                                                    ?>" />
                                                                    </td>
                                                                             <?php
                                                                         } else { //
                                                                             $firmId = $firm_id;
                                                                             $noEcho = 'Y';
                                                                             include('omffgfli.php');
                                                                             $noEcho = '';
                                                                             ?>
                                                                    <td align="right" valign="top" class="<?php if ($firmRightLogoCheck_noPrintCheck == 'true') { ?>
                                                                            noPrintHidden <?php } ?>">
                                                                        <img style="visibility: hidden;"  src="<?php echo 'data:image/jpeg;base64,' . base64_encode($firmThumb); ?>" 
                                                                             alt="" class="<?php
                                                                    if ($logoImageActualSizeOnInvoice == 'YES') {
                                                                        echo '';
                                                                    } else {
                                                                        echo $imageClass;
                                                                    }
                                                                    ?>" />
                                                                    </td>
                                                                             <?php
                                                                         }
                                                                     }
                                                                     ?>
                                                        </tr>
                                                    </table>
                                                </td>
                                                        <?php } else { ?>
                                                <!-- START WORK ON lEFT LOGO AUTHOR@SIMRAN18NOV2021-->
                                                <td align="right" valign="top">
                                                    <table border="0" cellpadding="0" cellspacing="0" align="right">
                                                        <tr valign="top">
        <?php
        //                                                 $fieldName = 'firmRightLogoCheck';
//                                                            parse_str(getTableValues("SELECT label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        if (($firm_left_thumb_ftype != NULL || $firm_left_thumb_ftype != '') && $firmRightLogoCheck_check == 'true') {
            ?>
                                                                <td align="left" valign="top">
                                                                    <img src="<?php echo $documentRootBSlash; ?>/include/php/omccguim.php?user_id=<?php echo $userId; ?>" 
                                                                         alt="" class="<?php
                                                                if ($logoImageActualSizeOnInvoice == 'YES') {
                                                                    echo '';
                                                                } else {
                                                                    echo $imageClass;
                                                                }
                                                                ?>" />
                                                                </td>
                                                                     <?php } else { ?>
                                                                <td align="right" valign="top">
                                                                    <img src="//<?php echo $documentRootBSlash; ?>/include/php/omffgfli.php?firm_id=<?php echo $firm_id; ?>" 
                                                                         alt="" class="<?php
                                                                         if ($logoImageActualSizeOnInvoice == 'YES') {
                                                                             echo '';
                                                                         } else {
                                                                             echo $imageClass;
                                                                         }
                                                                         ?>" style="display:none;"/>
                                                                </td>
                                                                     <?php } ?>
                                                        </tr>

                                                    </table>
                                                </td>
                                                <!-- END WORK ON lEFT LOGO AUTHOR@SIMRAN18NOV2021-->

                                                        <?php } ?>

                                            <!--END RIGHT LOGO-->
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                                        <?php } ?>
                        <!--END DEFAULT INVOICE LAYOUT-->

                        <!--START RIGHT INVOICE LAYOUT-->
<?php if ($custInvLay == 'InvLayRight' || $custInvLay == 'InvLayWoGst') { ?>
                            <tr>
                                <!--START FIRM DETAILS-->
                            <?php if ($sttr_transaction_type != 'PURCHASE') { ?>
                                    <td align="left">
                                        <table border="0" cellpadding="0" width="100%" cellspacing="0" align="left">
                                <?php
//                                            $fieldName = 'firmFormHeader';
//                                            $label_field_font_size = '';
//                                            $label_field_font_color = '';
//                                            parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                if ($firm_form_header != NULL && $firmFormHeader_check == 'true') {
                                    ?>
                                                <tr> 
                                                    <td valign="middle" align="left" class="ff_calibri font_color_<?php echo $firmFormHeader_color; ?>" style="font-size:<?php echo $firmFormHeader_size; ?>px"  onClick="this.contentEditable = 'true';">
                                                <?php echo ($firm_form_header); ?>
                                                    </td>
                                                </tr>
                                                <?php
                                            }
//                                            $fieldName = 'firmLongName';
//                                            $label_field_font_size = '';
//                                            $label_field_font_color = '';
//                                            parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                            if ($firm_long_name != NULL && $firmLongName_check == 'true') {
                                                ?>
                                                <tr> 
                                                    <td valign="middle" align="left" class="ff_calibri font_color_<?php echo $firmLongName_color; ?>" style="font-size:<?php echo $firmLongName_size; ?>px" onClick="this.contentEditable = 'true';">
                                                <?php echo"<b>" . ($firm_long_name) . "</b>"; ?>
                                                    </td>
                                                </tr>

                                                <?php
                                            }
//                                            $fieldName = 'firmDesc';
//                                            $label_field_font_size = '';
//                                            $label_field_font_color = '';
//                                            parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                            if ($firm_desc != NULL && $firmDesc_check == 'true') {
                                                ?>
                                                <tr> 
                                                    <td valign="middle" align="left"  class="ff_calibri font_color_<?php echo $firmDesc_color; ?>" style="font-size:<?php echo $firmDesc_size; ?>px" onClick="this.contentEditable = 'true';">
                                                <?php echo ($firm_desc); ?>
                                                    </td>
                                                </tr>
                                                <?php
                                            }
//                                            $fieldName = 'firmRegNo';
//                                            parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                            if ($firm_reg_no != NULL && $firmRegNo_check == 'true') {
                                                ?>
                                                <tr> 
                                                <?php
//                                                    $fieldName = 'firmRegNoLabel';
//                                                    $label_field_font_size = '';
//                                                    $label_field_font_color = '';
//                                                    parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                ?>
                                                    <td valign="middle" align="left"  class="ff_calibri font_color_<?php echo $firmRegNoLabel_color; ?>" style="font-size:<?php echo $firmRegNoLabel_size; ?>px" onClick="this.contentEditable = 'true';"><?php echo $firmRegNoLabel; ?>:
                                                    <?php
//                                                        $fieldName = 'firmRegNo';
//                                                        $label_field_font_size = '';
//                                                        $label_field_font_color = '';
//                                                        parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                    ?>
                                                        <span class="ff_calibri fw_n font_color_<?php echo $firmRegNo_color; ?>" style="font-size:<?php echo $firmRegNo_size; ?>px" ><?php echo ($firm_reg_no); ?></span>
                                                    </td>
                                                </tr>
                                                        <?php
                                                    }
//                                            // 123
//                                            $fieldName = 'firmAddress';
//                                            $label_field_font_size = '';
//                                            $label_field_font_color = '';
//                                            parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                    if ($firm_address != NULL && $firmAddress_check == 'true') {
                                                        ?>
                                                <tr> 
                                                    <td valign="middle" align="left"  class="ff_calibri font_color_<?php echo $firmAddress_color; ?>" style="font-size:<?php echo $firmAddress_size; ?>px" onClick="this.contentEditable = 'true';">
                                                <?php echo ($firm_address); ?>
                                                    </td>
                                                </tr>
                                            <?php } if ((($firm_phone_details != NULL) || $firm_email != NULL)) { ?>
                                                <tr>
                                                    <td colspan="2">
                                                        <table border="0" cellpadding="0" cellspacing="0" align="left">
                                                            <tr>
            <?php
//                                                                $fieldName = 'firmPhone';
//                                                                $label_field_font_size = '';
//                                                                $label_field_font_color = '';
//                                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
            if ($firm_phone_details != NULL && $firmPhone_check == 'true') {
                ?>

                                                                    <td valign="middle" align="left"  class="ff_calibri font_color_<?php echo $firmPhone_color; ?>" style="font-size:<?php echo $firmPhone_size; ?>px" onClick="this.contentEditable = 'true';">
                                                                    <?php echo $firmPhone_content; ?> : <?php echo $firm_phone_details; ?>
                                                                    </td>

                                                                    <?php
                                                                }
//                                                                $fieldName = 'firmEmail';
//                                                                $label_field_font_size = '';
//                                                                $label_field_font_color = '';
//                                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                if ($firm_email != NULL && $firmEmail_check == 'true') {
                                                                    ?>

                                                                    <td valign="middle" align="left"  class="ff_calibri font_color_<?php echo $firmEmail_color; ?> " style="font-size:<?php echo $firmEmail_size; ?>px" onClick="this.contentEditable = 'true';">
                                                                    <?php echo $firmEmail; ?> : <?php echo $firm_email; ?>
                                                                    </td>

                                                                <?php } ?>
                                                            </tr>
                                                        </table>
                                                    </td>
                                                </tr>
        <?php } ?>
                                                            <?php if ((($firm_tin_no != '') || $firm_pan_no != '')) { ?>
                                                                <?php
                                                                // 123
//                                                $fieldName = 'firmTin';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                if ($firm_tin_no != NULL && $firmTin_check == 'true') {
                                                                    ?>
                                                    <tr> 
                                                    <?php
//                                                        $fieldName = 'firmTinLb';
//                                                        $label_field_font_size = '';
//                                                        $label_field_font_color = '';
//                                                        parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                    ?>
                                                        <td valign="middle" align="left"  class="ff_calibri font_color_<?php echo $firmTinLb_color; ?>" style="font-size:<?php echo $firmTinLb_size; ?>px" onClick="this.contentEditable = 'true';">
                                                        <?php echo $firmTinLb_content; ?> :
                                                        <?php
//                                                            $fieldName = 'firmTin';
//                                                            $label_field_font_size = '';
//                                                            $label_field_font_color = '';
//                                                            parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                        ?>
                                                            <span class="ff_calibri fw_n font_color_<?php echo $firmTin_color; ?>" style="font-size:<?php echo $firmTin_size; ?>px" ><?php echo ($firm_tin_no); ?></span>
                                                        </td>
                                                    </tr>
                                                        <?php } ?>
                                                        <?php
//                                                $fieldName = 'firmPan';
//                                                parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                        if ($firm_pan_no != '' && $firmPan_check == 'true') {
                                                            ?>
                                                    <?php
//                                                    $fieldName = 'firmPanLb';
//                                                    $label_field_font_size = '';
//                                                    $label_field_font_color = '';
//                                                    parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                    ?>
                                                    <td align="left">
                                                        <div class="ff_calibri  font_color_<?php echo $firmPanLb_color; ?>" style="font-size:<?php echo $firmPanLb_size; ?>px" onClick="this.contentEditable = 'true';"><?php echo $firmPanLb_content; ?> :&nbsp;&nbsp;
                                                    <?php
//                                                            $fieldName = 'firmPan';
//                                                            parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                    ?>
                                                            <span class="ff_calibri fw_n font_color_<?php echo $firmPan_color; ?>" style="font-size:<?php echo $firmPan_size; ?>px"><?php echo $firm_pan_no; ?></span></div>  
                                                    </td>
                                                            <?php
                                                        }
                                                    }
                                                    ?>
                                        </table>
                                    </td>
                                        <?php } else { ?>
                                    <td align="left">
                                        <table border="0" cellpadding="0" width="100%" cellspacing="0" align="right">
                                            <?php
//                                            $fieldName = 'userName';
//                                            parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                            $userNamefontsize = $userName_size;
                                            if ($user_fname != NULL && $userName_check == 'true') {
//                                                $fieldName = 'userNameLb';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                ?>

                                                <tr>
                                                    <td valign="middle" align="left" class="ff_calibri">
                                                        <div class="spaceRight5" style="font-size:<?php echo $userNamefontsize; ?>px;">
                                                <?php
                                                if ($user_fname != 'EBILL') {
                                                    //
                                                    if ($user_lname != '' || $user_father_name != '')
                                                        echo '<b>' . om_strtoupper($user_fname . ' ' . $user_lname) . '</b>';
                                                    else
                                                        echo '<b>' . om_strtoupper($user_fname) . '</b>';
                                                }
                                                ?>
                                                        </div>
                                                    </td> 
                                                </tr> <?php } ?> 
                                                        <?php
                                                        $fLetter = $user_father_name[0];
                                                        if ($fLetter == 'S' || $fLetter == 'F') {
//                                                $fieldName = 'userSo';
//
//                                                parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                            $fatherNamefontsize = $userSo_size;
                                                            if ($user_father_name != '' && $userSo_check == 'true') {
//                                                    $fieldName = 'userSoLb';
//                                                    parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                ?>
                                                    <tr >


                                                        <td valign="middle" align="left" class="ff_calibri" style="border:0px solid;font-size:<?php echo $fatherNamefontsize; ?>px;">
                                                            <div   class="spaceRight5"><?php echo om_strtoupper(substr($user_father_name, 1)); ?>
                                                            </div>
                                                        </td> 
                                                    </tr>

                <?php
            }
        }
        ?>
                                            <!--END SON OF-->
                                            <!--START DAUGHTER OF-->
                                            <?php
                                            $fLetter = $user_father_name[0];
                                            if ($fLetter == 'D') {
//                                                $fieldName = 'userDo';
//
//                                                parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                $fatherNamefontsize = $userDo_size;
                                                if ($user_fname != NULL && $userDo_check == 'true') {
//                                                    $fieldName = 'userDoLb';
//                                                    parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                    ?>
                                                    <tr>



                                                        <td valign="middle" align="left" class="ff_calibri" style="font-size:<?php echo $fatherNamefontsize; ?>px;">
                                                            <div   class="spaceRight5"><?php echo om_strtoupper(substr($user_father_name, 1)); ?>
                                                            </div>
                                                        </td> 
                                                    </tr>
                <?php
            }
        }
        ?>
                                            <!--END DAUGHTER OF-->
                                            <!--START WIFE OF-->
                                            <?php
                                            $fLetter = $user_father_name[0];
                                            if ($fLetter == 'W') {
//                                                $fieldName = 'userWo';
//
//                                                parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                $fatherNamefontsize = $userWo_size;
                                                if ($user_fname != NULL && $userWo_check == 'true') {
//                                                    $fieldName = 'userWoLb';
//                                                    parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                    ?>
                                                    <tr>



                                                        <td valign="middle" align="left" class="ff_calibri" style="font-size:<?php echo $fatherNamefontsize; ?>px;">
                                                            <div class="spaceRight5"><?php echo om_strtoupper(substr($user_father_name, 1)); ?>
                                                            </div>
                                                        </td> 
                                                    </tr>
                <?php
            }
        }
        ?>
                                            <!--END WIFE OF-->
                                            <!--START GUARDIAN OF-->
                                            <?php
                                            $fLetter = $user_father_name[0];
                                            if ($fLetter == 'C') {
//                                                $fieldName = 'userCo';
//                                                parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                $fatherNamefontsize = $userCo_size;
                                                if ($user_fname != NULL && $userCo_check == 'true') {
//                                                    $fieldName = 'userCoLb';
//                                                    parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                    ?>
                                                    <tr>



                                                        <td valign="middle" align="left" class="ff_calibri" style="font-size:<?php echo $fatherNamefontsize; ?>px;">
                                                            <div class="spaceRight5"><?php echo om_strtoupper(substr($user_father_name, 1)); ?>
                                                            </div>
                                                        </td> 
                                                    </tr>
                <?php
            }
        }
        ?>
        <?php
//                                            $fieldName = 'userAddress';
//                                            parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        $addresssize = $userAddress_size;
        if ($userAddress_check == 'true') {
//                                                $fieldName = 'userAddressLb';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
            ?>
                                                <tr>



                                                    <td valign="middle" align="left" class="ff_calibri" style="border:0px solid;">


            <?php if ($user_add != '') { ?>                    
                                                            <div title="<?php echo om_strtoupper($user_add); ?>" style="border:0px solid;width:250px;">
                <?php
//                                                                $fieldName = 'userAddress';
//                                                                parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                ?> 
                                                                <div class="ff_calibri font_color_<?php echo $userAddress_color; ?>" style="font-size:<?php echo $userAddress_size; ?>px" onClick="this.contentEditable = 'true';">
                                                            <?php echo om_strtoupper($user_add); ?>



                                                            <?php } if ($user_city != '' || $user_pincode != '') { ?>

                                                                    <?php echo om_strtoupper($user_city . ', ' . $user_pincode); ?>

            <?php } if ($user_state != '' || $user_country != '') { ?>
                <?php echo om_strtoupper($user_state . ', ' . $user_country); ?></span>
                                                                <?php }
                                                                ?>
                                                            </div>
                                                        </div>




                                                    </td>
                                                </tr>
        <?php } ?>      
        <?php
//                                            $fieldName = 'userContact';
//                                            parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        $usercontactsize = $userContact_size;
        if ($user_mobile != NULL && $userContact_check == 'true') {
//                                                $fieldName = 'userContactLb';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
            ?>

                                                <tr>


                                                    <td valign="middle" align="left"  class="ff_calibri" style="font-size:<?php echo $usercontactsize; ?>px;">
                                                        <div class="spaceRight5"><span class="itemAddPnLabels12Arial font_color_<?php echo $userContact_color; ?>" style="font-size:<?php echo $userContact_size; ?>px"><?php echo $userContact; ?> :</span> <span><?php echo $user_mobile; ?></span>
                                                        </div>
                                                    </td> 
                                                </tr>
        <?php } ?>

        <?php
//                                            $fieldName = 'userPan';
//                                            parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        if ($user_pan_it_no != '' && $userPan_check == 'true') {
//                                                $fieldName = 'userPanLb';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
            ?>

                                                <tr>
                                                    <td valign="middle" align="left"  class="ff_calibri">
                                                        <div class="spaceRight5"><span class="itemAddPnLabels12Arial font_color_<?php echo $userPanLb_color; ?>" style="font-size:<?php echo $userPanLb_size; ?>px"><?php echo $userPanLb_content; ?> :</span>
                                                            <span><?php echo $user_pan_it_no; ?></span>
                                                        </div>
                                                    </td> 
                                                </tr>
        <?php } ?>

        <?php
//                                            $fieldName = 'userGstIn';
//                                            parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        if ($user_cst_no != '' && $userGstIn_check == 'true') {
//                                                $fieldName = 'userGstInLb';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
            ?>

                                                <tr>
                                                    <td valign="middle" align="left"  class="ff_calibri">
                                                        <div class="spaceRight5"><span class="itemAddPnLabels12Arial font_color_<?php echo $userGstInLb_color; ?>" style="font-size:<?php echo $userGstInLb_size; ?>px"><?php echo $userGstInLb_content; ?>:</span>
                                                            <span><?php echo $user_cst_no; ?></span>
                                                        </div>
                                                    </td> 
                                                </tr>
        <?php } ?>
        <?php
//                                            $fieldName = 'userAdhaar';
//                                            parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        if ($user_adhaar_card != '' && $userAdhaar_check == 'true') {
//                                                $fieldName = 'userAdhaarLb';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
            ?>

                                                <tr>


                                                    <td valign="middle" align="left"  class="ff_calibri">
                                                        <div class="spaceRight5"><span class="itemAddPnLabels12Arial font_color_<?php echo $userAdhaarLb_color; ?>" style="font-size:<?php echo $userAdhaarLb_size; ?>px"><?php echo $userAdhaarLb_content; ?>:</span>
                                                            <span><?php echo $user_adhaar_card; ?></span>
                                                        </div>
                                                    </td> 
                                                </tr>
        <?php } ?>


                                        </table>
                                    </td>


                                        <?php } ?>
                                <!--END FIRM DETAILS-->
                                <!--START INVOICE DETAILS-->

                                <!--END INVOICE DETAILS-->
                                <!--START DATE & LOGO DETAILS-->
                                <?php if ($sttr_transaction_type != 'PURCHASE') { ?>
                                    <td align="left" >
                                        <table border="0" cellpadding="0" cellspacing="0" align="left" >
                                            <tr valign="top">

        <?php
//                                                $fieldName = 'firmRightLogoCheck';
//                                                $label_field_font_size = '';
//                                                $label_field_font_color = '';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        if (($firm_right_thumb_ftype != NULL || $firm_right_thumb_ftype != '') && $firmRightLogoCheck_check == 'true') {
            ?>
                                                    <td align="right" >
                                                        <img style="height:100px;width:100px;" src="<?php echo $documentRootBSlash; ?>/include/php/omffgfri.php?firm_id=<?php echo $firm_id; ?>" 
                                                             alt="" class="<?php echo $imageClass; ?>" />
                                                    </td>
                                                <?php } ?>
                                            </tr>
                                        </table>
                                    </td>
    <?php } else {
        ?><td align="left" >
                                        <table border="0" cellpadding="0" cellspacing="0" align="left" >
                                            <tr valign="top">

        <?php
//                                                $fieldName = 'firmRightLogoCheck';
//                                                $label_field_font_size = '';
//                                                $label_field_font_color = '';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        if ($firmRightLogoCheck_check == 'true') {
            ?>
                                                    <td align="right" >
                                                        <img style="height:100px;width:100px;" src="<?php echo $documentRootBSlash; ?>/include/php/omccguim.php?user_id=<?php echo $userId; ?>"  
                                                             alt="" class="<?php echo $imageClass; ?>" />
                                                    </td>
                                                <?php } ?>
                                            </tr>
                                        </table>
                                    </td>  
    <?php }
    ?>
                                <!--END DATE & LOGO DETAILS-->
                            </tr>
<?php } ?>
                        <!--END RIGHT INVOICE LAYOUT-->


                        <!--START LEFT INVOICE LAYOUT-->
<?php if ($custInvLay == 'InvLayLeft') { ?>
                            <tr>
                                <!--START DATE & LOGO DETAILS-->
    <?php if ($sttr_transaction_type != 'PURCHASE') { ?>
                                    <td align="left">
                                        <table border="0" cellpadding="0" cellspacing="0" align="left"  style="margin-left:20px;">
                                            <tr >
                                <?php
//                                                $fieldName = 'firmRightLogoCheck';
//                                                $label_field_font_size = '';
//                                                $label_field_font_color = '';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                if (($firm_right_thumb_ftype != NULL || $firm_right_thumb_ftype != '') && $firmRightLogoCheck_check == 'true') {
                                    ?>
                                                    <td align="right" >
                                                        <img style="height:100px;width:100px;" src="<?php echo $documentRootBSlash; ?>/include/php/omffgfri.php?firm_id=<?php echo $firm_id; ?>" 
                                                             alt="" class="<?php echo $imageClass; ?>" />
                                                    </td>
                                                <?php } ?>
                                            </tr>
                                        </table>
                                    </td>
    <?php } else { ?>
                                    <td align="left">
                                        <table border="0" cellpadding="0" cellspacing="0" align="left"  style="margin-left:20px;">
                                            <tr >
        <?php
//                                                $fieldName = 'firmRightLogoCheck';
//                                                $label_field_font_size = '';
//                                                $label_field_font_color = '';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        if (($firm_right_thumb_ftype != NULL || $firm_right_thumb_ftype != '') && $firmRightLogoCheck_check == 'true') {
            ?>
                                                    <td align="right" >
                                                        <img style="height:100px;width:100px;" src="<?php echo $documentRootBSlash; ?>/include/php/omccguim.php?user_id=<?php echo $userId; ?>" 
                                                             alt="" class="<?php echo $imageClass; ?>" />
                                                    </td>
                                                <?php } ?>
                                            </tr>
                                        </table>
                                    </td>

    <?php } ?>
                                <!--END DATE & LOGO DETAILS-->

                                <!--START INVOICE DETAILS-->

                                <!--END INVOICE DETAILS-->
                                <!--START FIRM DETAILS-->
                                <?php if ($sttr_transaction_type != 'PURCHASE') { ?>
                                    <td align="left">
                                        <table border="0" cellpadding="0" width="100%" cellspacing="0" align="left">
        <?php
//                                            $fieldName = 'firmFormHeader';
//                                            $label_field_font_size = '';
//                                            $label_field_font_color = '';
//                                            parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        if ($firm_form_header != NULL && $firmFormHeader_check == 'true') {
            ?>
                                                <tr> 
                                                    <td valign="middle" align="center" class="ff_calibri font_color_<?php echo $firmFormHeader_color; ?>" style="font-size:<?php echo $firmFormHeader_size; ?>px"  onClick="this.contentEditable = 'true';">
                                                <?php echo ($firm_form_header); ?>
                                                    </td>
                                                </tr>
                                                <?php
                                            }
//                                            $fieldName = 'firmLongName';
//                                            $label_field_font_size = '';
//                                            $label_field_font_color = '';
//                                            parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                            if ($firm_long_name != NULL && $firmLongName_check == 'true') {
                                                ?>
                                                <tr> 
                                                    <td valign="middle" align="center" class="ff_calibri font_color_<?php echo $firmLongName_color; ?>" style="font-size:<?php echo $firmLongName_size; ?>px" onClick="this.contentEditable = 'true';">
                                                <?php echo ($firm_long_name); ?>
                                                    </td>
                                                </tr>

                                                <?php
                                            }
//                                            $fieldName = 'firmDesc';
//                                            $label_field_font_size = '';
//                                            $label_field_font_color = '';
//                                            parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                            if ($firm_desc != NULL && $firmDesc_check == 'true') {
                                                ?>
                                                <tr> 
                                                    <td valign="middle" align="center"  class="ff_calibri font_color_<?php echo $firmDesc_color; ?>" style="font-size:<?php echo $firmDesc_size; ?>px" onClick="this.contentEditable = 'true';">
                                                <?php echo ($firm_desc); ?>
                                                    </td>
                                                </tr>
                                                <?php
                                            }
//                                            $fieldName = 'firmRegNo';
//                                            parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                            if ($firm_reg_no != NULL && $firmRegNo_check == 'true') {
                                                ?>
                                                <tr> 
                                                <?php
//                                                    $fieldName = 'firmRegNoLabel';
//                                                    $label_field_font_size = '';
//                                                    $label_field_font_color = '';
//                                                    parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                ?>
                                                    <td valign="middle" align="center"  class="ff_calibri font_color_<?php echo $firmRegNoLabel_color; ?>" style="font-size:<?php echo $firmRegNoLabel_size; ?>px" onClick="this.contentEditable = 'true';"><?php echo $firmRegNoLabel; ?>:
                                                    <?php
//                                                        $fieldName = 'firmRegNo';
//                                                        $label_field_font_size = '';
//                                                        $label_field_font_color = '';
//                                                        parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                    ?>
                                                        <span class="ff_calibri fw_n font_color_<?php echo $firmRegNo_color; ?>" style="font-size:<?php echo $firmRegNo_size; ?>px" ><?php echo ($firm_reg_no); ?></span>
                                                    </td>
                                                </tr>
                                                        <?php
                                                    }
                                                    // 123
//                                            $fieldName = 'firmAddress';
//                                            $label_field_font_size = '';
//                                            $label_field_font_color = '';
//                                            parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                    if ($firm_address != NULL && $firmAddress_check == 'true') {
                                                        ?>
                                                <tr> 
                                                    <td valign="middle" align="center"  class="ff_calibri font_color_<?php echo $firmAddress_color; ?>" style="font-size:<?php echo $firmAddress_size; ?>px" onClick="this.contentEditable = 'true';">
                                                <?php echo ($firm_address); ?>
                                                    </td>
                                                </tr>
                                            <?php } if ((($firm_phone_details != NULL) || $firm_email != NULL)) { ?>
                                                <tr>
                                                    <td colspan="2">
                                                        <table border="0" cellpadding="0" cellspacing="4" align="center">
                                                            <tr>
            <?php
//                                                                $fieldName = 'firmPhone';
//                                                                $label_field_font_size = '';
//                                                                $label_field_font_color = '';
//                                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
            if ($firm_phone_details != NULL && $firmPhone_check == 'true') {
                ?>

                                                                    <td valign="middle" align="left"  class="ff_calibri font_color_<?php echo $firmPhone_color; ?>" style="font-size:<?php echo $firmPhone_size; ?>px" onClick="this.contentEditable = 'true';">
                                                                    <?php echo $firmPhone_content; ?> : <?php echo $firm_phone_details; ?>
                                                                    </td>



                <?php
            }
//                                                                $fieldName = 'firmEmail';
//                                                                $label_field_font_size = '';
//                                                                $label_field_font_color = '';
//                                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
            if ($firm_email != NULL && $firmEmail_check == 'true') {
                ?>

                                                                    <td valign="middle" align="center"  class="ff_calibri font_color_<?php echo $firmEmail_color; ?> " style="margin-left:5px;font-size:<?php echo $firmEmail_size; ?>px" onClick="this.contentEditable = 'true';">
                                                                    <?php echo"  " . $firmEmail; ?> : <?php echo $firm_email; ?>
                                                                    </td>

                                                                <?php } ?>
                                                            </tr>
                                                        </table>
                                                    </td>
                                                </tr>
        <?php } ?>
                                                            <?php if ((($firm_tin_no != '') || $firm_pan_no != '')) { ?>
                                                                <?php
                                                                // 123
//                                                $fieldName = 'firmTin';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                if ($firm_tin_no != NULL && $firmTin_check == 'true') {
                                                                    ?>
                                                    <tr> 
                                                    <?php
//                                                        $fieldName = 'firmTinLb';
//                                                        $label_field_font_size = '';
//                                                        $label_field_font_color = '';
//                                                        parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                    ?>
                                                        <td valign="middle" align="center"  class="ff_calibri font_color_<?php echo $firmTinLb_color; ?>" style="font-size:<?php echo $firmTinLb_size; ?>px" onClick="this.contentEditable = 'true';">
                                                        <?php echo $firmTinLb_content; ?> :
                                                        <?php
//                                                            $fieldName = 'firmTin';
//                                                            $label_field_font_size = '';
//                                                            $label_field_font_color = '';
//                                                            parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                        ?>
                                                            <span class="ff_calibri fw_n font_color_<?php echo $firmTin_color; ?>" style="font-size:<?php echo $firmTin_size; ?>px" ><?php echo ($firm_tin_no); ?></span>
                                                        </td>
                                                    </tr>
                                                        <?php } ?>
                                                        <?php
//                                                $fieldName = 'firmPan';
//                                                parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                        if ($firm_pan_no != '' && $firmPan_check == 'true') {
                                                            ?>
                                                    <?php
//                                                    $fieldName = 'firmPanLb';
//                                                    $label_field_font_size = '';
//                                                    $label_field_font_color = '';
//                                                    parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                    ?>
                                                    <td align="center">
                                                        <div class="ff_calibri  font_color_<?php echo $firmPanLb_color; ?>" style="font-size:<?php echo $firmPanLb_size; ?>px" onClick="this.contentEditable = 'true';">
                                                    <?php echo 'PAN '; ?> :&nbsp;&nbsp;
                                                    <?php
//                                                            $fieldName = 'firmPan';
//                                                            parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                    ?>
                                                            <span class="ff_calibri fw_n font_color_<?php echo $firmPan_color; ?>" style="font-size:<?php echo $firmPan_size; ?>px"><?php echo $firm_pan_no; ?></span></div>  
                                                    </td>
                                                            <?php
                                                        }
                                                    }
                                                    ?>
                                        </table>
                                    </td>
                                        <?php } else { ?>
                                    <td align="left">
                                        <table border="0" cellpadding="0" width="100%" cellspacing="0" align="right">
                                            <?php
//                                            $fieldName = 'userName';
//                                            parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                            $userNamefontsize = $userName_size;
                                            if ($user_fname != NULL && $userName_check == 'true') {
//                                                $fieldName = 'userNameLb';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                ?>

                                                <tr>
                                                    <td valign="middle" align="center" class="ff_calibri">
                                                        <div class="spaceRight5" style="font-size:<?php echo $userNamefontsize; ?>px;">
                                                <?php
                                                if ($user_fname != 'EBILL') {
                                                    //
                                                    if ($user_lname != '' || $user_father_name != '')
                                                        echo '<b>' . om_strtoupper($user_fname . ' ' . $user_lname) . '</b>';
                                                    else
                                                        echo '<b>' . om_strtoupper($user_fname) . '</b>';
                                                }
                                                ?>
                                                        </div>
                                                    </td> 
                                                </tr> <?php } ?> 
                                                        <?php
                                                        $fLetter = $user_father_name[0];
                                                        if ($fLetter == 'S' || $fLetter == 'F') {
//                                                $fieldName = 'userSo';
//
//                                                parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                            $fatherNamefontsize = $userSo_size;
                                                            if ($user_father_name != '' && $userSo_check == 'true') {
//                                                    $fieldName = 'userSoLb';
//                                                    parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                ?>
                                                    <tr >


                                                        <td valign="middle" align="center" class="ff_calibri" style="border:0px solid;font-size:<?php echo $fatherNamefontsize; ?>px;">
                                                            <div   class="spaceRight5"><?php echo om_strtoupper(substr($user_father_name, 1)); ?>
                                                            </div>
                                                        </td> 
                                                    </tr>

                <?php
            }
        }
        ?>
                                            <!--END SON OF-->
                                            <!--START DAUGHTER OF-->
                                            <?php
                                            $fLetter = $user_father_name[0];
                                            if ($fLetter == 'D') {
//                                                $fieldName = 'userDo';
//
//                                                parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                $fatherNamefontsize = $userDo_size;
                                                if ($user_fname != NULL && $userDo_check == 'true') {
//                                                    $fieldName = 'userDoLb';
//                                                    parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                    ?>
                                                    <tr>



                                                        <td valign="middle" align="center" class="ff_calibri" style="font-size:<?php echo $fatherNamefontsize; ?>px;">
                                                            <div   class="spaceRight5"><?php echo om_strtoupper(substr($user_father_name, 1)); ?>
                                                            </div>
                                                        </td> 
                                                    </tr>
                <?php
            }
        }
        ?>
                                            <!--END DAUGHTER OF-->
                                            <!--START WIFE OF-->
                                            <?php
                                            $fLetter = $user_father_name[0];
                                            if ($fLetter == 'W') {
//                                                $fieldName = 'userWo';
//
//                                                parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                $fatherNamefontsize = $userWo_size;
                                                if ($user_fname != NULL && $userWo_check == 'true') {
//                                                    $fieldName = 'userWoLb';
//                                                    parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                    ?>
                                                    <tr>



                                                        <td valign="middle" align="center" class="ff_calibri" style="font-size:<?php echo $fatherNamefontsize; ?>px;">
                                                            <div class="spaceRight5"><?php echo om_strtoupper(substr($user_father_name, 1)); ?>
                                                            </div>
                                                        </td> 
                                                    </tr>
                <?php
            }
        }
        ?>
                                            <!--END WIFE OF-->
                                            <!--START GUARDIAN OF-->
                                            <?php
                                            $fLetter = $user_father_name[0];
                                            if ($fLetter == 'C') {
//                                                $fieldName = 'userCo';
//                                                parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                $fatherNamefontsize = $luserCo_size;
                                                if ($user_fname != NULL && $userCo_check == 'true') {
//                                                    $fieldName = 'userCoLb';
//                                                    parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                    ?>
                                                    <tr>



                                                        <td valign="middle" align="center" class="ff_calibri" style="font-size:<?php echo $fatherNamefontsize; ?>px;">
                                                            <div class="spaceRight5"><?php echo om_strtoupper(substr($user_father_name, 1)); ?>
                                                            </div>
                                                        </td> 
                                                    </tr>
                <?php
            }
        }
        ?>
        <?php
//                                            $fieldName = 'userAddress';
//                                            parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        $addresssize = $userAddress_size;
        if ($userAddress_check == 'true') {
//                                                $fieldName = 'userAddressLb';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
            ?>
                                                <tr>



                                                    <td valign="middle" align="center" class="ff_calibri" style="border:0px solid;">


            <?php if ($user_add != '') { ?>                    
                                                            <div title="<?php echo om_strtoupper($user_add); ?>" style="border:0px solid;width:250px;">
                <?php
//                                                                $fieldName = 'userAddress';
//                                                                parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                ?> 
                                                                <div class="ff_calibri font_color_<?php echo $userAddress_color; ?>" style="font-size:<?php echo $luserAddress_size; ?>px" onClick="this.contentEditable = 'true';">
                                                            <?php echo om_strtoupper($user_add); ?>



                                                            <?php } if ($user_city != '' || $user_pincode != '') { ?>

                                                                    <?php echo om_strtoupper($user_city . ', ' . $user_pincode); ?>

            <?php } if ($user_state != '' || $user_country != '') { ?>
                <?php echo om_strtoupper($user_state . ', ' . $user_country); ?></span>
                                                                <?php }
                                                                ?>
                                                            </div>
                                                        </div>




                                                    </td>
                                                </tr>
        <?php } ?>      
        <?php
//                                            $fieldName = 'userContact';
//                                            parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        $usercontactsize = $userContact_size;
        if ($user_mobile != NULL && $userContact_check == 'true') {
//                                                $fieldName = 'userContactLb';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
            ?>

                                                <tr>


                                                    <td valign="middle" align="center"  class="ff_calibri" style="font-size:<?php echo $usercontactsize; ?>px;">
                                                        <div class="spaceRight5"><span class="itemAddPnLabels12Arial font_color_<?php echo $userContactLb_color; ?>" style="font-size:<?php echo $userContactLb_size; ?>px"><?php echo $userContactLb_content; ?> :</span> <span><?php echo $user_mobile; ?></span>
                                                        </div>
                                                    </td> 
                                                </tr>
        <?php } ?>

        <?php
//                                            $fieldName = 'userPan';
//                                            parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        if ($user_pan_it_no != '' && $userPan_check == 'true') {
//                                                $fieldName = 'userPanLb';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
            ?>

                                                <tr>
                                                    <td valign="middle" align="center"  class="ff_calibri">
                                                        <div class="spaceRight5"><span class="itemAddPnLabels12Arial font_color_<?php echo $userPanLb_color; ?>" style="font-size:<?php echo $userPanLb_size; ?>px"><?php echo $userPanLb_content; ?> :</span>
                                                            <span><?php echo $user_pan_it_no; ?></span>
                                                        </div>
                                                    </td> 
                                                </tr>
        <?php } ?>

        <?php
//                                            $fieldName = 'userGstIn';
//                                            parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        if ($user_cst_no != '' && $userGstIn_check == 'true') {
//                                                $fieldName = 'userGstInLb';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
            ?>

                                                <tr>
                                                    <td valign="middle" align="center"  class="ff_calibri">
                                                        <div class="spaceRight5"><span class="itemAddPnLabels12Arial font_color_<?php echo $userGstInLb_color; ?>" style="font-size:<?php echo $userGstInLb_size; ?>px"><?php echo $userGstInLb_content; ?>:</span>
                                                            <span><?php echo $user_cst_no; ?></span>
                                                        </div>
                                                    </td> 
                                                </tr>
        <?php } ?>
        <?php
//                                            $fieldName = 'userAdhaar';
//                                            parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        if ($user_adhaar_card != '' && $userAdhaar_check == 'true') {
//                                                $fieldName = 'userAdhaarLb';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
            ?>

                                                <tr>


                                                    <td valign="middle" align="center"  class="ff_calibri">
                                                        <div class="spaceRight5"><span class="itemAddPnLabels12Arial font_color_<?php echo $userAdhaarLb_color; ?>" style="font-size:<?php echo $userAdhaarLb_size; ?>px"><?php echo $userAdhaarLb_content; ?>:</span>
                                                            <span><?php echo $user_adhaar_card; ?></span>
                                                        </div>
                                                    </td> 
                                                </tr>
        <?php } ?>

                                        </table>
                                    </td>

    <?php } ?>
                            </tr>
                                    <?php } ?>
                        <!--END FIRM DETAILS-->
                        <!--END LFET INVOICE LAYOUT-->

                        <!--START CENTER INVOICE LAYOUT-->
                            <?php if ($custInvLay == 'InvLayCenter') { ?>
                            <tr>
                                <!--START FIRM DETAILS-->
    <?php if ($sttr_transaction_type != 'PURCHASE') { ?>
                                    <td align="center">
                                        <table border="0" cellpadding="0" width="100%" cellspacing="0" align="center">
                                <?php
                                if ($sttr_transaction_type != 'PURCHASE') {
//                                                $fieldName = 'firmRightLogoCheck';
//                                                $label_field_font_size = '';
//                                                $label_field_font_color = '';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                    if (($firm_right_thumb_ftype != NULL || $firm_right_thumb_ftype != '') && $firmRightLogoCheck_check == 'true') {
                                        ?>
                                                    <td align="center" valign="top">
                                                        <img src="<?php echo $documentRootBSlash; ?>/include/php/omffgfri.php?firm_id=<?php echo $firm_id; ?>" 
                                                             alt="" class="<?php echo $imageClass; ?>" />
                                                    </td>
                                                    <?php
                                                }
                                            } else {
//                                                $fieldName = 'firmRightLogoCheck';
//                                                $label_field_font_size = '';
//                                                $label_field_font_color = '';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                if ($firmRightLogoCheck_check == 'true') {
                                                    ?>
                                                    <td align="center" valign="top">
                                                        <img src="<?php echo $documentRootBSlash; ?>/include/php/omffgfri.php?omccguim.php?user_id=<?php echo $userId; ?>" 
                                                             alt="" class="<?php echo $imageClass; ?>" />
                                                    </td>
                                                    <?php
                                                }
                                            }
                                            ?>

        <?php
//                                            $fieldName = 'firmFormHeader';
//                                            $label_field_font_size = '';
//                                            $label_field_font_color = '';
//                                            parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        if ($firm_form_header != NULL && $firmFormHeader_check == 'true') {
            ?>
                                                <tr> 
                                                    <td valign="middle" align="center" class="ff_calibri font_color_<?php echo $firmFormHeader_color; ?>" style="font-size:<?php echo $firmFormHeader_size; ?>px"  onClick="this.contentEditable = 'true';">
                                                <?php echo ($firm_form_header); ?>
                                                    </td>
                                                </tr>

                                                <?php
                                            }
//                                            $fieldName = 'firmLongName';
//                                            $label_field_font_size = '';
//                                            $label_field_font_color = '';
//                                            parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                            if ($firm_long_name != NULL && $firmLongName_check == 'true') {
                                                ?>
                                                <tr> 
                                                    <td valign="middle" align="center" class="ff_calibri font_color_<?php echo $firmLongName_color; ?>" style="font-size:<?php echo $firmLongName_size; ?>px" onClick="this.contentEditable = 'true';">
                                                <?php echo ($firm_long_name); ?>
                                                    </td>
                                                </tr>

                                                <?php
                                            }
//                                            $fieldName = 'firmDesc';
//                                            $label_field_font_size = '';
//                                            $label_field_font_color = '';
//                                            parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                            if ($firm_desc != NULL && $firmDesc_check == 'true') {
                                                ?>
                                                <tr> 
                                                    <td valign="middle" align="center"  class="ff_calibri font_color_<?php echo $firmDesc_color; ?>" style="font-size:<?php echo $firmDesc_size; ?>px" onClick="this.contentEditable = 'true';">
                                                <?php echo($firm_desc); ?>
                                                    </td>
                                                </tr>
                                                <?php
                                            }
//                                            $fieldName = 'firmRegNo';
//                                            parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                            if ($firm_reg_no != NULL && $firmRegNo_check == 'true') {
                                                ?>
                                                <tr> 
                                                <?php
//                                                    $fieldName = 'firmRegNoLabel';
//                                                    $label_field_font_size = '';
//                                                    $label_field_font_color = '';
//                                                    parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                ?>
                                                    <td valign="middle" align="center"  class="ff_calibri font_color_<?php echo $firmRegNoLabel_color; ?>" style="font-size:<?php echo $firmRegNoLabel_size; ?>px" onClick="this.contentEditable = 'true';"><?php echo "Firm Reg.No"; ?>:
                                                    <?php
//                                                        $fieldName = 'firmRegNo';
//                                                        $label_field_font_size = '';
//                                                        $label_field_font_color = '';
//                                                        parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                    ?>
                                                        <span class="ff_calibri font_color_<?php echo $firmRegNo_color; ?>" style="font-size:<?php echo $firmRegNo_size; ?>px" ><?php echo ($firm_reg_no); ?></span>
                                                    </td>
                                                </tr>
                                                        <?php
                                                    }

//                                            $fieldName = 'firmAddress';
//                                            $label_field_font_size = '';
//                                            $label_field_font_color = '';
//                                            parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                    if ($firm_address != NULL && $firmAddress_check == 'true') {
                                                        ?>
                                                <tr> 
                                                    <td valign="middle" align="center"  class="ff_calibri font_color_<?php echo $firmAddress_color; ?>" style="font-size:<?php echo $firmAddress_size; ?>px" onClick="this.contentEditable = 'true';">
                                                <?php echo ($firm_address); ?>
                                                    </td>
                                                </tr>
                                            <?php } if ((($firm_phone_details != NULL) || $firm_email != NULL)) { ?>
                                                <tr>
                                                    <td colspan="2">
                                                        <table border="0" cellpadding="0" cellspacing="0" align="center">
                                                        <?php
//                                                            $fieldName = 'firmPhone';
//                                                            $label_field_font_size = '';
//                                                            $label_field_font_color = '';
//                                                            parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                        if ($firm_phone_details != NULL && $firmPhone_check == 'true') {
                                                            ?>
                                                                <tr>
                                                                    <td valign="middle" align="center"  class="ff_calibri font_color_<?php echo $firmPhone_color; ?>" style="font-size:<?php echo $firmPhone_size; ?>px" onClick="this.contentEditable = 'true';">
                                                                <?php echo $firmPhone_content; ?> : <?php echo $firm_phone_details; ?>
                                                                    </td>
                                                                </tr>
                                                                <?php
                                                            }
//                                                            $fieldName = 'firmEmail';
//                                                            $label_field_font_size = '';
//                                                            $label_field_font_color = '';
//                                                            parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                            if ($firm_email != NULL && $firmEmail_check == 'true') {
                                                                ?>
                                                                <tr>
                                                                    <td valign="middle" align="center"  class="ff_calibri font_color_<?php echo $firmEmail_color; ?> " style="font-size:<?php echo $firmEmail_size; ?>px" onClick="this.contentEditable = 'true';">
                                                                <?php echo $firmEmail; ?> : <?php echo $firm_email; ?>
                                                                    </td>
                                                                </tr>
                                                            <?php } ?>
                                                        </table>
                                                    </td>
                                                </tr>
                                                <!-- START CODE TO ADD GST AND PAN AT CUSTOMIZATION AT INVOICE @AUTHOR:RUTUJA-15FEB2021 -->
        <?php } if ((($firm_tin_no != '') || $firm_pan_no != '')) {
            ?>
                                                            <?php
                                                            // 1234
//                                                $fieldName = 'firmTinTop';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                            if ($firm_tin_no != NULL && $firmTinTop_check == 'true') {
                                                                ?>
                                                    <tr> 
                                                    <?php
//                                                        $fieldName = 'firmTinTopLb';
//                                                        $label_field_font_size = '';
//                                                        $label_field_font_color = '';
//                                                        parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                    ?>

                                                        <td valign="middle" align="center"  class="ff_calibri font_color_<?php echo $lfirmTinTopLb_color; ?>" style="font-size:<?php echo $firmTinTopLb_size; ?>px" onClick="this.contentEditable = 'true';"><?php echo $firmTinTopLb_content; ?> :
                                                        <?php
//                                                            $fieldName = 'firmTinTop';
//                                                            $label_field_font_size = '';
//                                                            $label_field_font_color = '';
//                                                            parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                        ?>
                                                            <span class="ff_calibri font_color_<?php echo $firmTinTop_color; ?>" style="font-size:<?php echo $firmTinTop_size; ?>px" ><?php echo ($firm_tin_no); ?></span>
                                                        </td>
                                                    </tr>

                                                        <?php } ?>

                                                        <?php
//                                                $fieldName = 'firmPanTop';
//                                                parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                        if ($firm_pan_no != '' && $firmPanTop_check == 'true') {
                                                            ?>
                                                    <?php
//                                                    $fieldName = 'firmPanTopLb';
//                                                    $label_field_font_size = '';
//                                                    $label_field_font_color = '';
//                                                    parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                    ?>
                                                    <td align="center">
                                                        <div class="ff_calibri  font_color_black" style="font-size:<?php echo $firmPanTopLb_size; ?>px" onClick="this.contentEditable = 'true';"><?php echo $firmPanTopLb_content; ?> :&nbsp;&nbsp;
                                                    <?php
//                                                            $fieldName = 'firmPanTop';
//                                                            parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                    ?>
                                                            <span class="ff_calibri font_color_<?php echo $firmPanTop_color; ?>" style="font-size:<?php echo $firmPanTop_size; ?>px"><?php echo $firm_pan_no; ?></span></div>  
                                                    </td>
                                                        <?php } ?>
                                                    <?php } ?>
                                            <!-- END CODE TO ADD GST AND PAN AT CUSTOMIZATION AT INVOICE @AUTHOR:RUTUJA-15FEB2021 -->

                                        </table>
                                    </td>
                                        <?php } else {
                                            ?>
                                    <td align="center">
                                        <table border="0" cellpadding="0" width="100%" cellspacing="0" align="center">
        <?php
//                                            $fieldName = 'firmRightLogoCheck';
//                                            $label_field_font_size = '';
//                                            $label_field_font_color = '';
//                                            parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        if (($firm_right_thumb_ftype != NULL || $firm_right_thumb_ftype != '') && $firmRightLogoCheck_check == 'true') {
            ?>
                                                <td align="center" valign="top">
                                                    <img src="<?php echo $documentRootBSlash; ?>/include/php/omffgfri.php?firm_id=<?php echo $firm_id; ?>" 
                                                         alt="" class="<?php echo $imageClass; ?>" />
                                                </td>
                                            <?php } ?>
                                            <?php
//                                            $fieldName = 'userName';
//                                            parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                            $userNamefontsize = $userName_size;
                                            if ($user_fname != NULL && $userName_check == 'true') {
//                                                $fieldName = 'userNameLb';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                ?>

                                                <tr>
                                                    <td valign="middle" align="center" class="ff_calibri">
                                                        <div class="spaceRight5" style="font-size:<?php echo $userNamefontsize; ?>px;">
                                                <?php
                                                if ($user_fname != 'EBILL') {
                                                    //
                                                    if ($user_lname != '' || $user_father_name != '')
                                                        echo '<b>' . om_strtoupper($user_fname . ' ' . $user_lname) . '</b>';
                                                    else
                                                        echo '<b>' . om_strtoupper($user_fname) . '</b>';
                                                }
                                                ?>
                                                        </div>
                                                    </td> 
                                                </tr> <?php } ?> 
                                                        <?php
                                                        $fLetter = $user_father_name[0];
                                                        if ($fLetter == 'S' || $fLetter == 'F') {
//                                                $fieldName = 'userSo';
//
//                                                parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                            $fatherNamefontsize = $userSo_size;
                                                            if ($user_father_name != '' && $userSo_check == 'true') {
//                                                    $fieldName = 'userSoLb';
//                                                    parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                                ?>
                                                    <tr >


                                                        <td valign="middle" align="center" class="ff_calibri" style="border:0px solid;font-size:<?php echo $fatherNamefontsize; ?>px;">
                                                            <div   class="spaceRight5"><?php echo om_strtoupper(substr($user_father_name, 1)); ?>
                                                            </div>
                                                        </td> 
                                                    </tr>

                <?php
            }
        }
        ?>
                                            <!--END SON OF-->
                                            <!--START DAUGHTER OF-->
                                            <?php
                                            $fLetter = $user_father_name[0];
                                            if ($fLetter == 'D') {
//                                                $fieldName = 'userDo';
//
//                                                parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                $fatherNamefontsize = $userDo_size;
                                                if ($user_fname != NULL && $userDo_check == 'true') {
//                                                    $fieldName = 'userDoLb';
//                                                    parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                    ?>
                                                    <tr>



                                                        <td valign="middle" align="center" class="ff_calibri" style="font-size:<?php echo $fatherNamefontsize; ?>px;">
                                                            <div   class="spaceRight5"><?php echo om_strtoupper(substr($user_father_name, 1)); ?>
                                                            </div>
                                                        </td> 
                                                    </tr>
                <?php
            }
        }
        ?>
                                            <!--END DAUGHTER OF-->
                                            <!--START WIFE OF-->
                                            <?php
                                            $fLetter = $user_father_name[0];
                                            if ($fLetter == 'W') {
//                                                $fieldName = 'userWo';
//
//                                                parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                $fatherNamefontsize = $userWo_size;
                                                if ($user_fname != NULL && $userWo_check == 'true') {
//                                                    $fieldName = 'userWoLb';
//                                                    parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                    ?>
                                                    <tr>



                                                        <td valign="middle" align="center" class="ff_calibri" style="font-size:<?php echo $fatherNamefontsize; ?>px;">
                                                            <div class="spaceRight5"><?php echo om_strtoupper(substr($user_father_name, 1)); ?>
                                                            </div>
                                                        </td> 
                                                    </tr>
                <?php
            }
        }
        ?>
                                            <!--END WIFE OF-->
                                            <!--START GUARDIAN OF-->
                                            <?php
                                            $fLetter = $user_father_name[0];
                                            if ($fLetter == 'C') {
//                                                $fieldName = 'userCo';
//                                                parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                $fatherNamefontsize = $userCo_size;
                                                if ($user_fname != NULL && $userCo_check == 'true') {
//                                                    $fieldName = 'userCoLb';
//                                                    parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                                                    ?>
                                                    <tr>



                                                        <td valign="middle" align="center" class="ff_calibri" style="font-size:<?php echo $fatherNamefontsize; ?>px;">
                                                            <div class="spaceRight5"><?php echo om_strtoupper(substr($user_father_name, 1)); ?>
                                                            </div>
                                                        </td> 
                                                    </tr>
                <?php
            }
        }
        ?>
        <?php
//                                            $fieldName = 'userAddress';
//                                            parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        $addresssize = $userAddress_size;
        if ($userAddress_check == 'true') {
//                                                $fieldName = 'userAddressLb';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
            ?>
                                                <tr>



                                                    <td valign="middle" align="center" class="ff_calibri" style="border:0px solid;">


            <?php if ($user_add != '') { ?>                    
                                                            <div title="<?php echo om_strtoupper($user_add); ?>" style="border:0px solid;width:250px;">
                <?php
//                                                                $fieldName = 'userAddress';
//                                                                parse_str(getTableValues("SELECT label_field_font_size,label_field_font_color,label_field_check FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
                ?> 
                                                                <div class="ff_calibri font_color_<?php echo $userAddress_color; ?>" style="font-size:<?php echo $userAddress_size; ?>px" onClick="this.contentEditable = 'true';">
                                                            <?php echo om_strtoupper($user_add); ?>



                                                            <?php } if ($user_city != '' || $user_pincode != '') { ?>

                                                                    <?php echo om_strtoupper($user_city . ', ' . $user_pincode); ?>

            <?php } if ($user_state != '' || $user_country != '') { ?>
                <?php echo om_strtoupper($user_state . ', ' . $user_country); ?></span>
                                                                <?php }
                                                                ?>
                                                            </div>
                                                        </div>




                                                    </td>
                                                </tr>
        <?php } ?>      
        <?php
//                                            $fieldName = 'userContact';
//                                            parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        $usercontactSize = $luserContact_size;
        if ($user_mobile != NULL && $userContact_check == 'true') {
//                                                $fieldName = 'userContactLb';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
            ?>

                                                <tr>


                                                    <td valign="middle" align="center"  class="ff_calibri" style="font-size:<?php echo $usercontactSize; ?>px;">
                                                        <div class="spaceRight5"><span class="itemAddPnLabels12Arial font_color_<?php echo $userContactLb_color; ?>" style="font-size:<?php echo $userContactLb_size; ?>px"><?php echo $userContactLb_content; ?> :</span> <span><?php echo $user_mobile; ?></span>
                                                        </div>
                                                    </td> 
                                                </tr>
        <?php } ?>

        <?php
//                                            $fieldName = 'userPan';
//                                            parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        if ($user_pan_it_no != '' && $userPan_check == 'true') {
//                                                $fieldName = 'userPanLb';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
            ?>

                                                <tr>
                                                    <td valign="middle" align="center"  class="ff_calibri">
                                                        <div class="spaceRight5"><span class="itemAddPnLabels12Arial font_color_<?php echo $userPanLb_color; ?>" style="font-size:<?php echo $userPanLb_size; ?>px"><?php echo $userPanLb_content; ?> :</span>
                                                            <span><?php echo $user_pan_it_no; ?></span>
                                                        </div>
                                                    </td> 
                                                </tr>
        <?php } ?>

        <?php
//                                            $fieldName = 'userGstIn';
//                                            parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        if ($user_cst_no != '' && $userGstIn_check == 'true') {
//                                                $fieldName = 'userGstInLb';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
            ?>

                                                <tr>
                                                    <td valign="middle" align="center"  class="ff_calibri">
                                                        <div class="spaceRight5"><span class="itemAddPnLabels12Arial font_color_<?php echo $userGstInLb_color; ?>" style="font-size:<?php echo $userGstInLb_size; ?>px"><?php echo $userGstInLb_content; ?>:</span>
                                                            <span><?php echo $user_cst_no; ?></span>
                                                        </div>
                                                    </td> 
                                                </tr>
        <?php } ?>
        <?php
//                                            $fieldName = 'userAdhaar';
//                                            parse_str(getTableValues("SELECT label_field_check,label_field_font_size FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
        if ($user_adhaar_card != '' && $userAdhaar_check == 'true') {
//                                                $fieldName = 'userAdhaarLb';
//                                                parse_str(getTableValues("SELECT label_field_content,label_field_font_size,label_field_font_color FROM labels WHERE label_own_id = '$sessionOwnerId' and label_field_name = '$fieldName' and label_type = '$labelType'"));
            ?>

                                                <tr>


                                                    <td valign="middle" align="center"  class="ff_calibri">
                                                        <div class="spaceRight5"><span class="itemAddPnLabels12Arial font_color_<?php echo $userAdhaarLb_color; ?>" style="font-size:<?php echo $userAdhaarLb_size; ?>px"><?php echo $luserAdhaarLb_content; ?>:</span>
                                                            <span><?php echo $user_adhaar_card; ?></span>
                                                        </div>
                                                    </td> 
                                                </tr>
        <?php } ?>

                                        </table>
                                    </td>
                                    <?php //  }   ?>
                                    <!--END FIRM DETAILS-->

                                        <?php } ?>
                            </tr>
<?php }
?>
                        <!--END CENTER INVOICE LAYOUT-->

                    </table>
                </td>
                </tr>
                        <?php /* header end */ ?>
