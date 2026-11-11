<?php
/*
 * **************************************************************************************
 * @tutorial: Labels
 * **************************************************************************************
 * 
 * Created on Created on Dec 22, 2016
 *
 * @FileName: omtbclab.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: 2
 * @version 1.0.1
 * @Copyright (c) 2013 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2013 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 */

if ($ownerId == '') {
    $ownerId = isset($dgGUId) ? $dgGUId : '';
}
if ($ownerId == '') {
    $ownerId = isset($_SESSION['sessionOwnerId']) ? $_SESSION['sessionOwnerId'] : '';
}
if ($ownerId == '') {
    $ownerId = isset($_SESSION['sessiondgGUId']) ? $_SESSION['sessiondgGUId'] : '';
}

// ---------------------------------------------------------------------
// HELPER FUNCTION (Ensure this exists in your scope or include it)
// ---------------------------------------------------------------------
if (!function_exists('insertLabelsBatch')) {

    function insertLabelsBatch($conn, $ownerId, $labelType, $dataArray) {
        $checkSql = "SELECT label_id FROM labels WHERE label_own_id = '$ownerId' AND label_type = '$labelType' LIMIT 1";
        $result = mysqli_query($conn, $checkSql);

        if (mysqli_num_rows($result) == 0) {
            $values = array();
            foreach ($dataArray as $row) {
                $field = mysqli_real_escape_string($conn, $row[0]);
                $content = mysqli_real_escape_string($conn, $row[1]);
                $size = isset($row[2]) ? $row[2] : '';
                $color = isset($row[3]) ? $row[3] : '';
                $check = isset($row[4]) ? $row[4] : '';

                $values[] = "('$ownerId', '$labelType', '$field', '$content', '$size', '$color', '', '$check')";
            }

            if (!empty($values)) {
                $sql = "INSERT INTO labels (label_own_id, label_type, label_field_name, label_field_content, label_field_font_size, label_field_font_color, label_field_font_weight, label_field_check) VALUES " . implode(',', $values);
                if (!mysqli_query($conn, $sql)) {
                    die("Error Inserting $labelType: " . mysqli_error($conn));
                }
            }
        }
    }

}

