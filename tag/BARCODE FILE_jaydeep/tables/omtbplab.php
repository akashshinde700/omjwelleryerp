<?php

/*
 * **************************************************************************************
 * @tutorial: Labels
 * **************************************************************************************
 * 
 * Created on Dec 22, 2016
 *
 * @FileName: omtbplab.php
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
?>
<?php
/*
 * Optimized MetalPurchase Labels
 * Strategy: Batch Insert for Speed
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
// METAL PURCHASE LABELS CONFIGURATION
// ---------------------------------------------------------------------
$metalPurchaseData = array(
    array('firmPurFormHeader', '', '22', 'blue', 'true'),
    array('firmPurLongName', '', '20', 'brightBlue', 'true'),
    array('firmPurDesc', '', '16', 'blue', 'true'),
    array('firmPurRegNoLabel', 'FIRM REGISTRATION NUMBER', '16', 'lightBlue', 'true'),
    array('firmPurRegNo', '', '16', 'lightBlue', 'true'),
    array('firmPurAddress', '', '16', 'lightBlue', 'true'),
    array('firmPurPhone', 'PHONE', '14', 'lightBlue', 'true'),
    array('firmPurEmail', 'EMAIL', '14', 'lightBlue', 'true'),
    array('firmPurLeftLogoCheck', '', '', '', 'true'),
    array('firmPurRightLogoCheck', '', '', '', 'true'),
    array('firmPurTinLb', 'TIN', '14', 'black', 'true'),
    array('firmPurTin', '', '14', 'black', 'true'),
    array('firmPurPanLb', 'PAN', '14', 'black', 'true'),
    array('firmPurPan', '', '14', 'black', 'true'),
    array('userPurNameLb', 'NAME', '14', 'black', 'true'),
    array('userPurName', '', '14', 'black', 'true'),
    array('userPurAddressLb', 'ADDRESS', '14', 'black', 'true'),
    array('userPurAddress', '', '14', 'black', 'true'),
    array('userPurContactLb', 'PHONE', '14', 'black', 'true'),
    array('userPurContact', '', '14', 'black', 'true'),
    array('invPurNoTitleLb', 'INVOICE NO', '14', 'black', 'true'),
    array('invPurNoTitle', '', '14', 'black', 'true'),
    array('datePurTitleLb', 'DATE', '14', 'black', 'true'),
    array('datePurTitle', '', '14', 'black', 'true'),
    array('invPurTitle', 'CASH INVOICE', '14', 'blue', 'true'),
    array('itemPurIdLb', 'IT ID', '14', 'white', 'true'),
    array('designPurLb', 'DESIGN', '14', 'white', 'true'),
    array('itemPurDescLb', 'DESC', '14', 'white', 'true'),
    array('itemPurGsWtLb', 'GS WT', '14', 'white', 'true'),
    array('itemPurNtWtLb', 'NT WT', '14', 'white', 'true'),
    array('valPurAddedLb', 'VA WT', '14', 'white', 'true'),
    array('metalPurRateLb', 'RATE', '14', 'white', 'true'),
    array('labourPurLb', 'LABOUR', '14', 'white', 'true'),
    array('valPurLb', 'VAL', '14', 'white', 'true'),
    array('taxPurLb', 'TAX', '14', 'white', 'true'),
    array('valPurAddedAmtLb', 'VAL ADD', '14', 'white', 'true'),
    array('amtPurLb', 'AMOUNT', '14', 'white', 'true'),
    array('itemPurId', '', '14', 'black', 'true'),
    array('designPur', '', '14', 'black', 'true'),
    array('itemPurDesc', '', '14', 'black', 'true'),
    array('itemPurGsWt', '', '14', 'black', 'true'),
    array('itemPurNtWt', '', '14', 'black', 'true'),
    array('valPurAdded', '', '14', 'black', 'true'),
    array('metalPurRate', '', '14', 'black', 'true'),
    array('labourPur', '', '14', 'black', 'true'),
    array('valPur', '', '14', 'black', 'true'),
    array('taxPur', '', '14', 'black', 'true'),
    array('valPurAddedAmt', '', '14', 'black', 'true'),
    array('amtPur', '', '14', 'black', 'true'),
    array('totalPurLb', 'TOTAL', '14', 'black', 'true'),
    array('totalPur', '', '14', 'black', 'true'),
    array('metalPurRecLb', 'METAL RECEIVED', '14', 'black', 'true'),
    array('metalPurRec', '', '14', 'black', 'true'),
    array('cashPurPaidLb', 'CASH PAID', '14', 'black', 'true'),
    array('cashPurPaid', '', '14', 'black', 'true'),
    array('discPurLb', 'DISCOUNT', '14', 'black', 'true'),
    array('discPur', '', '14', 'black', 'true'),
    array('totalPurBalLb', 'TOTAL BAL', '14', 'black', 'true'),
    array('totalPurBal', '', '14', 'black', 'true'),
    array('finPurBalLb', 'TOTAL', '14', 'black', 'true'),
    array('finPurBal', '', '14', 'black', 'true'),
    array('tncPurLb', 'Terms and Conditions', '14', 'black', 'true'),
    array('tncPur', 'All disputes are subject to the jurisdiction of the competent courts in Delhi.', '14', 'black', 'true'),
    array('authPurSignLb', 'Authorized Signatory', '14', 'black', 'true'),
    array('footerPur', 'Thank You For Your Business!', '14', 'black', 'true'),
    array('slPrPurValueAddedOp', 'byAmount', '', '', 'true'),
    array('udhaarPurEMI', '', '14', 'black', 'true'),
    array('udhaarPurEMILb', 'TOT UDHAAR EMI AMT', '14', 'black', 'true'),
    array('rawMetalPurWt', 'METAL', '14', 'black', 'true'),
    array('rawPurMetalTnch', 'TUNCH', '14', 'black', 'true'),
    array('rawPurMetalFnWt', 'FN WT', '14', 'black', 'true'),
    array('rawPurMetalRt', 'RATE', '14', 'black', 'true')
);

// EXECUTE
insertLabelsBatch($conn, $ownerId, 'MetalPurchase', $metalPurchaseData);

?>