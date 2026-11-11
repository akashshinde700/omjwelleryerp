<?php

/*
 * **************************************************************************************
 * @Description: STOCK TABLES CREATION FILE
 * **************************************************************************************
 *
 * Created on Dec 24, 2015 12:31:32 PM
 *
 * @FileName: ogtbstock.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: 2
 * @version 1.0.1
 * @Copyright (c) 2015 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2015 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 * 
 * Project Name: Online Munim ERP Accounting Software 1.0.0
 * Version: 1.0.0
 * Website: http://www.omunim.com/
 * Contact: info@omunim.com
 * Follow: www.twitter.com/omunim
 * Like: www.facebook.com/omunim
 * Purchase: http://www.omunim.com/buy.html
 * License: You must have a valid license purchased only from Online Munim.
 */
?>
<?php

$sqlTable = 'DESC stock;';
mysqli_query($conn, $sqlTable);
if (mysqli_errno($conn) == 1146) {
    include 'tables/ogtbitst.php';
}
//
//
$sqlTable = 'DESC stock_temp;';
mysqli_query($conn, $sqlTable);
if (mysqli_errno($conn) == 1146) {
    $query = mysqli_query($conn, "SHOW COLUMNS FROM stock LIKE 'stoc_id'");
    $columnExists = (mysqli_num_rows($query)) ? TRUE : FALSE;
    if ($columnExists) {
        mysqli_query($conn, "RENAME  TABLE stock TO stock_temp;") or die(mysqli_error($conn));
        include 'tables/ogtbitst.php';
    }
}
//
// Added for stock_transaction table @PRIYANKA 20-05-17
$sqlTable = 'DESC stock_transaction;';
mysqli_query($conn, $sqlTable);
if (mysqli_errno($conn) == 1146) {
    include 'tables/omstoctrans.php';
}
//
// Added for stock_transaction_invoice table @PRIYANKA 20-05-17
//$sqlTable = 'DESC stock_transaction_invoice;';
//mysqli_query($conn, $sqlTable);
//if (mysqli_errno($conn) == 1146) {
//    include 'tables/omstoctransinv.php';
//}
?>