// ---------------------------------------------------------------------
// SHARED DATA STRUCTURE (Used for both MetalSell & APPROVAL)
// ---------------------------------------------------------------------
$sellLabels = array(
    array('firmFormHeader', '', '22', 'blue', 'true'),
    array('firmLongName', '', '20', 'brightBlue', 'true'),
    array('firmDesc', '', '16', 'blue', 'true'),
    array('firmRegNoLabel', 'FIRM REGISTRATION NUMBER', '16', 'lightBlue', 'true'),
    array('firmRegNo', '', '16', 'lightBlue', 'true'),
    array('firmAddress', '', '16', 'lightBlue', 'true'),
    array('firmPhone', 'PHONE', '14', 'lightBlue', 'true'),
    array('firmEmail', 'EMAIL', '14', 'lightBlue', 'true'),
    array('firmLeftLogoCheck', '', '', '', 'true'),
    array('firmRightLogoCheck', '', '', '', 'true'),
    array('firmTinLb', 'TIN', '14', 'black', 'true'),
    array('firmTin', '', '14', 'black', 'true'),
    array('firmPanLb', 'PAN', '14', 'black', 'true'),
    array('firmPan', '', '14', 'black', 'true'),
    array('userNameLb', 'NAME', '14', 'black', 'true'),
    array('userName', '', '14', 'black', 'true'),
    array('userAddressLb', 'ADDRESS', '14', 'black', 'true'),
    array('userAddress', '', '14', 'black', 'true'),
    array('userContactLb', 'PHONE', '14', 'black', 'true'),
    array('userContact', '', '14', 'black', 'true'),
    array('invNoTitleLb', 'INVOICE NO', '14', 'black', 'true'),
    array('invNoTitle', '', '14', 'black', 'true'),
    array('dateTitleLb', 'DATE', '14', 'black', 'true'),
    array('dateTitle', '', '14', 'black', 'true'),
    array('invTitle', 'CASH INVOICE', '14', 'blue', 'true'),
    array('itemIdLb', 'IT ID', '14', 'black', 'true'),
    array('designLb', 'DESIGN', '14', 'black', 'true'),
    array('itemDescLb', 'DESC', '14', 'black', 'true'),
    array('itemGsWtLb', 'GS WT', '14', 'black', 'true'),
    array('itemNtWtLb', 'NT WT', '14', 'black', 'true'),
    array('valAddedLb', 'VA WT', '14', 'black', 'true'),
    array('metalRateLb', 'RATE', '14', 'black', 'true'),
    array('labourLb', 'LABOUR', '14', 'black', 'true'),
    array('valLb', 'VAL', '14', 'black', 'true'),
    array('taxLb', 'TAX', '14', 'black', 'true'),
    array('valAddedAmtLb', 'VAL ADD', '14', 'black', 'true'),
    array('amtLb', 'AMOUNT', '14', 'black', 'true'),
    array('itemId', '', '14', 'black', 'true'),
    array('design', '', '14', 'black', 'true'),
    array('itemDesc', '', '14', 'black', 'true'),
    array('itemGsWt', '', '14', 'black', 'true'),
    array('itemNtWt', '', '14', 'black', 'true'),
    array('valAdded', '', '14', 'black', 'true'),
    array('metalRate', '', '14', 'black', 'true'),
    array('labour', '', '14', 'black', 'true'),
    array('val', '', '14', 'black', 'true'),
    array('tax', '', '14', 'black', 'true'),
    array('valAddedAmt', '', '14', 'black', 'true'),
    array('amt', '', '14', 'black', 'true'),
    array('totalLb', 'TOTAL', '14', 'black', 'true'),
    array('total', '', '14', 'black', 'true'),
    array('metalRecLb', 'METAL RECEIVED', '14', 'black', 'true'),
    array('metalRec', '', '14', 'black', 'true'),
    array('cashPaidLb', 'CASH PAID', '14', 'black', 'true'),
    array('cashPaid', '', '14', 'black', 'true'),
    array('discLb', 'DISCOUNT', '14', 'black', 'true'),
    array('disc', '', '14', 'black', 'true'),
    array('totalBalLb', 'TOTAL BAL', '14', 'black', 'true'),
    array('totalBal', '', '14', 'black', 'true'),
    array('finBalLb', 'TOTAL', '14', 'black', 'true'),
    array('finBal', '', '14', 'black', 'true'),
    array('tncLb', 'Terms and Conditions', '14', 'black', 'true'),
    array('tnc', 'All disputes are subject to the jurisdiction of the competent courts in Delhi.', '14', 'black', 'true'),
    array('authSignLb', 'Authorized Signatory', '14', 'black', 'true'),
    array('footer', 'Thank You For Your Business!', '14', 'black', 'true'),
    array('slPrValueAddedOp', 'byAmount', '', '', 'true'),
    array('udhaarEMI', '', '14', 'black', 'true'),
    array('udhaarEMILb', 'TOT UDHAAR EMI AMT', '14', 'black', 'true'),
    array('rawMetalWt', 'METAL', '14', 'black', 'true'),
    array('rawMetalTnch', 'TUNCH', '14', 'black', ''),
    array('rawMetalFnWt', 'FN WT', '14', 'black', 'true'),
    array('rawMetalRt', 'RATE', '14', 'black', 'true'),
    array('settledInv', 'SETTLED INV', '14', 'black', 'true')
);

// ---------------------------------------------------------------------
// 1. INSERT MetalSell LABELS
// ---------------------------------------------------------------------
insertLabelsBatch($conn, $ownerId, 'MetalSell', $sellLabels);


