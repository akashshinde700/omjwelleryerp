<?php
/*
 * **************************************************************************************
 * @tutorial: Get sell item preid
 * **************************************************************************************
 *
 * Created on 12 JUNE, 2020 
 *
 * @FileName: omselpreid.php
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
$currentFileName = basename(__FILE__);
include 'system/omsachsc.php';
require_once 'system/omsgeagb.php';

require_once 'system/omssopin.php';

$custItemId = trim($_REQUEST['itemPreId']);
$panelName = trim($_REQUEST['panelName']);
$payPanelName = $_GET['payPanelName'];
//echo '$payPanelName='.$payPanelName.'<br>';
//echo '$panelName='.$panelName;
//
//CONDITION ADD FOR CRYSTAL SELL PANEL : AUTHOR @ DARSHANA 31 AUG 2021
if ($payPanelName == 'CrySellPayment') {
    $style = "margin-left: 440px; margin-top: 30px;";
} else if ($payPanelName == 'StrlleringSell') {
    $style = "margin-left: 440px; margin-top: 30px;";
} else {
    $style = "margin-left: 230px; margin-top: 30px;";
}
if (isset($_GET['selFirmId'])) {
    $selFirmId = $_GET['selFirmId'];
} else {
//if not selected assign session firm @AUTHOR: SANDY10JUL13
    $selFirmId = $_SESSION['setFirmSession'];
}
if ($_SESSION['sessionIgenType'] == $globalOwnPass) {
    $qSelFirmCount = "SELECT firm_id FROM firm where firm_type='Public' and firm_own_id='$_SESSION[sessionOwnerId]' $sessionFirmStr";
} else if ($_SESSION['sessionIgenType'] == $globalOwnIPass) {
    $qSelFirmCount = "SELECT firm_id,firm_name,firm_type FROM firm where firm_own_id='$_SESSION[sessionOwnerId]' $sessionFirmStr order by firm_since desc";
}
if ($selFirmId == NULL || $selFirmId == '' || $selFirmId == 'NotSelected') {
    $resFirmCount = mysqli_query($conn, $qSelFirmCount);
    $strFrmId = '0';
//Set String for Public Firms
    while ($rowFirm = mysqli_fetch_array($resFirmCount, MYSQLI_ASSOC)) {
        $strFrmId = $strFrmId . ",";
        $strFrmId = $strFrmId . "$rowFirm[firm_id]";
    }
} else {
    $strFrmId = $selFirmId;
}
////CONDITION ADD FOR CRYSTAL SELL PANEL : AUTHOR @ DARSHANA 31 AUG 2021
//
$qSelBrcode = "SELECT DISTINCT sttr_item_code FROM stock_transaction where sttr_owner_id='$_SESSION[sessionOwnerId]' "
        . "and sttr_indicator IN ('stock','AddInvoice') AND (sttr_melting_status != 'RFM' OR sttr_melting_status IS NULL)"
        . "and sttr_transaction_type IN ('EXISTING','PURONCASH','PURBYSUPP','TAG') AND sttr_ref_invoice_no IS NULL "
        . "and sttr_gs_weight != 0 and sttr_status NOT IN ('SOLDOUT','DELETED','NotDelFromStock') "
        . "and CONCAT(sttr_barcode_prefix,sttr_barcode)='$custItemId' "
        . "and sttr_firm_id IN ($strFrmId)order by sttr_id DESC LIMIT 0, 10";

//if ($_SESSION['sessionUserId'] == 'vermajeweller')
//    echo '<br/>$qSelPreId : ' . $qSelPreId;
//die;
$resBarcode = mysqli_query($conn, $qSelBrcode);
$totalBarCode = mysqli_num_rows($resBarcode);
//
//if ($_SESSION['sessionUserId'] == 'vermajeweller')
//    echo '<br/>$totalBarCode: ' . $totalBarCode;
//
if ($totalBarCode <= 0) {
    //
    if ($payPanelName == 'CrySellPayment') {
        $qSelPreId = "SELECT DISTINCT sttr_item_code FROM stock_transaction where sttr_owner_id='$_SESSION[sessionOwnerId]' "
                . "and sttr_indicator IN ('crystal') "
                . "and sttr_transaction_type IN ('EXISTING','PURONCASH','PURBYSUPP','TAG') "
                . "and sttr_gs_weight != 0 and sttr_status NOT IN ('SOLDOUT','DELETED','NotDelFromStock') "
                . "and sttr_item_code LIKE '$custItemId%' and sttr_firm_id IN ($strFrmId)order by sttr_id DESC";
    } else if ($payPanelName == 'StrlleringSell') {
    $qSelPreId = "SELECT DISTINCT sttr_item_code FROM stock_transaction 
        WHERE sttr_owner_id = '$_SESSION[sessionOwnerId]' 
        AND sttr_indicator IN ('strsilver') 
        AND sttr_transaction_type IN ('EXISTING','PURONCASH','PURBYSUPP','TAG') 
        AND sttr_status NOT IN ('SOLDOUT','DELETED','NotDelFromStock') 
        AND sttr_item_code LIKE '$custItemId%' 
        AND sttr_firm_id IN ($strFrmId) 
        ORDER BY sttr_id DESC 
        LIMIT 0, 10";
}
 else {
         $qSelPreId = "SELECT DISTINCT sttr_item_code FROM stock_transaction where sttr_owner_id='$_SESSION[sessionOwnerId]' "
                . "and sttr_indicator IN ('stock','AddInvoice') AND (sttr_melting_status != 'RFM' OR sttr_melting_status IS NULL)"
                . "and sttr_transaction_type IN ('EXISTING','PURONCASH','PURBYSUPP','TAG') AND sttr_ref_invoice_no IS NULL "
                . "and sttr_gs_weight != 0 and sttr_status NOT IN ('SOLDOUT','DELETED','NotDelFromStock') "
                . "and sttr_item_code LIKE '$custItemId%' "
                . "and sttr_firm_id IN ($strFrmId)order by sttr_id DESC LIMIT 0, 11";
    }

    $resPreId = mysqli_query($conn, $qSelPreId);
    $totalPreId = mysqli_num_rows($resPreId);
//
//    if ($_SESSION['sessionUserId'] == 'vermajeweller')
//        echo '<br/>$qSelPreId2 : ' . $qSelPreId;
}

if ($totalPreId > 0) {
    ?>
    <SELECT class="cityListDivToAddNewCustSelect SelectStyle" id="sellItemPreIdSelect" name="sellItemPreIdSelect "
            "
            onKeyDown="if (event.keyCode == 13) {
                            document.getElementById('srchItemId').value = this.value;
                            searchSellItemPreIdForPanelBlank();
                            document.getElementById('srchItemId').focus();
                        }"
            onclick="document.getElementById('srchItemId').value = this.value;
                        searchSellItemPreIdForPanelBlank();
                        document.getElementById('srchItemId').focus();"
            multiple="multiple" size="8">
                <?php
                while ($row = mysqli_fetch_array($resPreId, MYSQLI_ASSOC)) {
                $sttr_id = $row['sttr_id']; 
                $queryTotalReturn = "SELECT SUM(sttr_gs_weight) as totalreturn FROM stock_transaction WHERE sttr_sttr_id = $sttr_id AND sttr_indicator = 'PurchaseReturn'";
                $resTotalReturn = mysqli_query($conn, $queryTotalReturn);
                $rowTotalReturn = mysqli_fetch_array($resTotalReturn, MYSQLI_ASSOC);
                if($rowTotalReturn['totalreturn'] !=$row['sttr_gs_weight'] || $row['sttr_gs_weight'] == null){
                    echo "<OPTION  VALUE=" . "\"{$row['sttr_item_code']}\"" . " class=" . "\"content-mess-maron\"" . " >{$row['sttr_item_code']}</OPTION>";
                }
                }
                ?>
    </select>
    <?php
} else if ($totalBarCode > 0) {
    echo 'BarCodeNoFound';
}
?>