// ---------------------------------------------------------------------
// 2. INSERT APPROVAL LABELS (Shares same data mostly, but different type)
// ---------------------------------------------------------------------
// We use the same $sellLabels array but change 'firmFormHeader' color to black as per your original file
// To keep it simple, we just clone and modify. Or just use the original list as it's very similar.
$approvalLabels = $sellLabels;
$approvalLabels[0][3] = 'black'; // Change firmFormHeader color to black

// Note: Your original APPROVAL list had extra fields compared to MetalSell. 
// I am merging the extra ones here:
$approvalExtras = array(
    array('userSoLb', 'FATHER NAME', '14', 'black', 'true'),
    array('userSo', '', '14', 'black', 'true'),
    array('userDoLb', 'MOTHER NAME', '14', 'black', 'true'),
    array('userDo', '', '14', 'black', 'true'),
    array('userWoLb', 'SPOUSE NAME', '14', 'black', 'true'),
    array('userWo', '', '14', 'black', 'true'),
    array('userCoLb', 'GUARDIAN NAME', '14', 'black', 'true'),
    array('userCo', '', '14', 'black', 'true'),
    array('userImtSoLb', 'FATHER NAME', '14', 'black', 'true'),
    array('userImtSo', '', '14', 'black', 'true'),
    array('userImtDoLb', 'FATHER NAME', '14', 'black', 'true'),
    array('userImtDo', '', '14', 'black', 'true'),
    array('userImtWoLb', 'SPOUSE NAME', '14', 'black', 'true'),
    array('userImtWo', '', '14', 'black', 'true'),
    array('userImtCoLb', 'GUARDIAN NAME', '14', 'black', 'true'),
    array('userImtCo', '', '14', 'black', 'true'),
    array('userPanLb', 'PAN', '14', 'black', 'true'),
    array('userPan', '', '14', 'black', 'true'),
    array('userGstInLb', 'GSTIN', '14', 'black', 'true'),
    array('userGstIn', '', '14', 'black', 'true'),
    array('userAdhaarLb', 'ADHAAR NO', '14', 'black', 'true'),
    array('userAdhaar', '', '14', 'black', 'true'),
    array('tableHeightLb', 'TABLE HEIGHT', '14', 'black', 'true'),
    array('tableHeight', '', '14', 'black', 'true'),
    array('cgstLb', 'CGST', '14', 'black', 'true'),
    array('cgstAmt', '', '14', 'black', ''),
    array('sgstLb', 'SGST', '14', 'black', 'true'),
    array('sgstAmt', '', '14', 'black', ''),
    array('igstLb', 'IGST', '14', 'black', 'true'),
    array('igstAmt', '', '14', 'black', ''),
    array('itemHSNLb', 'HSN', '14', 'black', 'true'),
    array('itemPktWtLb', 'PKT WT', '14', 'black', 'true'),
    array('itemProcessWtLb', 'PROCESS WT', '14', 'black', 'true'),
    array('itemQtyLb', 'QTY', '14', 'black', 'true'),
    array('itemQty', '', '14', 'black', 'true'),
    array('itemShapeLb', 'SHAPE', '14', 'black', 'true'),
    array('itemShape', '', '14', 'black', 'true'),
    array('itemSizeLb', 'SIZE', '14', 'black', 'true'),
    array('itemSize', '', '14', 'black', 'true'),
    array('hallmarkingChargesLb', 'HALLMARK CHARGES', '14', 'black', ''),
    array('hallmarkingCharges', 'HALLMARK CHARGES', '14', 'black', ''),
    array('hallmarkChrgsLb', 'HALLMARK CHARGES', '14', 'black', ''),
    array('hallmarkChrgs', 'HALLMARK CHARGES', '14', 'black', ''),
    array('brandName', '', '14', 'black', ''),
    array('unitPrice', '', '14', 'black', ''),
    array('itemHSN', '', '14', 'black', 'true'),
    array('itemPktWt', '', '14', 'black', ''),
    array('itemWSWt', '', '14', 'black', ''),
    array('itemProcessWt', '', '14', 'black', ''),
    array('labourVal', '', '14', 'black', ''),
    array('valAddedAmt', '', '14', 'black', ''),
    array('amtsLb', 'AMOUNT', '14', 'black', 'true'),
    array('amts', '', '14', 'black', 'true'),
    array('settleAmtLb', 'URD AMT', '12', 'black', 'true'),
    array('settleAmt', '', '14', 'black', ''),
    array('mkgChrgLb', 'MAKING CHARGE', '14', 'black', 'true'),
    array('mkgChrg', '', '14', 'black', 'true'),
    array('jRecCourierChgsAmtLb', 'COURIER CHARGES', '12', 'black', 'true'),
    array('jRecCourierChgsAmt', '', '14', 'black', 'true'),
    array('jRecCashLb', 'CASH RECEIVED', '12', 'black', 'true'),
    array('jRecCash', '', '14', 'black', 'true'),
    array('jRecCheqLb', 'CHEQUE RECEIVED', '12', 'black', 'true'),
    array('jRecCheq', '', '14', 'black', 'true'),
    array('jRecCardLb', 'CARD RECEIVED', '12', 'black', 'true'),
    array('jRecCard', '', '14', 'black', 'true'),
    array('jRecOnlinePayLb', 'ONLINE PAYMENT', '12', 'black', 'true'),
    array('jRecOnlinePay', '', '14', 'black', 'true'),
    array('jRecDiscLb', 'DISCOUNT', '12', 'black', 'true'),
    array('jRecDisc', '', '14', 'black', 'true'),
    array('imtRecCourierChgsAmtLb', 'COURIER CHARGES', '12', 'black', 'true'),
    array('imtRecCourierChgsAmt', '', '14', 'black', 'true'),
    array('imtRecCashLb', 'CASH RECEIVED', '12', 'black', 'true'),
    array('imtRecCash', '', '14', 'black', 'true'),
    array('imtRecCheqLb', 'CHEQUE RECEIVED', '12', 'black', 'true'),
    array('imtRecCheq', '', '14', 'black', 'true'),
    array('imtRecCardLb', 'CARD RECEIVED', '12', 'black', 'true'),
    array('imtRecCard', '', '14', 'black', 'true'),
    array('imtRecOnlinePayLb', 'ONLINE PAYMENT', '12', 'black', 'true'),
    array('imtRecOnlinePay', '', '14', 'black', 'true'),
    array('imtRecDiscLb', 'DISCOUNT', '12', 'black', 'true'),
    array('imtRecDisc', '', '14', 'black', 'true'),
    array('jCgstLb', 'CGST', '12', 'black', 'true'),
    array('jCgst', '', '14', 'black', 'true'),
    array('jSgstLb', 'SGST', '12', 'black', 'true'),
    array('jSgst', '', '14', 'black', 'true'),
    array('jIgstLb', 'IGST', '12', 'black', 'true'),
    array('jIgst', '', '14', 'black', 'true'),
    array('jMkgChrgCgstLb', 'MAKING CHRG CGST', '12', 'black', 'true'),
    array('jMkgChrgCgst', '', '14', 'black', ''),
    array('jMkgChrgSgstLb', 'MAKING CHRG SGST', '12', 'black', 'true'),
    array('jMkgChrgSgst', '', '14', 'black', ''),
    array('jMkgChrgIgstLb', 'MAKING CHRG IGST', '12', 'black', 'true'),
    array('jMkgChrgIgst', '', '14', 'black', ''),
    array('jOtherTaxAmtLb', 'OTHER TAX AMT', '12', 'black', 'true'),
    array('jOtherTaxAmt', '', '14', 'black', ''),
    array('jCourierChgsAmtLb', 'COURIER CHARGES', '12', 'black', 'true'),
    array('jCourierChgsAmt', '', '14', 'black', ''),
    array('jTotAmtLb', 'TOTAL AMOUNT', '12', 'black', 'true'),
    array('jTotAmt', '', '14', 'black', 'true'),
    array('imtCgstLb', 'CGST', '12', 'black', 'true'),
    array('imtCgst', '', '14', 'black', ''),
    array('imtSgstLb', 'SGST', '12', 'black', 'true'),
    array('imtSgst', '', '14', 'black', ''),
    array('imtIgstLb', 'IGST', '12', 'black', 'true'),
    array('imtIgst', '', '14', 'black', ''),
    array('imtMkgChrgCgstLb', 'MAKING CHRG CGST', '12', 'black', 'true'),
    array('imtMkgChrgCgst', '', '14', 'black', ''),
    array('imtMkgChrgSgstLb', 'MAKING CHRG SGST', '12', 'black', 'true'),
    array('imtMkgChrgSgst', '', '14', 'black', ''),
    array('imtMkgChrgIgstLb', 'MAKING CHRG IGST', '12', 'black', 'true'),
    array('imtMkgChrgIgst', '', '14', 'black', ''),
    array('imtOtherTaxAmtLb', 'OTHER TAX AMT', '12', 'black', 'true'),
    array('imtOtherTaxAmt', '', '14', 'black', ''),
    array('imtCourierChgsAmtLb', 'COURIER CHARGES', '12', 'black', 'true'),
    array('imtCourierChgsAmt', '', '14', 'black', ''),
    array('metalRecLb', 'METAL RECEIVED', '14', 'black', 'true'),
    array('metalRec', '', '14', 'black', 'true'),
    array('urdLessLb', 'URD LESS', '12', 'black', 'true'),
    array('urdLessAmt', '', '14', 'black', 'true'),
    array('cashPaidLb', 'CASH RECIEVED', '12', 'black', 'true'),
    array('cashPaid', '', '14', 'black', 'true'),
    array('discLb', 'DISCOUNT', '12', 'black', 'true'),
    array('disc', '', '14', 'black', 'true'),
    array('jRoundOffLb', 'ROUND OFF', '12', 'black', 'true'),
    array('jRoundOff', '', '14', 'black', 'true'),
    array('imtRoundOffLb', 'ROUND OFF', '12', 'black', 'true'),
    array('imtRoundOff', '', '14', 'black', 'true'),
    array('totalBalLb', 'TOTAL REC. AMOUNT', '12', 'black', 'true'),
    array('totalBal', '', '14', 'black', 'true'),
    array('finBalLb', 'AMT BALANCE', '14', 'black', 'true'),
    array('finBal', '', '14', 'black', 'true'),
    array('payableAmtLb', 'PAYABLE AMOUNT', '14', 'black', 'true'),
    array('payableAmt', '', '14', 'black', 'true'),
    array('finalPayableAmtLb', 'FINAL AMOUNT', '14', 'black', 'true'),
    array('finalPayableAmt', '', '14', 'black', 'true'),
    array('imtPayableAmtLb', 'PAYABLE AMOUNT', '14', 'black', 'true'),
    array('imtPayableAmt', '', '14', 'black', 'true'),
    array('imtFinalPayableAmtLb', 'FINAL AMOUNT', '14', 'black', 'true'),
    array('imtFinalPayableAmt', '', '14', 'black', 'true'),
    array('authCustSignLb', 'Customer Signatory', '14', 'black', 'true'),
    array('firmImtFormHeader', '', '22', 'black', 'true'),
    array('firmImtLongName', '', '20', 'black', 'true'),
    array('firmImtDesc', '', '16', 'black', 'true'),
    array('firmImtRegNoLabel', 'REGISTRATION NO', '16', 'black', 'true'),
    array('firmImtRegNo', '', '16', 'black', 'true'),
    array('firmImtAddress', '', '16', 'black', 'true'),
    array('firmImtPhone', 'PHONE', '14', 'black', 'true'),
    array('firmImtEmail', 'EMAIL', '14', 'black', 'true'),
    array('firmImtLeftLogoCheck', '', '', '', 'true'),
    array('firmImtRightLogoCheck', '', '', '', 'true'),
    array('firmImtTinLb', 'GSTIN', '14', 'black', 'true'),
    array('firmImtTin', '', '14', 'black', 'true'),
    array('firmImtPanLb', 'PAN', '14', 'black', 'true'),
    array('firmImtPan', '', '14', 'black', 'true'),
    array('userImtNameLb', 'NAME', '14', 'black', 'true'),
    array('userImtName', '', '14', 'black', 'true'),
    array('userImtAddressLb', 'ADDRESS', '14', 'black', 'true'),
    array('userImtAddress', '', '14', 'black', 'true'),
    array('userImtContactLb', 'PHONE', '14', 'black', 'true'),
    array('userImtContact', '', '14', 'black', 'true'),
    array('userImtPanLb', 'PAN', '14', 'black', 'true'),
    array('userImtPan', '', '14', 'black', 'true'),
    array('userImtGstinLb', 'GSTIN', '14', 'black', 'true'),
    array('userImtGstin', '', '14', 'black', 'true'),
    array('userImtAdhaarLb', 'ADHAAR NO', '14', 'black', 'true'),
    array('userImtAdhaar', '', '14', 'black', 'true'),
    array('invImtNoTitleLb', 'INVOICE NO', '14', 'black', 'true'),
    array('invImtNoTitle', '', '14', 'black', 'true'),
    array('dateImtTitleLb', 'DATE', '14', 'black', 'true'),
    array('dateImtTitle', '', '14', 'black', 'true'),
    array('dueDateTitleLb', 'DUE DATE', '14', 'black', ''),
    array('dueDateTitle', '', '14', 'black', ''),
    array('invImtTitle', 'CASH INVOICE', '14', 'blue', 'true'),
    array('itemImtIdLb', 'IT ID', '14', 'black', 'true'),
    array('designImtLb', 'DESIGN', '14', 'black', 'true'),
    array('itemImtDescLb', 'DESC', '14', 'black', 'true'),
    array('QTYLB', 'QTY', '14', 'black', 'true'),
    array('itemImtHSNLb', 'HSN', '14', 'black', 'true'),
    array('itemImtGsWtLb', 'GS WT', '14', 'black', 'true'),
    array('itemImtNtWtLb', 'NT WT', '14', 'black', 'true'),
    array('valImtAddedLb', 'VA WT', '14', 'black', 'true'),
    array('metalImtRateLb', 'RATE', '14', 'black', 'true'),
    array('labourImtLb', 'LABOUR', '14', 'black', 'true'),
    array('valImtLb', 'VAL', '14', 'black', 'true'),
    array('taxImtLb', 'TAX', '14', 'black', 'true'),
    array('cgstImtLb', 'CGST', '14', 'black', 'true'),
    array('sgstImtLb', 'SGST', '14', 'black', 'true'),
    array('igstImtLb', 'IGST', '14', 'black', 'true'),
    array('valImtAddedAmtLb', 'VAL ADD', '14', 'black', 'true'),
    array('amtImtLb', 'AMOUNT', '14', 'black', 'true'),
    array('itemImtId', '', '14', 'black', 'true'),
    array('designImt', '', '14', 'black', 'true'),
    array('itemImtDesc', '', '14', 'black', 'true'),
    array('itemImtHSN', '', '14', 'black', 'true'),
    array('itemImtGsWt', '', '14', 'black', 'true'),
    array('itemImtNtWt', '', '14', 'black', 'true'),
    array('metalImtRate', '', '14', 'black', 'true'),
    array('labourImt', '', '14', 'black', 'true'),
    array('valImt', '', '14', 'black', 'true'),
    array('taxImt', '', '14', 'black', 'true'),
    array('cgstImtAmt', '', '14', 'black', 'true'),
    array('sgstImtAmt', '', '14', 'black', 'true'),
    array('igstImtAmt', '', '14', 'black', 'true'),
    array('valImtAddedAmt', '', '14', 'black', 'true'),
    array('amtImt', '', '14', 'black', 'true'),
    array('totalImtLb', 'TOTAL', '12', 'black', 'true'),
    array('totalImt', '', '14', 'black', 'true'),
    array('totalFinImtLb', 'TOTAL FINAL AMT', '12', 'black', 'true'),
    array('totalFinImt', '', '14', 'black', 'true'),
    array('totalMkgImtLb', 'MAKING CHARGE', '12', 'black', 'true'),
    array('totalMkgImt', '', '14', 'black', 'true'),
    array('totalVatImtLb', 'OTHER TAX AMT', '12', 'black', 'true'),
    array('totalVatImt', '', '14', 'black', 'true'),
    array('metalImtRecLb', 'METAL RECEIVED', '12', 'black', 'true'),
    array('metalImtRec', '', '14', 'black', 'true'),
    array('cashImtPaidLb', 'CASH PAID', '12', 'black', 'true'),
    array('cashImtPaid', '', '14', 'black', 'true'),
    array('discImtLb', 'DISCOUNT', '12', 'black', 'true'),
    array('discImt', '', '14', 'black', 'true'),
    array('totalImtBalLb', 'TOTAL BAL', '12', 'black', 'true'),
    array('totalImtBal', '', '14', 'black', 'true'),
    array('finImtBalLb', 'TOTAL', '12', 'black', 'true'),
    array('finImtBal', '', '14', 'black', 'true'),
    array('tncImtLb', 'Terms and Conditions', '14', 'black', 'true'),
    array('tncImt', 'All disputes are subject to the jurisdiction of the competent courts in Delhi.', '14', 'black', 'true'),
    array('authImtSignLb', 'Authorized Signatory', '14', 'black', 'true'),
    array('authImtCustSignLb', 'Customer Signatory', '14', 'black', 'true'),
    array('authCryCustSignLb', 'Customer Signatory', '14', 'black', 'true'),
    array('hallmarkingChargesLb', 'HALLMARK CHARGES', '14', 'black', ''),
    array('hallmarkingCharges', 'HALLMARK CHARGES', '14', 'black', ''),
    array('hallmarkChrgsLb', 'HALLMARK CHARGES', '14', 'black', ''),
    array('hallmarkChrgs', 'HALLMARK CHARGES', '14', 'black', ''),
    array('footerImt', 'Thank You For Your Business!', '14', 'black', 'true')
);

$approvalLabels = array_merge($approvalLabels, $approvalExtras);

// Insert APPROVAL Labels
insertLabelsBatch($conn, $ownerId, 'APPROVAL', $approvalLabels);

// Run the update queries for APPROVAL specific fields
// This sets specific fields to unchecked as per your logic
$updateFields = array('itemPktWt', 'valAdded', 'DIM/STN (CT)', 'labour', 'labourVal');

foreach ($updateFields as $field) {
    $updSql = "UPDATE labels SET label_field_check='' WHERE label_field_name='$field' AND label_type='APPROVAL' AND label_own_id='$ownerId'";
    mysqli_query($conn, $updSql);
}


// ---------------------------------------------------------------------
// 3. INSERT ROUGH ESTIMATE LABELS
// ---------------------------------------------------------------------
// We reuse the list but change type to ROUGH_ESTIMATE
$roughEstimateData = $approvalLabels; // Using the extended list as a base
insertLabelsBatch($conn, $ownerId, 'ROUGH_ESTIMATE', $roughEstimateData);

// ---------------------------------------------------------------------
// 4. INSERT SUPPLIER INVOICE LABELS
// ---------------------------------------------------------------------
$suppInvoiceData = $approvalLabels; // Reuse again
insertLabelsBatch($conn, $ownerId, 'SUPPILER_INVOICE', $suppInvoiceData);

?>